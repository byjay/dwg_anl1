import type { PDFPageProxy } from 'pdfjs-dist';
import * as pdfjsLib from 'pdfjs-dist';
import {
  DiagramLoopEntry,
  DiscrepancySeverity,
  DrawingPinNote,
  EvaluatedLoopMatch,
  ParallelAnalyzeResponse,
  RuleViolationHit,
} from '../types/diagram';
import type { LocalPdfAuditResponse } from './localPdfAudit';
import { resolveLoopPdfTargets } from './diffEngine';

export interface PdfTextBox {
  str: string;
  xPct: number;
  yPct: number;
  leftPct: number;
  topPct: number;
  widthPct: number;
  heightPct: number;
}

export interface PdfLocateMatch {
  matchedTerm: string;
  str: string;
  xPct: number;
  yPct: number;
  leftPct: number;
  topPct: number;
  widthPct: number;
  heightPct: number;
  exact: boolean;
}

export type AiOverlaySource = 'GEMINI_AI' | 'LOCAL_SCAN' | 'RULE_ENGINE' | 'LOOP_DIFF';

export interface AiTextRegionCandidate {
  id: string;
  source: AiOverlaySource;
  tag: string;
  severity: DiscrepancySeverity;
  summary: string;
  recommendation: string;
  searchTerms: string[];
}

export interface AiTextRegionOverlay extends PdfLocateMatch {
  id: string;
  source: AiOverlaySource;
  tag: string;
  severity: DiscrepancySeverity;
  summary: string;
  recommendation: string;
}

function clampPct(value: number): number {
  return Math.max(2, Math.min(98, +value.toFixed(2)));
}

function stripParenthetical(raw: string): string {
  return raw.replace(/\([^)]*\)/g, '').trim();
}

/**
 * Builds prioritized search strings to locate the exact symbol/tag/cable/JB inside a PDF page.
 */
export function buildSearchTermsForLoop(
  loop: DiagramLoopEntry,
  side: 'LEFT' | 'RIGHT'
): string[] {
  const terms: string[] = [];
  const push = (v?: string) => {
    if (!v) return;
    const cleaned = stripParenthetical(v).trim();
    if (cleaned.length >= 3 && !terms.includes(cleaned)) {
      terms.push(cleaned);
    }
  };

  if (side === 'LEFT') {
    // Specific typo / GAR label first (e.g. "TI 131B", "G.W.Heater(E-201A)", "110-P-101A")
    if (loop.pid.rawTag.includes('Should be')) {
      const m = loop.pid.rawTag.match(/Should be\s+([A-Z0-9- ]+)/i);
      if (m) push(m[1]);
    }
    if (loop.gar?.equipmentLabelOnGar) {
      push(loop.gar.equipmentLabelOnGar);
      const eqMatch = loop.gar.equipmentLabelOnGar.match(/[A-Z0-9]+-[A-Z0-9-]+/i);
      if (eqMatch) push(eqMatch[0]);
    }
    push(loop.pid.rawTag);
    push(loop.canonicalTag);
    const shortCanonical = loop.canonicalTag.replace(/^(100|200|300|400)-/, '');
    push(shortCanonical);
    if (loop.gar?.tag) push(loop.gar.tag);
    if (loop.gar?.annotatedCableNo && !loop.gar.annotatedCableNo.includes('MISSING')) {
      for (const part of loop.gar.annotatedCableNo.split('/')) {
        push(part);
      }
    }
    push(loop.equipmentTag);
    return terms;
  }

  // RIGHT side (iCAMS / PSDS / fallback GAR)
  for (const d of loop.knownDiscrepancies || []) {
    const tagMatches = d.title.match(/\b\d{3}-[A-Z0-9/-]+|\b[RH]C\d{4,5}\b|\b[A-Z]{1,4}-\d{3}[A-Z]?\b/g);
    if (tagMatches) {
      for (const m of tagMatches) push(m);
    }
    const descMatches = d.description.match(/\b\d{3}-[A-Z0-9/-]+|\b[RH][CSEV]\d{4,5}\b/g);
    if (descMatches) {
      for (const m of descMatches) {
        if (m !== loop.canonicalTag) push(m);
      }
    }
  }

  for (const ep of loop.electricalPaths) {
    if (ep.blockDiagramTagNote) {
      const noteTags = ep.blockDiagramTagNote.match(/\b\d{3}-[A-Z0-9/-]+/g);
      if (noteTags) {
        for (const nt of noteTags) {
          if (nt !== loop.canonicalTag) push(nt);
        }
      }
    }
    for (const part of ep.electricalTag.split('/')) {
      push(part);
    }
    if (
      ep.fieldCableNo &&
      !ep.fieldCableNo.includes('MISSING') &&
      !ep.fieldCableNo.includes('****')
    ) {
      for (const c of ep.fieldCableNo.split('/')) {
        push(c);
      }
    }
    push(ep.junctionBox);
  }

  push(loop.canonicalTag);
  push(loop.canonicalTag.replace(/^(100|200|300|400)-/, ''));
  push(loop.equipmentTag);
  return terms;
}

function findSingleBoxMatch(
  normalizedBoxes: Array<{ box: PdfTextBox; upper: string }>,
  rawTerm: string,
  usedKeys?: Set<string>
): PdfLocateMatch | null {
  const term = rawTerm.trim().toUpperCase();
  if (term.length < 3) return null;

  const boxKey = (b: PdfTextBox) =>
    `${b.leftPct.toFixed(1)}:${b.topPct.toFixed(1)}:${b.str}`;

  const exactHit = normalizedBoxes.find(
    (nb) => nb.upper === term && (!usedKeys || !usedKeys.has(boxKey(nb.box)))
  );
  if (exactHit) {
    return {
      matchedTerm: rawTerm,
      ...exactHit.box,
      exact: true,
    };
  }

  const substrHit = normalizedBoxes.find(
    (nb) => nb.upper.includes(term) && (!usedKeys || !usedKeys.has(boxKey(nb.box)))
  );
  if (substrHit) {
    return {
      matchedTerm: rawTerm,
      ...substrHit.box,
      exact: true,
    };
  }

  return null;
}

/**
 * Pure matching logic over extracted PDF text boxes. Supports both exact single-span hits
 * and multi-span CAD tag splits (e.g., "PDIT" stacked directly above "111E").
 */
export function matchTextBoxesForTerms(
  boxes: PdfTextBox[],
  searchTerms: string[]
): PdfLocateMatch | null {
  if (boxes.length === 0 || searchTerms.length === 0) return null;

  const normalizedBoxes = boxes.map((b) => ({
    box: b,
    upper: b.str.trim().toUpperCase(),
  }));

  // Pass 1: Direct span hit (prefer exact string equality first, then substring)
  for (const rawTerm of searchTerms) {
    const directHit = findSingleBoxMatch(normalizedBoxes, rawTerm);
    if (directHit) return directHit;
  }

  // Pass 2: Multi-span CAD symbol split (e.g. "PDIT-111E" -> "PDIT" near "111E")
  for (const rawTerm of searchTerms) {
    const clean = rawTerm.trim().toUpperCase().replace(/^(100|200|300|400)-/, '');
    const tokens = clean.split(/[-/\s]+/).filter((t) => t.length >= 2);
    if (tokens.length < 2) continue;

    const headToken = tokens[0];
    const tailToken = tokens[tokens.length - 1];
    const headCandidates = normalizedBoxes.filter(
      (nb) => nb.upper === headToken || nb.upper.includes(headToken)
    );
    const tailCandidates = normalizedBoxes.filter(
      (nb) => nb.upper === tailToken || nb.upper.includes(tailToken)
    );

    for (const h of headCandidates) {
      const partner = tailCandidates.find(
        (t) =>
          Math.abs(t.box.xPct - h.box.xPct) <= 8 &&
          Math.abs(t.box.yPct - h.box.yPct) <= 6
      );
      if (partner) {
        const leftPct = Math.min(h.box.leftPct, partner.box.leftPct);
        const topPct = Math.min(h.box.topPct, partner.box.topPct);
        const rightPct = Math.max(
          h.box.leftPct + h.box.widthPct,
          partner.box.leftPct + partner.box.widthPct
        );
        const bottomPct = Math.max(
          h.box.topPct + h.box.heightPct,
          partner.box.topPct + partner.box.heightPct
        );
        return {
          matchedTerm: rawTerm,
          str: `${h.box.str} ${partner.box.str}`,
          xPct: clampPct((leftPct + rightPct) / 2),
          yPct: clampPct((topPct + bottomPct) / 2),
          leftPct,
          topPct,
          widthPct: +(rightPct - leftPct).toFixed(2),
          heightPct: +(bottomPct - topPct).toFixed(2),
          exact: true,
        };
      }
    }
  }

  return null;
}

/**
 * Collects prioritized AI/rule/diff text-region candidates relevant to a specific drawing & page.
 */
export function extractAiRegionCandidates(params: {
  drawingId: string;
  pageNum: number;
  aiResult?: ParallelAnalyzeResponse | null;
  localAuditResult?: LocalPdfAuditResponse | null;
  ruleViolations?: RuleViolationHit[];
  evaluatedLoops?: EvaluatedLoopMatch[];
}): AiTextRegionCandidate[] {
  const {
    drawingId,
    pageNum,
    aiResult,
    localAuditResult,
    ruleViolations = [],
    evaluatedLoops = [],
  } = params;

  const candidates: AiTextRegionCandidate[] = [];
  const shortDrawing = drawingId.replace(/^(PR|PD|CI)-/, '');
  const pushUniqueTerms = (arr: string[]): string[] => {
    const out: string[] = [];
    for (const item of arr) {
      const clean = stripParenthetical(item).trim();
      if (clean.length >= 3 && !out.includes(clean)) out.push(clean);
    }
    return out;
  };

  // 1. Gemini AI Findings (highest priority: explicit textRegions + tag)
  if (aiResult) {
    for (const track of aiResult.tracks) {
      if (track.status !== 'COMPLETED' || !track.findings) continue;
      for (let i = 0; i < track.findings.length; i++) {
        const f = track.findings[i];
        const evidenceUpper = (f.sourceEvidence || '').toUpperCase();
        const matchesDrawing =
          track.drawingIds.includes(drawingId) ||
          evidenceUpper.includes(drawingId.toUpperCase()) ||
          evidenceUpper.includes(shortDrawing.toUpperCase());
        const matchesPage = !f.pageHint || f.pageHint === pageNum;
        if (!matchesDrawing || !matchesPage) continue;

        const terms = pushUniqueTerms([...(f.textRegions || []), f.tag]);
        if (terms.length === 0) continue;
        candidates.push({
          id: `AI-${track.trackId}-${i}`,
          source: 'GEMINI_AI',
          tag: f.tag,
          severity: f.severity,
          summary: f.finding,
          recommendation: f.recommendation,
          searchTerms: terms,
        });
      }
    }
  }

  // 2. Local Vector Audit Findings
  if (localAuditResult) {
    for (const track of localAuditResult.tracks) {
      for (const f of track.findings) {
        if (f.drawingId !== drawingId || f.pageNum !== pageNum) continue;
        const terms = pushUniqueTerms([f.matchedText, f.tag]);
        if (terms.length === 0) continue;
        candidates.push({
          id: `LOC-${f.id}`,
          source: 'LOCAL_SCAN',
          tag: f.tag,
          severity: f.severity,
          summary: f.finding,
          recommendation: f.recommendation,
          searchTerms: terms,
        });
      }
    }
  }

  // 3. Rule Engine Violations targeting this drawing/page
  for (const v of ruleViolations) {
    if (v.drawingId && v.drawingId !== drawingId) continue;
    if (v.pageNum && v.pageNum !== pageNum) continue;
    if (!v.drawingId) continue;
    const rawTokens = v.tagOrTarget.split(/[\s,/]+/).filter((t) => t.length >= 3);
    const terms = pushUniqueTerms([v.tagOrTarget, ...rawTokens]);
    if (terms.length === 0) continue;
    candidates.push({
      id: `RULE-${v.id}`,
      source: 'RULE_ENGINE',
      tag: v.tagOrTarget || v.ruleCode,
      severity: v.severity,
      summary: `${v.ruleNameKo}: ${v.evidence}`,
      recommendation: v.recommendation || `규칙 ${v.ruleCode} 기준 도면 수정 검토`,
      searchTerms: terms,
    });
  }

  // 4. Loop Cross-Match Discrepancies mapped to this drawing & page
  for (const loop of evaluatedLoops) {
    const targets = resolveLoopPdfTargets(loop);
    const isLeftMatch = targets.left.drawingId === drawingId && targets.left.pageNum === pageNum;
    const isRightMatch = targets.right.drawingId === drawingId && targets.right.pageNum === pageNum;
    if (!isLeftMatch && !isRightMatch) continue;
    if (loop.discrepancies.length === 0 && loop.status === 'MATCHED') continue;

    const side: 'LEFT' | 'RIGHT' = isRightMatch ? 'RIGHT' : 'LEFT';
    const topDisc = loop.discrepancies[0];
    const terms = pushUniqueTerms(buildSearchTermsForLoop(loop, side));
    if (terms.length === 0) continue;
    candidates.push({
      id: `LOOP-${loop.id}-${side}`,
      source: 'LOOP_DIFF',
      tag: loop.canonicalTag,
      severity: topDisc?.severity || 'INFO',
      summary: topDisc ? topDisc.title : `${loop.canonicalTag} (${loop.statusLabelKo})`,
      recommendation: topDisc?.recommendedAction || `${loop.canonicalTag} 도면 정합성 확인`,
      searchTerms: terms,
    });
  }

  return candidates;
}

/**
 * Matches multiple AI/rule/diff candidates against extracted PDF text boxes,
 * deduplicating overlapping hits on the same coordinates while preserving highest severity.
 */
export function matchMultipleTextRegions(
  boxes: PdfTextBox[],
  candidates: AiTextRegionCandidate[],
  maxOverlays = 18
): AiTextRegionOverlay[] {
  if (boxes.length === 0 || candidates.length === 0) return [];

  const normalizedBoxes = boxes.map((b) => ({
    box: b,
    upper: b.str.trim().toUpperCase(),
  }));

  const overlays: AiTextRegionOverlay[] = [];
  const usedCoordKeys = new Set<string>();

  for (const cand of candidates) {
    if (overlays.length >= maxOverlays) break;

    let candidateMatches = 0;
    const perCandTermLimit = cand.source === 'GEMINI_AI' ? 3 : 2;

    for (const term of cand.searchTerms) {
      if (candidateMatches >= perCandTermLimit || overlays.length >= maxOverlays) break;
      const direct = findSingleBoxMatch(normalizedBoxes, term, usedCoordKeys);
      const hit = direct || (candidateMatches === 0 ? matchTextBoxesForTerms(boxes, [term]) : null);
      if (!hit) continue;

      const coordKey = `${Math.round(hit.xPct / 2)}:${Math.round(hit.yPct / 2)}`;
      if (usedCoordKeys.has(coordKey)) continue;
      usedCoordKeys.add(coordKey);
      usedCoordKeys.add(`${hit.leftPct.toFixed(1)}:${hit.topPct.toFixed(1)}:${hit.str}`);

      overlays.push({
        id: `${cand.id}::${candidateMatches}`,
        source: cand.source,
        tag: cand.tag,
        severity: cand.severity,
        summary: cand.summary,
        recommendation: cand.recommendation,
        ...hit,
      });
      candidateMatches += 1;
    }
  }

  return overlays;
}

/**
 * Extracts normalized bounding boxes from a rendered pdf.js page.
 */
export async function extractPdfTextBoxesFromPage(
  page: PDFPageProxy
): Promise<PdfTextBox[]> {
  const viewport = page.getViewport({ scale: 1 });
  const textContent = await page.getTextContent();
  const boxes: PdfTextBox[] = [];

  for (const rawItem of textContent.items) {
    if (!('str' in rawItem) || typeof rawItem.str !== 'string') continue;
    const text = rawItem.str.trim();
    if (!text) continue;

    const tx = pdfjsLib.Util.transform(viewport.transform, rawItem.transform);
    const fontHeight = Math.max(6, Math.hypot(tx[2], tx[3]) || rawItem.height || 10);
    const textWidth = Math.max(8, rawItem.width || text.length * fontHeight * 0.52);

    const leftPx = tx[4];
    const topPx = tx[5] - fontHeight * 0.85;
    const centerXPx = leftPx + textWidth / 2;
    const centerYPx = tx[5] - fontHeight * 0.35;

    const leftPct = Math.max(0, Math.min(99, +((leftPx / viewport.width) * 100).toFixed(2)));
    const topPct = Math.max(0, Math.min(99, +((topPx / viewport.height) * 100).toFixed(2)));
    const widthPct = Math.max(1.2, Math.min(40, +((textWidth / viewport.width) * 100).toFixed(2)));
    const heightPct = Math.max(1.2, Math.min(15, +((fontHeight / viewport.height) * 100).toFixed(2)));

    boxes.push({
      str: text,
      xPct: clampPct((centerXPx / viewport.width) * 100),
      yPct: clampPct((centerYPx / viewport.height) * 100),
      leftPct,
      topPct,
      widthPct,
      heightPct,
    });
  }

  return boxes;
}

export async function locateTermsOnPdfPage(
  page: PDFPageProxy,
  searchTerms: string[]
): Promise<PdfLocateMatch | null> {
  const boxes = await extractPdfTextBoxesFromPage(page);
  return matchTextBoxesForTerms(boxes, searchTerms);
}

export async function locateAiTextRegionsOnPdfPage(
  page: PDFPageProxy,
  candidates: AiTextRegionCandidate[]
): Promise<AiTextRegionOverlay[]> {
  if (candidates.length === 0) return [];
  const boxes = await extractPdfTextBoxesFromPage(page);
  return matchMultipleTextRegions(boxes, candidates);
}

/**
 * Inserts or updates an automatically located pin note on a PDF drawing without creating duplicates.
 */
export function upsertAutoNote(
  existingNotes: DrawingPinNote[],
  candidate: Omit<DrawingPinNote, 'id' | 'createdAt'>
): {
  notes: DrawingPinNote[];
  targetNote: DrawingPinNote;
  wasCreated: boolean;
} {
  const normalizedRef = candidate.tagRef.trim().toUpperCase();
  const existingIdx = existingNotes.findIndex(
    (n) =>
      n.drawingId === candidate.drawingId &&
      n.pageNum === candidate.pageNum &&
      (n.tagRef.trim().toUpperCase() === normalizedRef ||
        n.tagRef.trim().toUpperCase().includes(normalizedRef) ||
        normalizedRef.includes(n.tagRef.trim().toUpperCase()))
  );

  if (existingIdx >= 0) {
    const existing = existingNotes[existingIdx];
    const shouldRefineCoord =
      existing.source === 'AUTO_LOCATE' &&
      (Math.abs(existing.xPct - candidate.xPct) > 1 ||
        Math.abs(existing.yPct - candidate.yPct) > 1);

    if (shouldRefineCoord) {
      const updated: DrawingPinNote = {
        ...existing,
        xPct: candidate.xPct,
        yPct: candidate.yPct,
        content: candidate.content,
      };
      const next = existingNotes.map((n, i) => (i === existingIdx ? updated : n));
      return { notes: next, targetNote: updated, wasCreated: false };
    }
    return { notes: existingNotes, targetNote: existing, wasCreated: false };
  }

  const created: DrawingPinNote = {
    ...candidate,
    id: `AUTO-NOTE-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
    createdAt: new Date().toISOString(),
  };

  return {
    notes: [created, ...existingNotes],
    targetNote: created,
    wasCreated: true,
  };
}
