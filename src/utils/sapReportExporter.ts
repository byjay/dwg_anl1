import type { DiscrepancySeverity } from '../types/diagram';
import type {
  ProcessChecklistEvaluation,
  ProcessChecklistItem,
  ReviewDisciplineStage,
} from './drawingProcessChecklistEngine';

export interface SapIncompleteAlvRow {
  lineNo: string;
  mandt: string;
  pspid: string;
  itemId: string;
  stageOrder: string;
  discipline: ReviewDisciplineStage;
  disciplineKo: string;
  sapTCode: string;
  alvStatusIcon: '@0A@' | '@09@' | '@08@';
  sapStatusCode: 'E0001_HOLD' | 'E0002_OPEN';
  sapStatusLabelKo: string;
  severity: DiscrepancySeverity;
  affectedCount: number;
  targetTags: string;
  drawingRefs: string;
  checkTitle: string;
  incompleteReason: string;
  requiredAction: string;
  responsibleGroup: string;
}

export interface SapIncompleteReportPayload {
  header: {
    reportId: 'ZREVIEW_OPEN_ITEMS';
    programName: 'ZR_H042_DWG_CHK_01';
    plantCode: string;
    projectDef: string;
    client: '800';
    generatedAt: string;
    generatedIso: string;
    releaseGateStatus: 'RELEASE_READY' | 'HOLD_BLOCKED' | 'OPEN_ITEMS_PENDING';
  };
  summary: {
    totalChecklistItems: number;
    completedCount: number;
    incompleteCount: number;
    holdBlockedCount: number;
    criticalCount: number;
    warningCount: number;
    infoCount: number;
    completionRatePct: number;
    byDiscipline: Array<{
      discipline: ReviewDisciplineStage;
      labelKo: string;
      incompleteCount: number;
      holdBlockedCount: number;
    }>;
  };
  rows: SapIncompleteAlvRow[];
}

function escapeHtml(raw: string | number | undefined | null): string {
  if (raw === undefined || raw === null) return '';
  return String(raw)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function toSapAlvRow(item: ProcessChecklistItem, index: number): SapIncompleteAlvRow {
  const isHold = item.autoStatus === 'HOLD_BLOCKED';
  return {
    lineNo: String((index + 1) * 10).padStart(4, '0'),
    mandt: '800',
    pspid: 'H042-FGSS',
    itemId: item.code,
    stageOrder: `0${item.stageOrder}-${item.discipline}`,
    discipline: item.discipline,
    disciplineKo: item.disciplineLabelKo,
    sapTCode: item.sapTCode,
    alvStatusIcon: isHold || item.severity === 'CRITICAL' ? '@0A@' : '@09@',
    sapStatusCode: isHold ? 'E0001_HOLD' : 'E0002_OPEN',
    sapStatusLabelKo: isHold ? 'HOLD 차단' : '조치 미완료',
    severity: item.severity,
    affectedCount: item.affectedCount,
    targetTags: item.affectedTags.length > 0 ? item.affectedTags.join(', ') : '-',
    drawingRefs: item.evidenceDrawings.length > 0 ? item.evidenceDrawings.join(' | ') : '-',
    checkTitle: item.titleKo,
    incompleteReason: item.findingSummaryKo,
    requiredAction: item.actionRequiredKo,
    responsibleGroup: item.responsibleGroup,
  };
}

export function buildSapIncompleteReportPayload(
  evaluation: ProcessChecklistEvaluation,
  opts?: { projectDef?: string; plantCode?: string; generatedAt?: string; generatedIso?: string }
): SapIncompleteReportPayload {
  const generatedIso = opts?.generatedIso || new Date().toISOString();
  const generatedAt = opts?.generatedAt || new Date(generatedIso).toLocaleString('ko-KR');
  const projectDef = opts?.projectDef || 'H042-FGSS';
  const plantCode = opts?.plantCode || 'H042';

  const rows = evaluation.incompleteItems.map((item, idx) => toSapAlvRow(item, idx));
  const releaseGateStatus =
    evaluation.summary.incompleteCount === 0
      ? 'RELEASE_READY'
      : evaluation.summary.holdBlockedCount > 0
        ? 'HOLD_BLOCKED'
        : 'OPEN_ITEMS_PENDING';

  return {
    header: {
      reportId: 'ZREVIEW_OPEN_ITEMS',
      programName: 'ZR_H042_DWG_CHK_01',
      plantCode,
      projectDef,
      client: '800',
      generatedAt,
      generatedIso,
      releaseGateStatus,
    },
    summary: {
      totalChecklistItems: evaluation.summary.total,
      completedCount: evaluation.summary.completedCount,
      incompleteCount: evaluation.summary.incompleteCount,
      holdBlockedCount: evaluation.summary.holdBlockedCount,
      criticalCount: evaluation.summary.criticalIncompleteCount,
      warningCount: evaluation.summary.warningIncompleteCount,
      infoCount: evaluation.summary.infoIncompleteCount,
      completionRatePct: evaluation.summary.completionRatePct,
      byDiscipline: evaluation.summary.byStage.map((st) => ({
        discipline: st.discipline,
        labelKo: st.shortLabelKo,
        incompleteCount: st.incomplete,
        holdBlockedCount: st.holdBlocked,
      })),
    },
    rows,
  };
}

export function exportSapIncompleteCsv(payload: SapIncompleteReportPayload): string {
  const columns = [
    'MANDT',
    'PSPID',
    'RPT_ID',
    'POSNR',
    'CHK_CODE',
    'STAGE',
    'DISCIPLINE',
    'TCODE',
    'ALV_ICON',
    'SAP_STAT',
    'SEVERITY',
    'AFFECTED_CNT',
    'TARGET_TAGS',
    'DRAWING_REF',
    'CHECK_TITLE',
    'INCOMPLETE_REASON',
    'ACTION_REQUIRED',
    'RESP_GROUP',
  ];

  const dataRows = payload.rows.map((r) => [
    r.mandt,
    r.pspid,
    payload.header.reportId,
    r.lineNo,
    r.itemId,
    r.stageOrder,
    r.disciplineKo,
    r.sapTCode,
    r.alvStatusIcon,
    r.sapStatusCode,
    r.severity,
    String(r.affectedCount),
    r.targetTags,
    r.drawingRefs,
    r.checkTitle,
    r.incompleteReason,
    r.requiredAction,
    r.responsibleGroup,
  ]);

  return [columns, ...dataRows]
    .map((cols) => cols.map((c) => `"${String(c).replaceAll('"', '""')}"`).join(','))
    .join('\n');
}

export function exportSapIncompleteJson(payload: SapIncompleteReportPayload): string {
  return JSON.stringify(
    {
      SAP_REPORT_HEADER: payload.header,
      SUMMARY_KPIS: payload.summary,
      ET_OPEN_ITEMS: payload.rows,
    },
    null,
    2
  );
}

export function buildSapIncompleteHtmlReport(payload: SapIncompleteReportPayload): string {
  const { header, summary, rows } = payload;

  const badgeHtml = (r: SapIncompleteAlvRow) => {
    if (r.sapStatusCode === 'E0001_HOLD') {
      return `<span class="alv-pill hold">● HOLD 차단 (${escapeHtml(r.severity)})</span>`;
    }
    if (r.severity === 'CRITICAL') {
      return `<span class="alv-pill hold">● CRITICAL 미완료</span>`;
    }
    return `<span class="alv-pill open">▲ 조치 미완료 (${escapeHtml(r.severity)})</span>`;
  };

  const rowsHtml =
    rows.length === 0
      ? `<tr><td colspan="9" style="text-align:center;padding:24px;color:#166534;font-weight:700;">모든 도면 실무 검토 체크리스트 항목이 완료되었습니다 (미완료 0건 · SAP FOR WORKING 출도 가능).</td></tr>`
      : rows
          .map(
            (r) => `
          <tr>
            <td class="mono center">${escapeHtml(r.lineNo)}</td>
            <td class="mono bold">${escapeHtml(r.itemId)}</td>
            <td><span class="stage-tag">${escapeHtml(r.stageOrder)}</span><div class="sub">${escapeHtml(r.disciplineKo)}</div></td>
            <td class="center">${badgeHtml(r)}</td>
            <td class="bold">${escapeHtml(r.checkTitle)}<div class="sub">${escapeHtml(r.incompleteReason)}</div></td>
            <td class="mono">${escapeHtml(r.targetTags)}</td>
            <td class="mono">${escapeHtml(r.drawingRefs)}</td>
            <td>${escapeHtml(r.requiredAction)}</td>
            <td class="mono center"><div>${escapeHtml(r.sapTCode)}</div><div class="sub">${escapeHtml(r.responsibleGroup)}</div></td>
          </tr>`
          )
          .join('');

  const subtotalCards = summary.byDiscipline
    .map(
      (d) => `
      <div class="kpi">
        <div class="lbl">${escapeHtml(d.labelKo)} 미완료</div>
        <div class="val">${d.incompleteCount}건</div>
        <div class="sub">HOLD ${d.holdBlockedCount}건</div>
      </div>`
    )
    .join('');

  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<title>SAP ALV Report · ${escapeHtml(header.reportId)} (${escapeHtml(header.projectDef)})</title>
<style>
  @page { size: A4 landscape; margin: 10mm; }
  body { font-family: "IBM Plex Sans KR", "Noto Sans KR", -apple-system, sans-serif; color:#0f172a; margin:20px; background:#f8fafc; line-height:1.4; }
  .spool { background:#fff; border:1px solid #cbd5e1; border-radius:4px; overflow:hidden; }
  .sap-bar { background:#1B2A3A; color:#fff; padding:12px 18px; display:flex; justify-content:space-between; align-items:center; }
  .sap-bar h1 { margin:0; font-size:16px; font-weight:700; }
  .sap-meta { font-family:ui-monospace, monospace; font-size:11px; color:#bae6fd; }
  .sys-strip { background:#eef4fb; border-bottom:1px solid #cbd5e1; padding:8px 18px; font-family:ui-monospace, monospace; font-size:11px; display:flex; flex-wrap:wrap; gap:18px; color:#1e3a5f; }
  .kpis { display:grid; grid-template-columns:repeat(6, minmax(0, 1fr)); gap:8px; padding:14px 18px; background:#fff; border-bottom:1px solid #e2e8f0; }
  .kpi { border:1px solid #cbd5e1; border-radius:4px; padding:8px 10px; background:#f8fafc; }
  .kpi .lbl { font-size:11px; color:#475569; font-weight:600; }
  .kpi .val { font-family:ui-monospace, monospace; font-size:17px; font-weight:700; color:#0f172a; margin-top:2px; }
  .sub { font-size:10.5px; color:#64748b; margin-top:2px; }
  table { width:100%; border-collapse:collapse; font-size:11.5px; }
  th, td { border:1px solid #cbd5e1; padding:6px 8px; text-align:left; vertical-align:top; }
  th { background:#f1f5f9; font-weight:700; color:#334155; font-size:11px; }
  .mono { font-family:ui-monospace, monospace; }
  .bold { font-weight:700; }
  .center { text-align:center; }
  .stage-tag { font-family:ui-monospace, monospace; font-size:10.5px; font-weight:700; color:#005CC8; }
  .alv-pill { display:inline-block; padding:2px 6px; border-radius:3px; font-family:ui-monospace, monospace; font-size:10.5px; font-weight:700; white-space:nowrap; }
  .alv-pill.hold { background:#fee2e2; color:#991b1b; border:1px solid #fca5a5; }
  .alv-pill.open { background:#fef3c7; color:#92400e; border:1px solid #fcd34d; }
  @media print { body { margin:0; background:#fff; } .spool { border:none; } }
</style>
</head>
<body>
  <div class="spool">
    <div class="sap-bar">
      <div>
        <div class="sap-meta">SAP ALV LIST VIEWER · REPORT ${escapeHtml(header.reportId)} · PROGRAM ${escapeHtml(header.programName)}</div>
        <h1>도면 실무 검토 미완료 항목 SAP 보고서 (P&amp;ID · GAR · Electrical)</h1>
      </div>
      <div class="sap-meta" style="text-align:right;">
        <div>PROJECT: ${escapeHtml(header.projectDef)} · PLANT: ${escapeHtml(header.plantCode)}</div>
        <div>GENERATED: ${escapeHtml(header.generatedAt)}</div>
      </div>
    </div>
    <div class="sys-strip">
      <span>CLIENT: ${escapeHtml(header.client)}</span>
      <span>GATE STATUS: ${escapeHtml(header.releaseGateStatus)}</span>
      <span>COMPLETION: ${summary.completionRatePct}% (${summary.completedCount}/${summary.totalChecklistItems})</span>
      <span>OPEN ITEMS: ${summary.incompleteCount}건 (HOLD ${summary.holdBlockedCount} · CRITICAL ${summary.criticalCount} · WARNING ${summary.warningCount})</span>
    </div>
    <div class="kpis">
      <div class="kpi">
        <div class="lbl">전체 미완료 항목</div>
        <div class="val" style="color:#b91c1c;">${summary.incompleteCount}건</div>
        <div class="sub">진행률 ${summary.completionRatePct}%</div>
      </div>
      <div class="kpi">
        <div class="lbl">HOLD 차단 (Critical)</div>
        <div class="val" style="color:#991b1b;">${summary.holdBlockedCount}건</div>
        <div class="sub">출도 전 필수 해소</div>
      </div>
      ${subtotalCards}
    </div>
    <table>
      <thead>
        <tr>
          <th style="width:52px;">항목</th>
          <th style="width:94px;">체크코드</th>
          <th style="width:110px;">프로세스 단계</th>
          <th style="width:128px;">SAP 상태</th>
          <th>검토 항목 및 미완료 사유</th>
          <th style="width:150px;">대상 태그</th>
          <th style="width:180px;">근거 도면</th>
          <th style="width:220px;">실무 조치 지시사항</th>
          <th style="width:92px;">T-Code / 팀</th>
        </tr>
      </thead>
      <tbody>${rowsHtml}</tbody>
    </table>
  </div>
</body>
</html>`;
}
