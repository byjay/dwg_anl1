import {
  CrossDrawingEntityPresence,
  DiscrepancySeverity,
  DrawingChangeComparison,
  DrawingChangeItem,
  DrawingContentAnalysisReport,
  ExtractedEntityKind,
  ExtractedPdfEntity,
  PdfPageContentSummary,
} from '../types/diagram';
import { extractPdfTextBoxesFromPage, PdfTextBox } from './pdfLocator';
import {
  analyzeMakerDrawingProfile,
  buildUniversalDiagramMatches,
  classifyDrawingDocument,
  extractCablesFromBoxes,
  extractEquipmentFromBoxes,
  getDocClassLabelKo,
} from './universalDrawingAnalyzer';

const BUBBLE_PREFIX_RE =
  /^(PD?IT|PEIT|PIT|TIT|FIT|LIT|LIC|TI|PI|FI|LI|TG|PG|SDV|SDY|BDV|ESV|XV|XY|MOV|SOV|FCV|TCV|PCV|LCV|RV|PSV|PRV|UV|UY|ZSO|ZSC|ZS|UZSO|UZSC|HS|GD|FD|VE|VT|PMSD)$/i;
const BUBBLE_SUFFIX_RE = /^(\d{2,4}[A-Z]{0,2}(?:[/_-][A-Z0-9]{1,4})?|R\d{2,3})$/i;

const INLINE_TAG_RE =
  /\b(?:\d{1,4}-|[A-Z]\d-)?(?:PD?IT|PEIT|PIT|TIT|FIT|LIT|LIC|TIC|PIC|FIC|AIC|TI|PI|FI|LI|TG|PG|SDV|SDY|BDV|ESV|XV|XY|MOV|SOV|FCV|TCV|PCV|LCV|RV|PSV|PRV|UV|UY|ZSO|ZSC|ZS|UZSO|UZSC|HS|GD|FD|VE|VT|PSHH|PSLL|PSL|PSH|LSHH|LSLL|TSHH|TSLL|PMSD)-[A-Z0-9_/-]{2,18}\b/gi;
const SPACED_TAG_RE =
  /\b(PD?IT|PEIT|PIT|TIT|FIT|LIT|TI|PI|FI|LI|SDV|SDY|BDV|ESV|XV|MOV|SOV|FCV|TCV|PCV|RV|PSV|UV|UY|ZSO|ZSC|HS|GD|VE)\s+(\d{2,4}[A-Z]{0,2})\b/gi;

const LINE_NO_RE =
  /(?<![A-Z0-9])(\d+(?:\/\d+)?["”]-\d{1,4}-[A-Z]{2,4}-[A-Z0-9-]{3,}|DN\d{2,4}-[A-Z]{2,4}-[A-Z0-9-]{2,})(?![A-Z0-9])/gi;
const JB_RE =
  /\b(?:\d{1,4}-)?(?:N?IS|V|GD|LCP|UCP|VCP|MCC|RIO|PLC|TR)?(?:JB|TB|CP|PNL|RIO|PLC|MCC)-[A-Z0-9-]{1,10}\b/gi;
const EQUIP_RE =
  /\b(?:\d{1,4}|[A-Z]\d)-(?:P|PU|E|HX|HE|V|TK|T|K|C|COMP|M|MTR|FAN|BL|SKID|PKG|VFD|SWBD|TR)-\d{2,4}[A-Z0-9]{0,3}\b/gi;
const SHORT_EQUIP_RE = /(?<![A-Z0-9-])([EPVK]-\d{2,4}[A-Z]?|PU-\d{2,4}[A-Z]?|HX-\d{2,4}[A-Z]?|TK-\d{2,4}[A-Z]?|VFD-\d{2,4}[A-Z]?|SKID-\d{2,4}[A-Z]?)(?![A-Z0-9-])/g;
const CABLE_RE =
  /(?:(?<![A-Z0-9])(?:[RH][CSEV]\d{3,5}[A-Z]?|FR-[A-Z0-9-]{3,}|(?:CBL|CAB|WIR|IC|PW|CTL|SIG|EM|LV|HV|MV|FD|TRK)-[A-Z0-9-]{2,14}|\d{1,3}-(?:IC|PW|CBL|EL|MV|LV)-\d{2,5}[A-Z]?)\b|(?<![A-Z0-9])[RH][CS]\*{2,4}(?![A-Z0-9*]))/g;
const NO_TBD_RE = /\bNO\.?\s*T\.?B\.?D\.?\b/gi;
const HOLD_RE =
  /\b(?:HOLD(?:-[A-Z0-9-]+|\s*\d+)?|T\.?B\.?D\.?|XXX|OBSOLETE|DELETED|NOTE\s*\d+)\b/gi;
const REV_RE = /\bRev\.?\s*[A-Z0-9]{1,3}\b/gi;

export function normalizeEntityKey(kind: ExtractedEntityKind, raw: string): string {
  const upper = raw.trim().toUpperCase().replace(/\s+/g, ' ');
  if (kind === 'TAG') {
    return upper
      .replace(/^(\d{1,4}-|[A-Z]\d-)?(PD?IT|PEIT|PIT|TIT|FIT|LIT|LIC|TIC|PIC|FIC|AIC|TI|PI|FI|LI|TG|PG|SDV|SDY|BDV|ESV|XV|XY|MOV|SOV|FCV|TCV|PCV|LCV|RV|PSV|PRV|UV|UY|ZSO|ZSC|ZS|UZSO|UZSC|HS|GD|FD|VE|VT|PSHH|PSLL|PSL|PSH|LSHH|LSLL|TSHH|TSLL|PMSD)\s+/, '$1$2-')
      .replace(/\s+/g, '-');
  }
  if (kind === 'LINE_NO') {
    return upper.replace(/”/g, '"');
  }
  if (kind === 'REVISION') {
    return upper.replace(/^REV\.?\s*/, 'REV.');
  }
  return upper;
}

export function isAttentionEntity(normalized: string): boolean {
  return (
    normalized.includes('110-P-') ||
    normalized.includes('RC****') ||
    normalized.includes('RC03208') ||
    normalized.includes('PEIT-111E') ||
    normalized.includes('HOLD') ||
    normalized.includes('XXX') ||
    normalized.includes('T.B.D') ||
    normalized.includes('TBD') ||
    normalized.includes('OBSOLETE') ||
    normalized.includes('DELETED') ||
    normalized === 'TI-131B' ||
    normalized === 'RV-113D'
  );
}

/**
 * Pure extractor: parses CAD entities (tags including spatially split P&ID bubbles,
 * piping line numbers, cables, junction boxes, equipment, HOLD/note/revision markers)
 * from positioned PdfTextBox arrays (either pdf.js vector spans or Tesseract OCR boxes).
 */
export function extractEntitiesFromBoxes(
  boxes: PdfTextBox[],
  drawingId: string,
  pageNum: number,
  source: 'VECTOR' | 'OCR',
  confidenceMap?: Map<PdfTextBox, number>
): ExtractedPdfEntity[] {
  const results: ExtractedPdfEntity[] = [];
  const seenOnPage = new Set<string>();

  const pushEntity = (
    kind: ExtractedEntityKind,
    text: string,
    box: PdfTextBox,
    rawContext: string,
    xPct = box.xPct,
    yPct = box.yPct
  ) => {
    const cleaned = text.trim();
    if (cleaned.length < 2) return;
    const normalized = normalizeEntityKey(kind, cleaned);
    const dedupeKey = `${kind}:${normalized}:${Math.round(xPct / 2)}:${Math.round(yPct / 2)}`;
    if (seenOnPage.has(dedupeKey)) return;
    seenOnPage.add(dedupeKey);

    results.push({
      id: `${drawingId}-P${pageNum}-${source}-${kind}-${results.length + 1}`,
      drawingId,
      pageNum,
      kind,
      text: cleaned,
      normalized,
      rawContext: rawContext.slice(0, 140),
      xPct,
      yPct,
      source,
      confidence: confidenceMap?.get(box),
    });
  };

  for (const box of boxes) {
    const str = box.str.trim();
    if (!str) continue;

    for (const m of str.matchAll(LINE_NO_RE)) {
      pushEntity('LINE_NO', m[1] || m[0], box, str);
    }

    for (const m of str.matchAll(JB_RE)) {
      pushEntity('JUNCTION_BOX', m[0], box, str);
    }

    for (const m of str.matchAll(EQUIP_RE)) {
      pushEntity('EQUIPMENT', m[0], box, str);
    }

    for (const m of str.matchAll(SHORT_EQUIP_RE)) {
      const candidate = m[1] || m[0];
      const alreadyUnitPrefixed = str.includes(`-${candidate}`);
      if (!alreadyUnitPrefixed) {
        pushEntity('EQUIPMENT', candidate, box, str);
      }
    }

    for (const m of str.matchAll(CABLE_RE)) {
      pushEntity('CABLE', m[0], box, str);
    }

    for (const m of str.matchAll(NO_TBD_RE)) {
      pushEntity('CABLE', m[0], box, str);
    }

    for (const m of str.matchAll(HOLD_RE)) {
      pushEntity('HOLD_OR_NOTE', m[0], box, str);
    }

    for (const m of str.matchAll(REV_RE)) {
      pushEntity('REVISION', m[0], box, str);
    }

    for (const m of str.matchAll(INLINE_TAG_RE)) {
      const token = m[0];
      // Skip if this is actually a JB or equipment tag already classified
      if (JB_RE.test(token)) {
        JB_RE.lastIndex = 0;
        continue;
      }
      JB_RE.lastIndex = 0;
      pushEntity('TAG', token, box, str);
    }

    for (const m of str.matchAll(SPACED_TAG_RE)) {
      pushEntity('TAG', `${m[1]}-${m[2]}`, box, str);
    }
  }

  // Spatial pass: pair split CAD instrument bubbles ("PDIT" stacked above "111E", "TI" above "131B")
  const prefixBoxes = boxes.filter((b) => BUBBLE_PREFIX_RE.test(b.str.trim()));
  const suffixBoxes = boxes.filter((b) => BUBBLE_SUFFIX_RE.test(b.str.trim()));

  for (const pBox of prefixBoxes) {
    const pText = pBox.str.trim().toUpperCase();
    let bestPartner: PdfTextBox | null = null;
    let bestDist = Infinity;

    for (const sBox of suffixBoxes) {
      if (sBox === pBox) continue;
      const dx = Math.abs(sBox.xPct - pBox.xPct);
      const dy = Math.abs(sBox.yPct - pBox.yPct);
      if (dx <= 6.5 && dy <= 5.5) {
        const dist = dx + dy;
        if (dist < bestDist) {
          bestDist = dist;
          bestPartner = sBox;
        }
      }
    }

    if (bestPartner) {
      const combined = `${pText}-${bestPartner.str.trim().toUpperCase()}`;
      const cx = +((pBox.xPct + bestPartner.xPct) / 2).toFixed(2);
      const cy = +((pBox.yPct + bestPartner.yPct) / 2).toFixed(2);
      pushEntity(
        'TAG',
        combined,
        pBox,
        `${pBox.str.trim()} + ${bestPartner.str.trim()}`,
        cx,
        cy
      );
    }
  }

  return results;
}

/**
 * Aggregates extracted entities across multiple drawings to highlight cross-drawing overlaps & flags.
 */
export function buildCrossDrawingPresence(
  entities: ExtractedPdfEntity[]
): CrossDrawingEntityPresence[] {
  const map = new Map<string, CrossDrawingEntityPresence>();

  for (const ent of entities) {
    const key = `${ent.kind}::${ent.normalized}`;
    let entry = map.get(key);
    if (!entry) {
      entry = {
        normalized: ent.normalized,
        kind: ent.kind,
        appearances: [],
        drawingCount: 0,
        hasAttentionFlag: isAttentionEntity(ent.normalized),
      };
      map.set(key, entry);
    }

    const alreadySameSpot = entry.appearances.some(
      (a) =>
        a.drawingId === ent.drawingId &&
        a.pageNum === ent.pageNum &&
        a.rawText === ent.text
    );
    if (!alreadySameSpot) {
      entry.appearances.push({
        drawingId: ent.drawingId,
        pageNum: ent.pageNum,
        rawText: ent.text,
        xPct: ent.xPct,
        yPct: ent.yPct,
        source: ent.source,
      });
    }
  }

  const list = Array.from(map.values()).map((item) => ({
    ...item,
    drawingCount: new Set(item.appearances.map((a) => a.drawingId)).size,
  }));

  return list.sort((a, b) => {
    if (a.hasAttentionFlag !== b.hasAttentionFlag) return a.hasAttentionFlag ? -1 : 1;
    if (a.drawingCount !== b.drawingCount) return b.drawingCount - a.drawingCount;
    return b.appearances.length - a.appearances.length;
  });
}

function getCoreSignature(kind: ExtractedEntityKind, normalized: string): string {
  if (kind === 'TAG') {
    return normalized.replace(/^(?:\d{1,4}|[A-Z]\d)-/, '');
  }
  if (kind === 'EQUIPMENT') {
    return normalized.replace(/^(?:\d{1,4}|[A-Z]\d)-/, '');
  }
  if (kind === 'LINE_NO') {
    const parts = normalized.split('-');
    // e.g. 18"-100-GW-252-B1X-N -> GW-252
    if (parts.length >= 4) return `${parts[2]}-${parts[3]}`;
  }
  return normalized;
}

/**
 * Pure PDF-vs-PDF / Revision comparison engine across extracted CAD entities.
 */
export function compareDocumentEntities(
  leftDrawingId: string,
  leftDocLabel: string,
  leftEntities: ExtractedPdfEntity[],
  rightDrawingId: string,
  rightDocLabel: string,
  rightEntities: ExtractedPdfEntity[],
  durationMs = 0
): DrawingChangeComparison {
  const filterKinds = new Set<ExtractedEntityKind>([
    'TAG',
    'LINE_NO',
    'CABLE',
    'JUNCTION_BOX',
    'EQUIPMENT',
    'HOLD_OR_NOTE',
  ]);

  const leftByNorm = new Map<string, ExtractedPdfEntity[]>();
  const rightByNorm = new Map<string, ExtractedPdfEntity[]>();

  for (const e of leftEntities) {
    if (!filterKinds.has(e.kind)) continue;
    const k = `${e.kind}::${e.normalized}`;
    const arr = leftByNorm.get(k) || [];
    arr.push(e);
    leftByNorm.set(k, arr);
  }
  for (const e of rightEntities) {
    if (!filterKinds.has(e.kind)) continue;
    const k = `${e.kind}::${e.normalized}`;
    const arr = rightByNorm.get(k) || [];
    arr.push(e);
    rightByNorm.set(k, arr);
  }

  const items: DrawingChangeItem[] = [];
  const matchedRightKeys = new Set<string>();
  const unmatchedLeftKeys: string[] = [];

  for (const [key, leftList] of leftByNorm.entries()) {
    const [kindRaw, norm] = key.split('::');
    const kind = kindRaw as ExtractedEntityKind;
    const rightExact = rightByNorm.get(key);

    if (rightExact) {
      matchedRightKeys.add(key);
      const needsAttn = isAttentionEntity(norm);
      items.push({
        id: `CHG-SAME-${kind}-${norm}`,
        normalizedKey: norm,
        kind,
        changeType: 'UNCHANGED',
        severity: needsAttn ? 'WARNING' : 'INFO',
        leftOccurrences: leftList.slice(0, 6).map((e) => ({
          pageNum: e.pageNum,
          rawText: e.text,
          xPct: e.xPct,
          yPct: e.yPct,
          source: e.source,
        })),
        rightOccurrences: rightExact.slice(0, 6).map((e) => ({
          pageNum: e.pageNum,
          rawText: e.text,
          xPct: e.xPct,
          yPct: e.yPct,
          source: e.source,
        })),
        detailKo: needsAttn
          ? `양측 도면 모두에 주의 표기(${norm})가 존재함`
          : `기준(${leftList.length}건) 및 비교(${rightExact.length}건) 도면에 동일하게 존재`,
      });
    } else {
      unmatchedLeftKeys.push(key);
    }
  }

  // Pair unmatched left vs unmatched right that share core tag/equipment/line signature -> MODIFIED
  const rightCoreIndex = new Map<string, string[]>();
  for (const rKey of rightByNorm.keys()) {
    if (matchedRightKeys.has(rKey)) continue;
    const [kindRaw, norm] = rKey.split('::');
    const coreKey = `${kindRaw}::${getCoreSignature(kindRaw as ExtractedEntityKind, norm)}`;
    const list = rightCoreIndex.get(coreKey) || [];
    list.push(rKey);
    rightCoreIndex.set(coreKey, list);
  }

  for (const lKey of unmatchedLeftKeys) {
    const [kindRaw, lNorm] = lKey.split('::');
    const kind = kindRaw as ExtractedEntityKind;
    const leftList = leftByNorm.get(lKey)!;
    const coreKey = `${kindRaw}::${getCoreSignature(kind, lNorm)}`;
    const candidates = (rightCoreIndex.get(coreKey) || []).filter(
      (rk) => !matchedRightKeys.has(rk)
    );

    if (candidates.length > 0) {
      const rKey = candidates[0];
      matchedRightKeys.add(rKey);
      const rightList = rightByNorm.get(rKey)!;
      const rNorm = rKey.split('::')[1];
      const severity: DiscrepancySeverity =
        kind === 'EQUIPMENT' || kind === 'TAG' || kind === 'CABLE' ? 'CRITICAL' : 'WARNING';

      items.push({
        id: `CHG-MOD-${kind}-${lNorm}`,
        normalizedKey: `${lNorm} → ${rNorm}`,
        kind,
        changeType: 'MODIFIED',
        severity,
        leftOccurrences: leftList.slice(0, 6).map((e) => ({
          pageNum: e.pageNum,
          rawText: e.text,
          xPct: e.xPct,
          yPct: e.yPct,
          source: e.source,
        })),
        rightOccurrences: rightList.slice(0, 6).map((e) => ({
          pageNum: e.pageNum,
          rawText: e.text,
          xPct: e.xPct,
          yPct: e.yPct,
          source: e.source,
        })),
        detailKo: `코어 식별자 일치하나 표기 변경/불일치 검출: 기준 "${lNorm}" ↔ 비교 "${rNorm}"`,
      });
    } else {
      const severity: DiscrepancySeverity =
        kind === 'HOLD_OR_NOTE' || kind === 'TAG' || kind === 'CABLE' ? 'WARNING' : 'INFO';
      items.push({
        id: `CHG-REM-${kind}-${lNorm}`,
        normalizedKey: lNorm,
        kind,
        changeType: 'REMOVED',
        severity,
        leftOccurrences: leftList.slice(0, 6).map((e) => ({
          pageNum: e.pageNum,
          rawText: e.text,
          xPct: e.xPct,
          yPct: e.yPct,
          source: e.source,
        })),
        rightOccurrences: [],
        detailKo: `기준 도면(${leftDrawingId})에는 존재하나 비교 도면(${rightDrawingId})에서 미검출`,
      });
    }
  }

  for (const [rKey, rightList] of rightByNorm.entries()) {
    if (matchedRightKeys.has(rKey)) continue;
    const [kindRaw, rNorm] = rKey.split('::');
    const kind = kindRaw as ExtractedEntityKind;
    const severity: DiscrepancySeverity =
      isAttentionEntity(rNorm) || kind === 'HOLD_OR_NOTE' ? 'CRITICAL' : 'INFO';
    items.push({
      id: `CHG-ADD-${kind}-${rNorm}`,
      normalizedKey: rNorm,
      kind,
      changeType: 'ADDED',
      severity,
      leftOccurrences: [],
      rightOccurrences: rightList.slice(0, 6).map((e) => ({
        pageNum: e.pageNum,
        rawText: e.text,
        xPct: e.xPct,
        yPct: e.yPct,
        source: e.source,
      })),
      detailKo: `비교 도면(${rightDrawingId})에서 신규/추가 검출 (기준 도면에 없음)`,
    });
  }

  const changeRank: Record<DrawingChangeItem['changeType'], number> = {
    MODIFIED: 0,
    REMOVED: 1,
    ADDED: 2,
    UNCHANGED: 3,
  };
  const sevRank: Record<DiscrepancySeverity, number> = {
    CRITICAL: 0,
    WARNING: 1,
    INFO: 2,
  };

  items.sort((a, b) => {
    if (changeRank[a.changeType] !== changeRank[b.changeType]) {
      return changeRank[a.changeType] - changeRank[b.changeType];
    }
    if (sevRank[a.severity] !== sevRank[b.severity]) {
      return sevRank[a.severity] - sevRank[b.severity];
    }
    return a.normalizedKey.localeCompare(b.normalizedKey);
  });

  return {
    leftDrawingId,
    leftDocLabel,
    rightDrawingId,
    rightDocLabel,
    durationMs,
    summary: {
      added: items.filter((i) => i.changeType === 'ADDED').length,
      removed: items.filter((i) => i.changeType === 'REMOVED').length,
      modified: items.filter((i) => i.changeType === 'MODIFIED').length,
      unchanged: items.filter((i) => i.changeType === 'UNCHANGED').length,
    },
    items,
  };
}

let workerConfigured = false;
async function ensurePdfWorkerConfigured() {
  const pdfjsLib = await import('pdfjs-dist');
  if (!workerConfigured && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
    const workerMod = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
    pdfjsLib.GlobalWorkerOptions.workerSrc = workerMod.default;
    workerConfigured = true;
  }
  return pdfjsLib;
}

export interface DrawingScanTarget {
  id: string;
  url: string;
  displayName?: string;
  hintRole?: 'PID_GAR' | 'ELECTRICAL_DIA' | 'CABLE_SCHEDULE' | 'MAKER_VENDOR' | 'AUTO';
  maxPages?: number;
}

/**
 * Browser-side parallel PDF content extraction across multiple H042 or uploaded PDFs.
 * Parses vector text across pages using Promise.all without requiring any external API key,
 * then builds universal Equipment, Cable, Maker Drawing, and Cross-Diagram Matching profiles.
 */
export async function analyzeDrawingsContent(
  targets: DrawingScanTarget[],
  onProgress?: (info: { donePages: number; drawingId: string }) => void
): Promise<DrawingContentAnalysisReport> {
  const started = Date.now();
  const pdfjsLib = await ensurePdfWorkerConfigured();

  const pages: PdfPageContentSummary[] = [];
  const allEntities: ExtractedPdfEntity[] = [];
  const allEquipmentRecords: ReturnType<typeof extractEquipmentFromBoxes> = [];
  const allCableRecords: ReturnType<typeof extractCablesFromBoxes> = [];
  const documentProfiles: NonNullable<DrawingContentAnalysisReport['documentProfiles']> = [];
  const makerProfiles: NonNullable<DrawingContentAnalysisReport['makerProfiles']> = [];
  let donePages = 0;

  await Promise.all(
    targets.map(async (target) => {
      const doc = await pdfjsLib.getDocument({ url: target.url }).promise;
      const limit = target.maxPages ? Math.min(doc.numPages, target.maxPages) : doc.numPages;
      const boxesByPage: PdfTextBox[][] = Array.from({ length: limit }, () => []);
      const docEntities: ExtractedPdfEntity[] = [];
      const docEquipment: ReturnType<typeof extractEquipmentFromBoxes> = [];
      const docCables: ReturnType<typeof extractCablesFromBoxes> = [];

      // Scan pages in bounded batches of 6 per document to keep UI responsive
      for (let start = 1; start <= limit; start += 6) {
        const end = Math.min(limit, start + 5);
        const batchNums: number[] = [];
        for (let p = start; p <= end; p++) batchNums.push(p);

        const batchResults = await Promise.all(
          batchNums.map(async (pageNum) => {
            const page = await doc.getPage(pageNum);
            const boxes = await extractPdfTextBoxesFromPage(page);
            boxesByPage[pageNum - 1] = boxes;

            const entities = extractEntitiesFromBoxes(boxes, target.id, pageNum, 'VECTOR');
            const equipment = extractEquipmentFromBoxes(boxes, target.id, pageNum, 'VECTOR');
            const cables = extractCablesFromBoxes(boxes, target.id, pageNum, 'VECTOR');

            const sheetHint = boxes
              .map((b) => b.str)
              .join(' ')
              .match(/\b(?:SHEET\s*\d+\s*\/\s*\d+|\d{2}\/\d{2}|R-\d{2}|H-\d{2})\b/i)?.[0];

            const snippet = boxes
              .slice(0, 18)
              .map((b) => b.str.trim())
              .filter(Boolean)
              .join(' · ')
              .slice(0, 180);

            donePages += 1;
            onProgress?.({ donePages, drawingId: target.id });

            return {
              summary: {
                drawingId: target.id,
                pageNum,
                vectorTextCount: boxes.length,
                needsOcrRecommended: boxes.length < 25,
                sheetHint,
                entities,
                rawSnippet: snippet,
              } satisfies PdfPageContentSummary,
              entities,
              equipment,
              cables,
            };
          })
        );

        for (const br of batchResults) {
          pages.push(br.summary);
          docEntities.push(...br.entities);
          docEquipment.push(...br.equipment);
          docCables.push(...br.cables);
        }
      }

      allEntities.push(...docEntities);
      allEquipmentRecords.push(...docEquipment);
      allCableRecords.push(...docCables);

      const displayName = target.displayName || target.id;
      const classification = classifyDrawingDocument({
        drawingId: target.id,
        displayName,
        pageBoxes: boxesByPage,
        hintRole: target.hintRole,
      });

      const makerProfile = analyzeMakerDrawingProfile({
        drawingId: target.id,
        displayName,
        docClass: classification.docClass,
        vendorHint: classification.vendorHint,
        pageBoxes: boxesByPage,
      });

      makerProfiles.push(makerProfile);
      documentProfiles.push({
        drawingId: target.id,
        displayName,
        docClass: classification.docClass,
        docClassLabelKo: getDocClassLabelKo(classification.docClass),
        pageCount: limit,
        equipmentCount: docEquipment.length,
        cableCount: docCables.length,
        tagCount: docEntities.filter((e) => e.kind === 'TAG').length,
        jbCount: docEntities.filter((e) => e.kind === 'JUNCTION_BOX').length,
        isMakerDrawing: makerProfile.isMakerDrawing,
        detectedVendorHint: classification.vendorHint,
      });
    })
  );

  pages.sort((a, b) =>
    a.drawingId === b.drawingId
      ? a.pageNum - b.pageNum
      : a.drawingId.localeCompare(b.drawingId)
  );

  const entityCountsByKind: Record<ExtractedEntityKind, number> = {
    TAG: 0,
    CABLE: 0,
    JUNCTION_BOX: 0,
    LINE_NO: 0,
    EQUIPMENT: 0,
    HOLD_OR_NOTE: 0,
    REVISION: 0,
  };
  for (const ent of allEntities) {
    entityCountsByKind[ent.kind] += 1;
  }

  const universalMatches = buildUniversalDiagramMatches({
    profiles: documentProfiles,
    entities: allEntities,
    equipmentRecords: allEquipmentRecords,
    cableRecords: allCableRecords,
    makerProfiles,
  });

  return {
    totalDurationMs: Date.now() - started,
    drawingsAnalyzed: targets.length,
    pagesScanned: pages.length,
    pages,
    entities: allEntities,
    entityCountsByKind,
    crossDrawingPresence: buildCrossDrawingPresence(allEntities),
    documentProfiles,
    equipmentRecords: allEquipmentRecords,
    cableRecords: allCableRecords,
    makerProfiles,
    universalMatches,
  };
}
