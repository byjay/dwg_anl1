import { jsPDF } from 'jspdf';
import type {
  DiscrepancySeverity,
  DrawingPinNote,
  EvaluatedLoopMatch,
  LearnedEngineeringRule,
  RuleViolationHit,
  SpecReviewReport,
} from '../types/diagram';
import type {
  DirectiveStatus,
  MasterChecklistSummary,
  MasterDirectiveItem,
} from './masterChecklistEngine';

export interface ChecklistPdfExportOptions {
  projectCode?: string;
  generatedAt?: string;
  checklistScope: 'ALL' | 'FILTERED';
  includeChecklist: boolean;
  includeIssues: boolean;
  includeLearnedRules: boolean;
  includeResolvedNotes?: boolean;
  filterDescription?: string;
}

export type IssueSourceKind = 'LOOP_DIFF' | 'RULE_HIT' | 'SPEC_CHECK' | 'PIN_NOTE';

export interface PdfIdentifiedIssueRow {
  seq: number;
  source: IssueSourceKind;
  sourceLabel: string;
  severity: DiscrepancySeverity;
  tagOrTarget: string;
  location: string;
  title: string;
  detail: string;
  recommendation: string;
}

export interface PdfChecklistRow {
  id: number;
  code: string;
  domainTitle: string;
  title: string;
  standardRef: string;
  status: DirectiveStatus;
  statusLabel: string;
  verified: boolean;
  evidenceModule: string;
  implementationNote: string;
}

export interface PdfLearnedRuleRow {
  seq: number;
  code: string;
  categoryLabelKo: string;
  severity: DiscrepancySeverity;
  enabled: boolean;
  sourceLabel: string;
  tCodeOrigin: string;
  appliedCount: number;
  titleKo: string;
  patternOrCondition: string;
  learnedLessonKo: string;
  posRequirementClause: string;
}

export interface ChecklistPdfReportData {
  documentNo: string;
  documentTitle: string;
  projectCode: string;
  generatedAt: string;
  filterDescription: string;
  options: ChecklistPdfExportOptions;
  checklistStats: {
    total: number;
    exportedCount: number;
    verifiedCount: number;
    implementedCount: number;
    partialCount: number;
    plannedCount: number;
    appliedPct: number;
    citationGroundingPct: number;
  };
  domainRows: MasterChecklistSummary['domainBreakdown'];
  checklistRows: PdfChecklistRow[];
  issues: PdfIdentifiedIssueRow[];
  issueStats: {
    total: number;
    critical: number;
    warning: number;
    info: number;
    bySource: {
      loopDiff: number;
      ruleHit: number;
      specCheck: number;
      pinNote: number;
    };
  };
  learnedRuleRows: PdfLearnedRuleRow[];
  learnedStats: {
    total: number;
    enabledCount: number;
    disabledCount: number;
    systemCount: number;
    userCount: number;
    totalApplications: number;
  };
}

const SEVERITY_ORDER: Record<DiscrepancySeverity, number> = {
  CRITICAL: 0,
  WARNING: 1,
  INFO: 2,
};

const SOURCE_ORDER: Record<IssueSourceKind, number> = {
  LOOP_DIFF: 0,
  RULE_HIT: 1,
  SPEC_CHECK: 2,
  PIN_NOTE: 3,
};

function statusLabelKo(status: DirectiveStatus): string {
  if (status === 'IMPLEMENTED') return '적용 완료';
  if (status === 'PARTIAL') return '부분 적용';
  return '로드맵';
}

export interface BuildChecklistPdfReportParams {
  allItems: MasterDirectiveItem[];
  filteredItems: MasterDirectiveItem[];
  summary: MasterChecklistSummary;
  verifiedIds: Record<number, boolean>;
  evaluatedLoops: EvaluatedLoopMatch[];
  ruleViolations: RuleViolationHit[];
  specReport: SpecReviewReport;
  pinNotes: DrawingPinNote[];
  learnedRules: LearnedEngineeringRule[];
  options: ChecklistPdfExportOptions;
}

export function buildChecklistPdfReportData(
  params: BuildChecklistPdfReportParams
): ChecklistPdfReportData {
  const {
    allItems,
    filteredItems,
    summary,
    verifiedIds,
    evaluatedLoops,
    ruleViolations,
    specReport,
    pinNotes,
    learnedRules,
    options,
  } = params;

  const projectCode = options.projectCode || 'H042 FGSS Marine Engineering';
  const generatedAt = options.generatedAt || new Date().toLocaleString('ko-KR');

  const selectedChecklistItems =
    options.checklistScope === 'FILTERED' ? filteredItems : allItems;

  const checklistRows: PdfChecklistRow[] = selectedChecklistItems.map((item) => ({
    id: item.id,
    code: item.code,
    domainTitle: item.domainTitle,
    title: item.title,
    standardRef: item.standardRef,
    status: item.status,
    statusLabel: statusLabelKo(item.status),
    verified: Boolean(verifiedIds[item.id]),
    evidenceModule: item.evidenceModule,
    implementationNote: item.implementationNote,
  }));

  const verifiedCount = allItems.filter((item) => Boolean(verifiedIds[item.id])).length;

  // Aggregate all identified issues across Loop Discrepancies, Rule Violations, Spec Issues, Pin Notes
  const rawIssues: Omit<PdfIdentifiedIssueRow, 'seq'>[] = [];

  for (const loop of evaluatedLoops) {
    for (const disc of loop.discrepancies) {
      rawIssues.push({
        source: 'LOOP_DIFF',
        sourceLabel: `루프 교차매칭 (${disc.category})`,
        severity: disc.severity,
        tagOrTarget: loop.canonicalTag,
        location:
          disc.affectedDrawings.length > 0
            ? `${disc.affectedDrawings.join(', ')} · Unit ${loop.unitCode}`
            : `PR-${loop.unitCode}-PID-0001 (${loop.pid.sheet}) · Unit ${loop.unitCode}`,
        title: disc.title,
        detail: disc.description,
        recommendation: disc.recommendedAction,
      });
    }
  }

  for (const hit of ruleViolations) {
    rawIssues.push({
      source: 'RULE_HIT',
      sourceLabel: `검증룰 (${hit.ruleCode})`,
      severity: hit.severity,
      tagOrTarget: hit.tagOrTarget,
      location: hit.drawingId
        ? `${hit.drawingId}${hit.pageNum ? ` p.${hit.pageNum}` : ''}`
        : `엔진(${hit.source})`,
      title: hit.ruleNameKo,
      detail: hit.evidence,
      recommendation: hit.recommendation,
    });
  }

  for (const chk of specReport.checks) {
    if (chk.status === 'PASS') continue;
    rawIssues.push({
      source: 'SPEC_CHECK',
      sourceLabel: `스펙검토 (${chk.specCode})`,
      severity: chk.severity,
      tagOrTarget:
        chk.affectedTags.length > 0 ? chk.affectedTags.join(', ') : chk.disciplineLabelKo,
      location: `${chk.drawingId} p.${chk.pageNum}`,
      title: `[${chk.status === 'HOLD_REQUIRED' ? 'HOLD' : '부적합'}] ${chk.titleKo}`,
      detail: `${chk.observedDrawingState} (기준: ${chk.standardRequired})`,
      recommendation: chk.recommendationKo,
    });
  }

  for (const note of pinNotes) {
    if (!options.includeResolvedNotes && note.status === 'RESOLVED') continue;
    rawIssues.push({
      source: 'PIN_NOTE',
      sourceLabel: `도면 핀노트 (${note.status})`,
      severity: note.severity,
      tagOrTarget: note.tagRef || '-',
      location: `${note.drawingId} p.${note.pageNum} (${Math.round(note.xPct)}%, ${Math.round(note.yPct)}%)`,
      title: `작성자: ${note.author} · ${note.status}`,
      detail: note.content,
      recommendation:
        note.status === 'RESOLVED'
          ? '해결 완료 확인됨'
          : `해당 도면 좌표(${note.drawingId} p.${note.pageNum}) 검토 후 상태 갱신`,
    });
  }

  rawIssues.sort((a, b) => {
    const sevDiff = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    if (sevDiff !== 0) return sevDiff;
    const srcDiff = SOURCE_ORDER[a.source] - SOURCE_ORDER[b.source];
    if (srcDiff !== 0) return srcDiff;
    return a.tagOrTarget.localeCompare(b.tagOrTarget);
  });

  const issues: PdfIdentifiedIssueRow[] = rawIssues.map((item, idx) => ({
    ...item,
    seq: idx + 1,
  }));

  const sortedRules = [...learnedRules].sort((a, b) => {
    if (a.enabled !== b.enabled) return a.enabled ? -1 : 1;
    const sevDiff = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    if (sevDiff !== 0) return sevDiff;
    return a.code.localeCompare(b.code);
  });

  const learnedRuleRows: PdfLearnedRuleRow[] = sortedRules.map((rule, idx) => ({
    seq: idx + 1,
    code: rule.code,
    categoryLabelKo: rule.categoryLabelKo,
    severity: rule.severity,
    enabled: rule.enabled,
    sourceLabel: rule.source === 'USER_LEARNED' ? '엔지니어 등록' : '시스템 학습',
    tCodeOrigin: rule.tCodeOrigin,
    appliedCount: rule.appliedCount,
    titleKo: rule.titleKo,
    patternOrCondition: rule.patternOrCondition,
    learnedLessonKo: rule.learnedLessonKo,
    posRequirementClause: rule.posRequirementClause,
  }));

  return {
    documentNo: 'H042-ZCL99-RPT-001',
    documentTitle: '종합 설계가이드(1~99) 체크리스트 · 검출 이슈 · 학습 규칙 검증 보고서',
    projectCode,
    generatedAt,
    filterDescription:
      options.filterDescription ||
      (options.checklistScope === 'FILTERED'
        ? `체크리스트 필터 적용 (${checklistRows.length}/${allItems.length}건)`
        : `전체 마스터 체크리스트 (${allItems.length}건)`),
    options,
    checklistStats: {
      total: summary.total,
      exportedCount: checklistRows.length,
      verifiedCount,
      implementedCount: summary.implementedCount,
      partialCount: summary.partialCount,
      plannedCount: summary.plannedCount,
      appliedPct: summary.appliedPct,
      citationGroundingPct: summary.citationGroundingPct,
    },
    domainRows: summary.domainBreakdown,
    checklistRows,
    issues,
    issueStats: {
      total: issues.length,
      critical: issues.filter((i) => i.severity === 'CRITICAL').length,
      warning: issues.filter((i) => i.severity === 'WARNING').length,
      info: issues.filter((i) => i.severity === 'INFO').length,
      bySource: {
        loopDiff: issues.filter((i) => i.source === 'LOOP_DIFF').length,
        ruleHit: issues.filter((i) => i.source === 'RULE_HIT').length,
        specCheck: issues.filter((i) => i.source === 'SPEC_CHECK').length,
        pinNote: issues.filter((i) => i.source === 'PIN_NOTE').length,
      },
    },
    learnedRuleRows,
    learnedStats: {
      total: learnedRuleRows.length,
      enabledCount: learnedRuleRows.filter((r) => r.enabled).length,
      disabledCount: learnedRuleRows.filter((r) => !r.enabled).length,
      systemCount: learnedRuleRows.filter((r) => r.sourceLabel === '시스템 학습').length,
      userCount: learnedRuleRows.filter((r) => r.sourceLabel === '엔지니어 등록').length,
      totalApplications: learnedRuleRows.reduce((acc, r) => acc + r.appliedCount, 0),
    },
  };
}

/**
 * Pure character-aware line wrapper useful both as fallback and in unit tests.
 */
export function splitTextIntoLines(text: string, maxUnitsPerLine: number): string[] {
  const clean = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (!clean) return ['-'];
  if (maxUnitsPerLine <= 2) return [clean];

  const lines: string[] = [];
  let current = '';
  let units = 0;

  for (const ch of clean) {
    const code = ch.charCodeAt(0);
    const charWeight = code > 0x2e7f ? 1.85 : 1;
    if (units + charWeight > maxUnitsPerLine && current.length > 0) {
      lines.push(current.trimEnd());
      current = ch === ' ' ? '' : ch;
      units = ch === ' ' ? 0 : charWeight;
    } else {
      current += ch;
      units += charWeight;
    }
  }
  if (current.trim().length > 0) {
    lines.push(current.trimEnd());
  }
  return lines.length > 0 ? lines : ['-'];
}

// ============================================================================
// High-DPI Canvas 2D -> Print-Ready A4 Landscape PDF Generator (via jsPDF)
// ============================================================================

const PAGE_W = 1754; // 297mm @ 150 DPI
const PAGE_H = 1240; // 210mm @ 150 DPI
const MARGIN_X = 56;
const CONTENT_W = PAGE_W - MARGIN_X * 2; // 1642 px
const HEADER_BOTTOM_Y = 100;
const MAX_CONTENT_Y = 1166;
const FOOTER_Y = 1192;

const FONT_FAMILY_SANS = '"IBM Plex Sans KR", "Plus Jakarta Sans", "Noto Sans KR", sans-serif';
const FONT_FAMILY_MONO = '"JetBrains Mono", "IBM Plex Sans KR", ui-monospace, monospace';

interface PdfTableColumn {
  header: string;
  width: number;
  mono?: boolean;
  align?: 'left' | 'center';
}

interface PdfCellValue {
  text: string;
  bold?: boolean;
  color?: string;
  pillBg?: string;
  pillBorder?: string;
  pillText?: string;
}

function wrapCanvasText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  font: string
): string[] {
  const clean = String(text ?? '').replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
  if (!clean) return ['-'];
  ctx.font = font;

  const lines: string[] = [];
  let current = '';

  for (const ch of clean) {
    const candidate = current + ch;
    if (ctx.measureText(candidate).width > maxWidth && current.length > 0) {
      // Try breaking at last space if there is one nearby
      const lastSpace = current.lastIndexOf(' ');
      if (lastSpace > current.length * 0.45 && ch !== ' ') {
        lines.push(current.slice(0, lastSpace).trimEnd());
        current = current.slice(lastSpace + 1) + ch;
      } else {
        lines.push(current.trimEnd());
        current = ch === ' ' ? '' : ch;
      }
    } else {
      current = candidate;
    }
  }
  if (current.trim().length > 0) {
    lines.push(current.trimEnd());
  }
  return lines.length > 0 ? lines : ['-'];
}

function severityPalette(sev: DiscrepancySeverity): {
  bg: string;
  border: string;
  text: string;
} {
  if (sev === 'CRITICAL') return { bg: '#FEE2E2', border: '#FCA5A5', text: '#991B1B' };
  if (sev === 'WARNING') return { bg: '#FEF3C7', border: '#FCD34D', text: '#92400E' };
  return { bg: '#E0F2FE', border: '#7DD3FC', text: '#075985' };
}

function statusPalette(status: DirectiveStatus): {
  bg: string;
  border: string;
  text: string;
} {
  if (status === 'IMPLEMENTED') return { bg: '#DCFCE7', border: '#86EFAC', text: '#166534' };
  if (status === 'PARTIAL') return { bg: '#FEF3C7', border: '#FCD34D', text: '#92400E' };
  return { bg: '#F1F5F9', border: '#CBD5E1', text: '#334155' };
}

export interface GeneratedPdfResult {
  blob: Blob;
  filename: string;
  pageCount: number;
  data: ChecklistPdfReportData;
}

export async function generateChecklistPdfBlob(
  data: ChecklistPdfReportData
): Promise<GeneratedPdfResult> {
  if (typeof document === 'undefined') {
    throw new Error('PDF generation requires a browser DOM environment.');
  }
  if (document.fonts?.ready) {
    await document.fonts.ready;
  }

  const pages: Array<{ canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D }> = [];
  let activePageIdx = -1;
  let cursorY = HEADER_BOTTOM_Y;

  const drawRunningHeader = (ctx: CanvasRenderingContext2D, sectionLabel: string) => {
    // Top accent bar
    ctx.fillStyle = '#0070F2';
    ctx.fillRect(0, 0, PAGE_W, 8);

    // Header text bar
    ctx.fillStyle = '#0F172A';
    ctx.font = `700 18px ${FONT_FAMILY_SANS}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${data.documentNo}  ·  ${sectionLabel}`, MARGIN_X, 46);

    ctx.fillStyle = '#475569';
    ctx.font = `500 15px ${FONT_FAMILY_MONO}`;
    ctx.textAlign = 'right';
    ctx.fillText(`${data.projectCode}  |  ${data.generatedAt}`, PAGE_W - MARGIN_X, 46);

    ctx.strokeStyle = '#CBD5E1';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(MARGIN_X, 74);
    ctx.lineTo(PAGE_W - MARGIN_X, 74);
    ctx.stroke();

    ctx.textAlign = 'left';
  };

  const addNewPage = (sectionLabel: string) => {
    const canvas = document.createElement('canvas');
    canvas.width = PAGE_W;
    canvas.height = PAGE_H;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Unable to acquire 2D canvas context for PDF rendering.');
    }
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, PAGE_W, PAGE_H);
    drawRunningHeader(ctx, sectionLabel);
    pages.push({ canvas, ctx });
    activePageIdx = pages.length - 1;
    cursorY = HEADER_BOTTOM_Y;
    return ctx;
  };

  const getCtx = () => pages[activePageIdx].ctx;

  const drawSectionHeading = (title: string, subtitle?: string) => {
    if (cursorY + 72 > MAX_CONTENT_Y) {
      addNewPage(title);
    }
    const ctx = getCtx();
    ctx.fillStyle = '#103258';
    ctx.fillRect(MARGIN_X, cursorY, 6, 32);

    ctx.fillStyle = '#0F172A';
    ctx.font = `700 22px ${FONT_FAMILY_SANS}`;
    ctx.textBaseline = 'top';
    ctx.fillText(title, MARGIN_X + 18, cursorY + 2);

    if (subtitle) {
      ctx.fillStyle = '#475569';
      ctx.font = `500 14px ${FONT_FAMILY_SANS}`;
      ctx.fillText(subtitle, MARGIN_X + 18, cursorY + 32);
      cursorY += 62;
    } else {
      cursorY += 46;
    }
  };

  const drawTable = (
    sectionLabel: string,
    columns: PdfTableColumn[],
    rows: PdfCellValue[][]
  ) => {
    const drawTableHeader = (ctx: CanvasRenderingContext2D) => {
      const headerH = 38;
      ctx.fillStyle = '#F1F5F9';
      ctx.fillRect(MARGIN_X, cursorY, CONTENT_W, headerH);
      ctx.strokeStyle = '#CBD5E1';
      ctx.lineWidth = 1;
      ctx.strokeRect(MARGIN_X, cursorY, CONTENT_W, headerH);

      let x = MARGIN_X;
      ctx.fillStyle = '#334155';
      ctx.font = `700 14px ${FONT_FAMILY_SANS}`;
      ctx.textBaseline = 'middle';
      for (const col of columns) {
        ctx.textAlign = col.align === 'center' ? 'center' : 'left';
        const tx = col.align === 'center' ? x + col.width / 2 : x + 10;
        ctx.fillText(col.header, tx, cursorY + headerH / 2);
        x += col.width;
        if (x < MARGIN_X + CONTENT_W) {
          ctx.beginPath();
          ctx.moveTo(x, cursorY);
          ctx.lineTo(x, cursorY + headerH);
          ctx.stroke();
        }
      }
      ctx.textAlign = 'left';
      cursorY += headerH;
    };

    if (cursorY + 90 > MAX_CONTENT_Y) {
      addNewPage(sectionLabel);
    }
    drawTableHeader(getCtx());

    if (rows.length === 0) {
      const ctx = getCtx();
      ctx.fillStyle = '#F8FAFC';
      ctx.fillRect(MARGIN_X, cursorY, CONTENT_W, 44);
      ctx.strokeStyle = '#CBD5E1';
      ctx.strokeRect(MARGIN_X, cursorY, CONTENT_W, 44);
      ctx.fillStyle = '#64748B';
      ctx.font = `500 14px ${FONT_FAMILY_SANS}`;
      ctx.textBaseline = 'middle';
      ctx.fillText('해당 조건에 해당하는 항목이 없습니다.', MARGIN_X + 14, cursorY + 22);
      cursorY += 54;
      return;
    }

    const lineH = 20;
    const padY = 10;
    const padX = 10;

    for (let rIdx = 0; rIdx < rows.length; rIdx++) {
      const row = rows[rIdx];
      let ctx = getCtx();

      const cellLayouts = columns.map((col, cIdx) => {
        const cell = row[cIdx] || { text: '' };
        const font = `${cell.bold ? '700' : '400'} 13.5px ${
          col.mono ? FONT_FAMILY_MONO : FONT_FAMILY_SANS
        }`;
        if (cell.pillBg) {
          return { lines: [cell.text], font, isPill: true, cell };
        }
        const lines = wrapCanvasText(ctx, cell.text, Math.max(24, col.width - padX * 2), font);
        return { lines, font, isPill: false, cell };
      });

      const maxLines = Math.max(
        1,
        ...cellLayouts.map((cl) => (cl.isPill ? 1 : cl.lines.length))
      );
      const rowH = Math.max(36, maxLines * lineH + padY * 2);

      if (cursorY + rowH > MAX_CONTENT_Y) {
        ctx = addNewPage(sectionLabel);
        drawTableHeader(ctx);
      }

      // Alternating subtle zebra striping
      ctx.fillStyle = rIdx % 2 === 1 ? '#F8FAFC' : '#FFFFFF';
      ctx.fillRect(MARGIN_X, cursorY, CONTENT_W, rowH);
      ctx.strokeStyle = '#E2E8F0';
      ctx.lineWidth = 1;
      ctx.strokeRect(MARGIN_X, cursorY, CONTENT_W, rowH);

      let x = MARGIN_X;
      for (let cIdx = 0; cIdx < columns.length; cIdx++) {
        const col = columns[cIdx];
        const layout = cellLayouts[cIdx];
        const { cell } = layout;

        if (layout.isPill && cell.pillBg) {
          ctx.font = `700 12.5px ${FONT_FAMILY_MONO}`;
          const textW = ctx.measureText(cell.text).width;
          const pillW = Math.min(col.width - 12, textW + 18);
          const pillH = 24;
          const pillX =
            col.align === 'center' ? x + (col.width - pillW) / 2 : x + padX;
          const pillY = cursorY + 8;

          ctx.fillStyle = cell.pillBg;
          ctx.beginPath();
          ctx.roundRect(pillX, pillY, pillW, pillH, 4);
          ctx.fill();
          if (cell.pillBorder) {
            ctx.strokeStyle = cell.pillBorder;
            ctx.stroke();
          }

          ctx.fillStyle = cell.pillText || '#0F172A';
          ctx.textBaseline = 'middle';
          ctx.textAlign = 'center';
          ctx.fillText(cell.text, pillX + pillW / 2, pillY + pillH / 2 + 0.5);
          ctx.textAlign = 'left';
        } else {
          ctx.font = layout.font;
          ctx.fillStyle = cell.color || '#1E293B';
          ctx.textBaseline = 'top';
          ctx.textAlign = col.align === 'center' ? 'center' : 'left';
          const textX = col.align === 'center' ? x + col.width / 2 : x + padX;

          layout.lines.forEach((line, lIdx) => {
            ctx.fillText(line, textX, cursorY + padY + lIdx * lineH);
          });
          ctx.textAlign = 'left';
        }

        x += col.width;
        if (x < MARGIN_X + CONTENT_W) {
          ctx.strokeStyle = '#E2E8F0';
          ctx.beginPath();
          ctx.moveTo(x, cursorY);
          ctx.lineTo(x, cursorY + rowH);
          ctx.stroke();
        }
      }

      cursorY += rowH;
    }

    cursorY += 22;
  };

  // ========================================================================
  // PAGE 1: Executive Summary & Domain Progress Overview
  // ========================================================================
  const p1 = addNewPage('요약 개요 (Executive Summary)');

  // Cover Title Banner
  p1.fillStyle = '#0F172A';
  p1.fillRect(MARGIN_X, cursorY, CONTENT_W, 108);
  p1.fillStyle = '#0070F2';
  p1.fillRect(MARGIN_X, cursorY, 10, 108);

  p1.fillStyle = '#93C5FD';
  p1.font = `700 14px ${FONT_FAMILY_MONO}`;
  p1.textBaseline = 'top';
  p1.fillText(
    `SAP T-CODE ZCL99  ·  OFFICIAL ENGINEERING AUDIT REPORT  ·  ${data.documentNo}`,
    MARGIN_X + 28,
    cursorY + 18
  );

  p1.fillStyle = '#FFFFFF';
  p1.font = `700 26px ${FONT_FAMILY_SANS}`;
  p1.fillText(data.documentTitle, MARGIN_X + 28, cursorY + 42);

  p1.fillStyle = '#CBD5E1';
  p1.font = `500 14px ${FONT_FAMILY_SANS}`;
  p1.fillText(
    `대상 프로젝트: ${data.projectCode}   |   생성 일시: ${data.generatedAt}   |   범위: ${data.filterDescription}`,
    MARGIN_X + 28,
    cursorY + 78
  );
  cursorY += 130;

  // 3-Column Executive KPI Cards
  const cardGap = 18;
  const cardW = (CONTENT_W - cardGap * 2) / 3;
  const cardH = 148;

  const kpiCards = [
    {
      accent: '#0070F2',
      title: '1. 마스터 체크리스트 현황 (1~99)',
      bigValue: `${data.checklistStats.appliedPct}% (${data.checklistStats.implementedCount}/${data.checklistStats.total})`,
      lines: [
        `• 적용 완료: ${data.checklistStats.implementedCount}건  |  부분 적용: ${data.checklistStats.partialCount}건`,
        `• 인프라 로드맵: ${data.checklistStats.plannedCount}건  |  출력 건수: ${data.checklistStats.exportedCount}건`,
        `• 엔지니어 수동 검증: ${data.checklistStats.verifiedCount} / ${data.checklistStats.total}건 확인`,
      ],
    },
    {
      accent: data.issueStats.critical > 0 ? '#DC2626' : '#D97706',
      title: '2. 검출된 설계 이슈 (Identified Issues)',
      bigValue: `총 ${data.issueStats.total}건  (CRITICAL ${data.issueStats.critical})`,
      lines: [
        `• CRITICAL: ${data.issueStats.critical}건  |  WARNING: ${data.issueStats.warning}건  |  INFO: ${data.issueStats.info}건`,
        `• 루프 교차매칭: ${data.issueStats.bySource.loopDiff}건  |  검증룰: ${data.issueStats.bySource.ruleHit}건`,
        `• 스펙 부적합/홀드: ${data.issueStats.bySource.specCheck}건  |  핀노트: ${data.issueStats.bySource.pinNote}건`,
      ],
    },
    {
      accent: '#059669',
      title: '3. 학습된 엔지니어링 규칙 (Learned Rules)',
      bigValue: `${data.learnedStats.enabledCount} / ${data.learnedStats.total}건 활성`,
      lines: [
        `• 활성 규칙: ${data.learnedStats.enabledCount}건  |  비활성: ${data.learnedStats.disabledCount}건`,
        `• 시스템 학습: ${data.learnedStats.systemCount}건  |  엔지니어 등록: ${data.learnedStats.userCount}건`,
        `• 누적 POS·스펙 적용 횟수: ${data.learnedStats.totalApplications}회`,
      ],
    },
  ];

  kpiCards.forEach((card, idx) => {
    const cx = MARGIN_X + idx * (cardW + cardGap);
    p1.fillStyle = '#F8FAFC';
    p1.fillRect(cx, cursorY, cardW, cardH);
    p1.strokeStyle = '#CBD5E1';
    p1.lineWidth = 1.5;
    p1.strokeRect(cx, cursorY, cardW, cardH);
    p1.fillStyle = card.accent;
    p1.fillRect(cx, cursorY, cardW, 6);

    p1.fillStyle = '#475569';
    p1.font = `700 14px ${FONT_FAMILY_SANS}`;
    p1.fillText(card.title, cx + 18, cursorY + 18);

    p1.fillStyle = '#0F172A';
    p1.font = `700 22px ${FONT_FAMILY_MONO}`;
    p1.fillText(card.bigValue, cx + 18, cursorY + 46);

    p1.fillStyle = '#334155';
    p1.font = `500 13.5px ${FONT_FAMILY_SANS}`;
    card.lines.forEach((line, lIdx) => {
      p1.fillText(line, cx + 18, cursorY + 82 + lIdx * 20);
    });
  });
  cursorY += cardH + 26;

  // Domain Progress Summary Table on Page 1
  drawSectionHeading(
    '9대 엔지니어링 영역별 체크리스트 적용 현황',
    '영역별(11개 항목 × 9개 영역 = 99건) TypeScript/UI 적용 완료, 부분 적용 및 로드맵 현황'
  );

  const domainColumns: PdfTableColumn[] = [
    { header: '영역명', width: 520 },
    { header: '전체', width: 120, mono: true, align: 'center' },
    { header: '적용 완료', width: 140, mono: true, align: 'center' },
    { header: '부분 적용', width: 140, mono: true, align: 'center' },
    { header: '로드맵', width: 140, mono: true, align: 'center' },
    { header: '영역 적용률 (가중)', width: 582, mono: true },
  ];

  const domainTableRows: PdfCellValue[][] = data.domainRows.map((d) => {
    const pct = Math.round(((d.implemented + d.partial * 0.5) / d.total) * 100);
    const barFilled = Math.round(pct / 5);
    const barStr = `${'█'.repeat(barFilled)}${'░'.repeat(20 - barFilled)}  ${pct}%`;
    return [
      { text: d.domainTitle, bold: true },
      { text: `${d.total}건` },
      { text: `${d.implemented}건`, color: '#166534', bold: true },
      { text: `${d.partial}건`, color: '#92400E' },
      { text: `${d.planned}건`, color: '#475569' },
      { text: barStr, color: '#0F172A' },
    ];
  });

  drawTable('9대 영역별 적용 현황', domainColumns, domainTableRows);

  // ========================================================================
  // SECTION 1: Checklist Status (1~99)
  // ========================================================================
  if (data.options.includeChecklist) {
    addNewPage('Section 1 · 마스터 체크리스트 상태');
    drawSectionHeading(
      `Section 1 · 마스터 체크리스트 현황 (${data.checklistRows.length}건)`,
      data.filterDescription
    );

    const checklistCols: PdfTableColumn[] = [
      { header: '코드', width: 102, mono: true, align: 'center' },
      { header: '영역 / 지시사항 항목', width: 410 },
      { header: '표준·기술', width: 170, mono: true },
      { header: '적용상태', width: 124, mono: true, align: 'center' },
      { header: '검증', width: 92, mono: true, align: 'center' },
      { header: '적용 내역 및 근거 모듈', width: 744 },
    ];

    const checklistTableRows: PdfCellValue[][] = data.checklistRows.map((item) => {
      const pal = statusPalette(item.status);
      return [
        { text: item.code, bold: true },
        { text: `[${item.domainTitle}] ${item.title}`, bold: true },
        { text: item.standardRef, color: '#334155' },
        {
          text: item.statusLabel,
          pillBg: pal.bg,
          pillBorder: pal.border,
          pillText: pal.text,
        },
        {
          text: item.verified ? '✔ 확인' : '미확인',
          color: item.verified ? '#166534' : '#64748B',
          bold: item.verified,
        },
        { text: `${item.implementationNote} (근거: ${item.evidenceModule})` },
      ];
    });

    drawTable('Section 1 · 마스터 체크리스트 상태', checklistCols, checklistTableRows);
  }

  // ========================================================================
  // SECTION 2: Identified Issues
  // ========================================================================
  if (data.options.includeIssues) {
    addNewPage('Section 2 · 검출된 설계 이슈 (Issues)');
    drawSectionHeading(
      `Section 2 · 검출된 설계 이슈 및 위반 내역 (${data.issues.length}건)`,
      `루프 교차매칭 ${data.issueStats.bySource.loopDiff}건 · 검증룰 ${data.issueStats.bySource.ruleHit}건 · 스펙검토 ${data.issueStats.bySource.specCheck}건 · 핀노트 ${data.issueStats.bySource.pinNote}건`
    );

    const issueCols: PdfTableColumn[] = [
      { header: 'No', width: 64, mono: true, align: 'center' },
      { header: '심각도', width: 118, mono: true, align: 'center' },
      { header: '출처 / 도면·위치', width: 280 },
      { header: '대상 태그', width: 190, mono: true },
      { header: '이슈 제목 및 근거 상세', width: 510 },
      { header: '권고 조치 사항', width: 480 },
    ];

    const issueTableRows: PdfCellValue[][] = data.issues.map((iss) => {
      const pal = severityPalette(iss.severity);
      return [
        { text: String(iss.seq) },
        {
          text: iss.severity,
          pillBg: pal.bg,
          pillBorder: pal.border,
          pillText: pal.text,
        },
        { text: `${iss.sourceLabel} | ${iss.location}` },
        { text: iss.tagOrTarget, bold: true, color: '#0F172A' },
        { text: `${iss.title} — ${iss.detail}` },
        { text: iss.recommendation, color: '#0F172A' },
      ];
    });

    drawTable('Section 2 · 검출된 설계 이슈', issueCols, issueTableRows);
  }

  // ========================================================================
  // SECTION 3: Learned Engineering Rules
  // ========================================================================
  if (data.options.includeLearnedRules) {
    addNewPage('Section 3 · 학습된 엔지니어링 규칙');
    drawSectionHeading(
      `Section 3 · 학습된 엔지니어링 규칙 (${data.learnedRuleRows.length}건)`,
      `활성 ${data.learnedStats.enabledCount}건 · 비활성 ${data.learnedStats.disabledCount}건 · 누적 적용 ${data.learnedStats.totalApplications}회`
    );

    const ruleCols: PdfTableColumn[] = [
      { header: '코드', width: 108, mono: true, align: 'center' },
      { header: '심각도', width: 118, mono: true, align: 'center' },
      { header: '상태 / 출처', width: 146, mono: true, align: 'center' },
      { header: '규칙명 및 적용 조건', width: 400 },
      { header: '학습 교훈 (Lesson Learned)', width: 430 },
      { header: 'POS 발주사양 자동 반영 조항', width: 440 },
    ];

    const ruleTableRows: PdfCellValue[][] = data.learnedRuleRows.map((rule) => {
      const pal = severityPalette(rule.severity);
      return [
        { text: rule.code, bold: true },
        {
          text: rule.severity,
          pillBg: pal.bg,
          pillBorder: pal.border,
          pillText: pal.text,
        },
        {
          text: `${rule.enabled ? '활성' : '비활성'} (${rule.tCodeOrigin}, ${rule.appliedCount}회)`,
          color: rule.enabled ? '#166534' : '#64748B',
          bold: rule.enabled,
        },
        {
          text: `[${rule.categoryLabelKo}] ${rule.titleKo} — 조건: ${rule.patternOrCondition}`,
          bold: true,
        },
        { text: rule.learnedLessonKo },
        { text: rule.posRequirementClause, color: '#0F172A' },
      ];
    });

    drawTable('Section 3 · 학습된 엔지니어링 규칙', ruleCols, ruleTableRows);
  }

  // Stamp running footer with exact Page X of Y on every page
  const totalPages = pages.length;
  pages.forEach(({ ctx }, idx) => {
    ctx.strokeStyle = '#CBD5E1';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(MARGIN_X, FOOTER_Y - 12);
    ctx.lineTo(PAGE_W - MARGIN_X, FOOTER_Y - 12);
    ctx.stroke();

    ctx.fillStyle = '#64748B';
    ctx.font = `500 13px ${FONT_FAMILY_SANS}`;
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    ctx.fillText(
      `H042 Engineering Verification Workbench · Checklist, Issues & Learned Rules Audit Package`,
      MARGIN_X,
      FOOTER_Y
    );

    ctx.font = `700 13.5px ${FONT_FAMILY_MONO}`;
    ctx.textAlign = 'right';
    ctx.fillText(`Page ${idx + 1} of ${totalPages}`, PAGE_W - MARGIN_X, FOOTER_Y);
    ctx.textAlign = 'left';
  });

  // Compile Canvas pages into real PDF binary via jsPDF
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
    compress: true,
  });

  pages.forEach(({ canvas }, idx) => {
    if (idx > 0) {
      doc.addPage('a4', 'landscape');
    }
    const imgData = canvas.toDataURL('image/jpeg', 0.9);
    doc.addImage(imgData, 'JPEG', 0, 0, 297, 210);
  });

  const blob = doc.output('blob');
  const stamp = new Date().toISOString().slice(0, 10);
  const filename = `H042_Checklist_Issues_Rules_${stamp}.pdf`;

  return {
    blob,
    filename,
    pageCount: totalPages,
    data,
  };
}
