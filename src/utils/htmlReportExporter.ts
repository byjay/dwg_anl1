import {
  CrossLayerDiffItem,
  DrawingContentAnalysisReport,
  DrawingPinNote,
  EvaluatedLoopMatch,
  ParallelBatchSummary,
  RuleViolationHit,
} from '../types/diagram';
import { DiscrepancySeveritySummary } from './severitySummary';

export type HtmlReportSectionId =
  | 'SUMMARY_KPI'
  | 'DISCREPANCY_SEVERITY'
  | 'LOOP_MATRIX'
  | 'CROSS_LAYER_DIFF'
  | 'RULE_VIOLATIONS'
  | 'PIN_NOTES'
  | 'DEEP_ANALYSIS';

export interface HtmlReportSectionDescriptor {
  id: HtmlReportSectionId;
  titleKo: string;
  descriptionKo: string;
  fileSlug: string;
}

export const HTML_REPORT_SECTIONS: HtmlReportSectionDescriptor[] = [
  {
    id: 'SUMMARY_KPI',
    titleKo: '1. 전체 매칭률 및 모듈별 KPI 요약',
    descriptionKo: '전체 시그널 루프 정합률, 불일치 유형별 집계 및 모듈(100/200/400)별 병렬 매칭 지표',
    fileSlug: '01_summary_kpi',
  },
  {
    id: 'DISCREPANCY_SEVERITY',
    titleKo: '2. 심각도별 설계 불일치 검증 현황 (Critical / Warning / Info)',
    descriptionKo: 'Critical·Warning·Info 심각도 분포 및 개별 루프별 불일치 상세·권고 조치',
    fileSlug: '02_severity_discrepancies',
  },
  {
    id: 'LOOP_MATRIX',
    titleKo: '3. 전 루프 교차 매칭 매트릭스',
    descriptionKo: 'P&ID 태그, 배관 라인, GAR 마크업, 전장 케이블, JB, 완전도 전체 목록',
    fileSlug: '03_loop_cross_match',
  },
  {
    id: 'CROSS_LAYER_DIFF',
    titleKo: '4. 도면 계층 디프체크 (P&ID ↔ GAR ↔ DIA)',
    descriptionKo: '블록도↔결선표, P&ID↔GAR, 리비전 이력 간 필드 단위 값 차이 내역',
    fileSlug: '04_cross_layer_diff',
  },
  {
    id: 'RULE_VIOLATIONS',
    titleKo: '5. 엔지니어링 검증 룰 위반 내역',
    descriptionKo: 'RULE-01~09 및 사용자 정의 룰 기반 도면·루프 위반 검출 결과',
    fileSlug: '05_rule_violations',
  },
  {
    id: 'PIN_NOTES',
    titleKo: '6. 도면 핀 노트 및 검토 상태 이력',
    descriptionKo: 'PDF 도면 좌표 기반 핀 노트, 심각도 및 진행 상태(OPEN/IN_REVIEW/RESOLVED)',
    fileSlug: '06_drawing_pin_notes',
  },
  {
    id: 'DEEP_ANALYSIS',
    titleKo: '7. 도면 실물·메이커·케이블 심층 분석 요약',
    descriptionKo: '추출된 장비/케이블/메이커 도면 프로파일 및 범용 교차 매칭 결과',
    fileSlug: '07_deep_drawing_analysis',
  },
];

export interface HtmlReportInput {
  projectCode?: string;
  generatedAt?: string;
  selectedSections: HtmlReportSectionId[];
  summary: ParallelBatchSummary;
  loops: EvaluatedLoopMatch[];
  severitySummary: DiscrepancySeveritySummary;
  diffs: CrossLayerDiffItem[];
  ruleViolations: RuleViolationHit[];
  pinNotes: DrawingPinNote[];
  analysisReport?: DrawingContentAnalysisReport | null;
}

export interface PerSectionHtmlExport {
  sectionId: HtmlReportSectionId;
  titleKo: string;
  filename: string;
  html: string;
  itemCount: number;
}

export function escapeHtml(raw: string | number | undefined | null): string {
  if (raw === undefined || raw === null) return '';
  return String(raw)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getSeverityBadgeHtml(severity: string): string {
  if (severity === 'CRITICAL') {
    return '<span class="badge badge-critical">CRITICAL</span>';
  }
  if (severity === 'WARNING') {
    return '<span class="badge badge-warning">WARNING</span>';
  }
  return '<span class="badge badge-info">INFO</span>';
}

function renderSummaryKpiSection(summary: ParallelBatchSummary): string {
  const issueTotal =
    summary.cableMissingCount +
    summary.unassignedCircuitCount +
    summary.pidOnlyCount +
    summary.conflictCount +
    summary.revisionDriftCount;

  const moduleRows = summary.moduleBreakdown
    .map((mod) => {
      const rate = mod.total > 0 ? Math.round((mod.matched / mod.total) * 100) : 0;
      return `<tr>
        <td class="mono">${escapeHtml(mod.unitCode)}</td>
        <td>${escapeHtml(mod.moduleName)}</td>
        <td class="num">${mod.total}</td>
        <td class="num text-ok">${mod.matched}</td>
        <td class="num text-err">${mod.issues}</td>
        <td class="num">${rate}%</td>
      </tr>`;
    })
    .join('');

  return `<section class="report-section" data-section="SUMMARY_KPI">
    <h2>1. 전체 매칭률 및 모듈별 KPI 요약</h2>
    <div class="kpi-grid">
      <div class="kpi-card">
        <div class="kpi-label">전체 시그널 루프</div>
        <div class="kpi-value">${summary.totalLoops}</div>
        <div class="kpi-sub">병렬 파티션 ${summary.workerPartitionCount}개</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">3-Way 정상 매칭</div>
        <div class="kpi-value text-ok">${summary.matchedCount} (${summary.matchRatePercent}%)</div>
        <div class="kpi-sub">전체 정합률 기준</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">불일치 / 누락 루프</div>
        <div class="kpi-value text-err">${issueTotal}</div>
        <div class="kpi-sub">Mark B:${summary.cableMissingCount} · C:${summary.unassignedCircuitCount} · D:${summary.pidOnlyCount} · 오기:${summary.conflictCount} · 리비전:${summary.revisionDriftCount}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">심각도별 불일치 건수</div>
        <div class="kpi-value">심각 ${summary.criticalIssuesCount} · 주의 ${summary.warningIssuesCount}</div>
        <div class="kpi-sub">루프당 다중 결함 포함</div>
      </div>
    </div>
    <table>
      <thead>
        <tr>
          <th>유닛</th>
          <th>모듈명</th>
          <th class="num">전체 루프</th>
          <th class="num">정상 매칭</th>
          <th class="num">불일치/누락</th>
          <th class="num">정합률</th>
        </tr>
      </thead>
      <tbody>${moduleRows || '<tr><td colspan="6" class="empty">모듈 데이터가 없습니다.</td></tr>'}</tbody>
    </table>
  </section>`;
}

function renderSeverityDiscrepancySection(severitySummary: DiscrepancySeveritySummary): string {
  const { CRITICAL: crit, WARNING: warn, INFO: info } = severitySummary.bySeverity;
  const total = Math.max(1, severitySummary.totalDiscrepancies);
  const critPct = Math.round((crit.count / total) * 100);
  const warnPct = Math.round((warn.count / total) * 100);
  const infoPct = Math.max(0, 100 - critPct - warnPct);

  const allItems = [...crit.items, ...warn.items, ...info.items];
  const rows = allItems
    .map(
      (item) => `<tr>
      <td>${getSeverityBadgeHtml(item.severity)}</td>
      <td class="mono">${escapeHtml(item.canonicalTag)}</td>
      <td class="mono">${escapeHtml(item.unitCode)}</td>
      <td>${escapeHtml(item.title)}</td>
      <td>${escapeHtml(item.affectedDrawings.join(', '))}</td>
      <td>${escapeHtml(item.recommendedAction)}</td>
    </tr>`
    )
    .join('');

  return `<section class="report-section" data-section="DISCREPANCY_SEVERITY">
    <h2>2. 심각도별 설계 불일치 검증 현황 (Critical / Warning / Info)</h2>
    <div class="sev-summary-row">
      <div class="sev-box sev-critical"><span>Critical (심각)</span><strong>${crit.count}건 (${crit.sharePercent}%)</strong></div>
      <div class="sev-box sev-warning"><span>Warning (주의)</span><strong>${warn.count}건 (${warn.sharePercent}%)</strong></div>
      <div class="sev-box sev-info"><span>Info (참고)</span><strong>${info.count}건 (${info.sharePercent}%)</strong></div>
    </div>
    <div class="sev-bar" aria-label="심각도 비율 막대">
      <div style="width:${critPct}%;background:#dc2626"></div>
      <div style="width:${warnPct}%;background:#d97706"></div>
      <div style="width:${infoPct}%;background:#0284c7"></div>
    </div>
    <table>
      <thead>
        <tr>
          <th>심각도</th>
          <th>태그</th>
          <th>유닛</th>
          <th>불일치 제목</th>
          <th>영향 도면</th>
          <th>권고 조치</th>
        </tr>
      </thead>
      <tbody>${rows || '<tr><td colspan="6" class="empty">검출된 불일치 항목이 없습니다.</td></tr>'}</tbody>
    </table>
  </section>`;
}

function renderLoopMatrixSection(loops: EvaluatedLoopMatch[]): string {
  const rows = loops
    .map(
      (l) => `<tr>
      <td class="mono">${escapeHtml(l.unitCode)}</td>
      <td class="mono"><strong>${escapeHtml(l.canonicalTag)}</strong><br><span class="muted">${escapeHtml(l.serviceName)}</span></td>
      <td class="mono">${escapeHtml(l.pid.lineNo || l.equipmentTag)}<br><span class="muted">P&ID ${escapeHtml(l.pid.sheet)}</span></td>
      <td>${l.gar ? `Mark ${escapeHtml(l.gar.markupCode)} (${escapeHtml(l.gar.sheet)})` : '<span class="muted">미표기</span>'}</td>
      <td class="mono">${escapeHtml(l.primarySystem)} · ${escapeHtml(l.primaryCableNo)}</td>
      <td class="mono">${escapeHtml(l.primaryJunctionBox)}</td>
      <td>${escapeHtml(l.statusLabelKo)}</td>
      <td class="num">${l.completenessScore}%</td>
    </tr>`
    )
    .join('');

  return `<section class="report-section" data-section="LOOP_MATRIX">
    <h2>3. 전 루프 교차 매칭 매트릭스 (${loops.length}건)</h2>
    <table>
      <thead>
        <tr>
          <th>유닛</th>
          <th>기준 태그 / 서비스</th>
          <th>배관 라인 / P&ID</th>
          <th>GAR 마크업</th>
          <th>전장 계통 · 케이블</th>
          <th>Junction Box</th>
          <th>검증 상태</th>
          <th class="num">완전도</th>
        </tr>
      </thead>
      <tbody>${rows || '<tr><td colspan="8" class="empty">루프 데이터가 없습니다.</td></tr>'}</tbody>
    </table>
  </section>`;
}

function renderCrossLayerDiffSection(diffs: CrossLayerDiffItem[]): string {
  const rows = diffs
    .map((d) => {
      const deltaSummary = d.deltas
        .map((dl) => `${dl.fieldLabel}: [${dl.leftValue}] → [${dl.rightValue}]`)
        .join(' / ');
      return `<tr>
        <td>${getSeverityBadgeHtml(d.severity)}</td>
        <td class="mono">${escapeHtml(d.canonicalTag)}</td>
        <td>${escapeHtml(d.scopeLabelKo)}</td>
        <td><strong>${escapeHtml(d.title)}</strong><br><span class="muted">${escapeHtml(deltaSummary)}</span></td>
        <td>${escapeHtml(d.recommendedFix)}</td>
      </tr>`;
    })
    .join('');

  return `<section class="report-section" data-section="CROSS_LAYER_DIFF">
    <h2>4. 도면 계층 디프체크 (${diffs.length}건)</h2>
    <table>
      <thead>
        <tr>
          <th>심각도</th>
          <th>태그</th>
          <th>비교 계층</th>
          <th>차이 상세 (기준 vs 대상)</th>
          <th>권고 수정 조치</th>
        </tr>
      </thead>
      <tbody>${rows || '<tr><td colspan="5" class="empty">계층 디프 항목이 없습니다.</td></tr>'}</tbody>
    </table>
  </section>`;
}

function renderRuleViolationsSection(violations: RuleViolationHit[]): string {
  const rows = violations
    .map(
      (v) => `<tr>
      <td>${getSeverityBadgeHtml(v.severity)}</td>
      <td class="mono">${escapeHtml(v.ruleCode)}</td>
      <td>${escapeHtml(v.ruleNameKo)}</td>
      <td class="mono">${escapeHtml(v.tagOrTarget)}</td>
      <td>${escapeHtml(v.evidence)}</td>
      <td>${escapeHtml(v.recommendation)}</td>
    </tr>`
    )
    .join('');

  return `<section class="report-section" data-section="RULE_VIOLATIONS">
    <h2>5. 엔지니어링 검증 룰 위반 내역 (${violations.length}건)</h2>
    <table>
      <thead>
        <tr>
          <th>심각도</th>
          <th>룰 코드</th>
          <th>검증 룰</th>
          <th>대상 태그</th>
          <th>검출 근거</th>
          <th>권고 조치</th>
        </tr>
      </thead>
      <tbody>${rows || '<tr><td colspan="6" class="empty">검출된 룰 위반 사항이 없습니다.</td></tr>'}</tbody>
    </table>
  </section>`;
}

function renderPinNotesSection(notes: DrawingPinNote[]): string {
  const rows = notes
    .map(
      (n) => `<tr>
      <td>${getSeverityBadgeHtml(n.severity)}</td>
      <td class="mono">${escapeHtml(n.drawingId)} p.${n.pageNum}</td>
      <td class="mono">${escapeHtml(n.tagRef)}</td>
      <td>${escapeHtml(n.status)}</td>
      <td>${escapeHtml(n.content)}</td>
      <td>${escapeHtml(n.author)}</td>
    </tr>`
    )
    .join('');

  return `<section class="report-section" data-section="PIN_NOTES">
    <h2>6. 도면 핀 노트 및 검토 상태 이력 (${notes.length}건)</h2>
    <table>
      <thead>
        <tr>
          <th>심각도</th>
          <th>도면 / 페이지</th>
          <th>참조 태그</th>
          <th>상태</th>
          <th>노트 내용</th>
          <th>작성자</th>
        </tr>
      </thead>
      <tbody>${rows || '<tr><td colspan="6" class="empty">등록된 도면 핀 노트가 없습니다.</td></tr>'}</tbody>
    </table>
  </section>`;
}

function renderDeepAnalysisSection(
  analysisReport?: DrawingContentAnalysisReport | null
): string {
  if (!analysisReport) {
    return `<section class="report-section" data-section="DEEP_ANALYSIS">
      <h2>7. 도면 실물·메이커·케이블 심층 분석 요약</h2>
      <p class="empty">도면·OCR 심층 분석이 아직 실행되지 않았습니다. 도면·OCR 분석 탭에서 스캔 실행 후 전체 상세가 포함됩니다.</p>
    </section>`;
  }

  const profileRows = (analysisReport.documentProfiles || [])
    .map(
      (p) => `<tr>
      <td>${escapeHtml(p.displayName)}</td>
      <td>${escapeHtml(p.docClassLabelKo)}</td>
      <td class="num">${p.pageCount}</td>
      <td class="num">${p.equipmentCount}</td>
      <td class="num">${p.cableCount}</td>
      <td class="num">${p.tagCount}</td>
    </tr>`
    )
    .join('');

  const matchRows = (analysisReport.universalMatches || [])
    .slice(0, 80)
    .map(
      (m) => `<tr>
      <td>${getSeverityBadgeHtml(m.severity)}</td>
      <td class="mono">${escapeHtml(m.displayTag)}</td>
      <td>${escapeHtml(m.entityCategory)}</td>
      <td>${escapeHtml(m.matchStatus)}</td>
      <td>${escapeHtml(m.summaryKo)}</td>
    </tr>`
    )
    .join('');

  return `<section class="report-section" data-section="DEEP_ANALYSIS">
    <h2>7. 도면 실물·메이커·케이블 심층 분석 요약 (${analysisReport.drawingsAnalyzed}개 도면 · ${analysisReport.pagesScanned}페이지)</h2>
    <table>
      <thead>
        <tr>
          <th>도면명</th>
          <th>분류</th>
          <th class="num">페이지</th>
          <th class="num">장비</th>
          <th class="num">케이블</th>
          <th class="num">태그</th>
        </tr>
      </thead>
      <tbody>${profileRows || '<tr><td colspan="6" class="empty">도면 프로파일이 없습니다.</td></tr>'}</tbody>
    </table>
    ${
      matchRows
        ? `<h3 style="margin-top:16px;font-size:13px;">범용 도면·메이커 교차 매칭 결과</h3>
           <table>
             <thead>
               <tr>
                 <th>심각도</th>
                 <th>식별 태그</th>
                 <th>유형</th>
                 <th>상태</th>
                 <th>요약</th>
               </tr>
             </thead>
             <tbody>${matchRows}</tbody>
           </table>`
        : ''
    }
  </section>`;
}

const REPORT_CSS = `
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans KR", sans-serif; color: #0f172a; background: #f8fafc; margin: 0; padding: 24px; line-height: 1.5; }
  .report-shell { max-width: 1180px; margin: 0 auto; background: #ffffff; border: 1px solid #cbd5e1; border-radius: 6px; padding: 28px; }
  .report-header { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: flex-end; gap: 12px; border-bottom: 2px solid #0f172a; padding-bottom: 14px; margin-bottom: 20px; }
  .report-header h1 { margin: 0; font-size: 20px; font-weight: 700; color: #0f172a; }
  .report-meta { font-size: 12px; color: #475569; font-variant-numeric: tabular-nums; }
  .toc { background: #f1f5f9; border: 1px solid #e2e8f0; border-radius: 4px; padding: 12px 16px; margin-bottom: 22px; font-size: 12px; }
  .toc strong { display: block; margin-bottom: 6px; color: #1e293b; }
  .toc ul { margin: 0; padding-left: 18px; display: flex; flex-wrap: wrap; gap: 6px 24px; }
  .report-section { margin-bottom: 28px; page-break-inside: avoid; }
  .report-section h2 { font-size: 15px; font-weight: 700; color: #0f172a; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px; margin: 0 0 12px 0; }
  .kpi-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin-bottom: 14px; }
  .kpi-card { border: 1px solid #e2e8f0; border-radius: 4px; padding: 10px 12px; background: #ffffff; }
  .kpi-label { font-size: 11px; color: #64748b; }
  .kpi-value { font-size: 18px; font-weight: 700; margin-top: 2px; font-variant-numeric: tabular-nums; }
  .kpi-sub { font-size: 11px; color: #64748b; margin-top: 2px; }
  .sev-summary-row { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; margin-bottom: 8px; }
  .sev-box { display: flex; justify-content: space-between; align-items: center; border: 1px solid #e2e8f0; border-radius: 4px; padding: 8px 12px; font-size: 12px; font-variant-numeric: tabular-nums; }
  .sev-critical { background: #fef2f2; border-color: #fecaca; color: #991b1b; }
  .sev-warning { background: #fffbeb; border-color: #fde68a; color: #92400e; }
  .sev-info { background: #f0f9ff; border-color: #bae6fd; color: #075985; }
  .sev-bar { display: flex; height: 8px; border-radius: 3px; overflow: hidden; margin-bottom: 12px; background: #e2e8f0; }
  table { width: 100%; border-collapse: collapse; font-size: 11.5px; }
  th, td { border: 1px solid #e2e8f0; padding: 7px 9px; text-align: left; vertical-align: top; }
  th { background: #f8fafc; font-weight: 600; color: #334155; }
  .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .muted { color: #64748b; font-size: 10.5px; }
  .text-ok { color: #15803d; }
  .text-err { color: #b91c1c; }
  .empty { text-align: center; color: #64748b; padding: 14px; }
  .badge { display: inline-block; padding: 1px 6px; border-radius: 3px; font-size: 10px; font-weight: 700; font-family: ui-monospace, monospace; }
  .badge-critical { background: #fee2e2; color: #991b1b; border: 1px solid #fca5a5; }
  .badge-warning { background: #fef3c7; color: #92400e; border: 1px solid #fcd34d; }
  .badge-info { background: #e0f2fe; color: #075985; border: 1px solid #7dd3fc; }
  @media print { body { background: #fff; padding: 0; } .report-shell { border: none; padding: 0; } }
`;

export function getSectionItemCount(
  sectionId: HtmlReportSectionId,
  input: Omit<HtmlReportInput, 'selectedSections'>
): number {
  switch (sectionId) {
    case 'SUMMARY_KPI':
      return input.summary.moduleBreakdown.length;
    case 'DISCREPANCY_SEVERITY':
      return input.severitySummary.totalDiscrepancies;
    case 'LOOP_MATRIX':
      return input.loops.length;
    case 'CROSS_LAYER_DIFF':
      return input.diffs.length;
    case 'RULE_VIOLATIONS':
      return input.ruleViolations.length;
    case 'PIN_NOTES':
      return input.pinNotes.length;
    case 'DEEP_ANALYSIS':
      return input.analysisReport?.drawingsAnalyzed ?? 0;
  }
}

/**
 * Generates a self-contained HTML5 report document containing only the requested sections.
 */
export function buildHtmlReportDocument(
  input: HtmlReportInput,
  reportTitle = 'H042 배관·전장 도면 교차 검증 HTML 보고서'
): string {
  const projectCode = input.projectCode || 'H042';
  const generatedAt = input.generatedAt || new Date().toISOString().slice(0, 19).replace('T', ' ');
  const activeSet = new Set(input.selectedSections);

  const renderedSections: string[] = [];
  const tocItems: string[] = [];

  for (const desc of HTML_REPORT_SECTIONS) {
    if (!activeSet.has(desc.id)) continue;
    tocItems.push(`<li>${escapeHtml(desc.titleKo)}</li>`);

    switch (desc.id) {
      case 'SUMMARY_KPI':
        renderedSections.push(renderSummaryKpiSection(input.summary));
        break;
      case 'DISCREPANCY_SEVERITY':
        renderedSections.push(renderSeverityDiscrepancySection(input.severitySummary));
        break;
      case 'LOOP_MATRIX':
        renderedSections.push(renderLoopMatrixSection(input.loops));
        break;
      case 'CROSS_LAYER_DIFF':
        renderedSections.push(renderCrossLayerDiffSection(input.diffs));
        break;
      case 'RULE_VIOLATIONS':
        renderedSections.push(renderRuleViolationsSection(input.ruleViolations));
        break;
      case 'PIN_NOTES':
        renderedSections.push(renderPinNotesSection(input.pinNotes));
        break;
      case 'DEEP_ANALYSIS':
        renderedSections.push(renderDeepAnalysisSection(input.analysisReport));
        break;
    }
  }

  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(reportTitle)}</title>
  <style>${REPORT_CSS}</style>
</head>
<body>
  <main class="report-shell">
    <header class="report-header">
      <div>
        <h1>${escapeHtml(reportTitle)}</h1>
        <div class="report-meta">프로젝트 ${escapeHtml(projectCode)} · 정합률 ${input.summary.matchRatePercent}% (${input.summary.matchedCount}/${input.summary.totalLoops}루프)</div>
      </div>
      <div class="report-meta">생성 일시: ${escapeHtml(generatedAt)}</div>
    </header>
    <nav class="toc" aria-label="포함된 보고서 항목">
      <strong>포함 항목 (${renderedSections.length}개)</strong>
      <ul>${tocItems.join('')}</ul>
    </nav>
    ${renderedSections.join('\n') || '<p class="empty">선택된 보고서 항목이 없습니다.</p>'}
  </main>
</body>
</html>`;
}

/**
 * Generates individual standalone HTML report files for each selected section.
 */
export function buildPerSectionHtmlReports(
  input: HtmlReportInput
): PerSectionHtmlExport[] {
  const dateStamp = (input.generatedAt || new Date().toISOString()).slice(0, 10);
  const projectCode = input.projectCode || 'H042';
  const activeSet = new Set(input.selectedSections);

  return HTML_REPORT_SECTIONS.filter((sec) => activeSet.has(sec.id)).map((sec) => ({
    sectionId: sec.id,
    titleKo: sec.titleKo,
    filename: `${projectCode}_${sec.fileSlug}_${dateStamp}.html`,
    itemCount: getSectionItemCount(sec.id, input),
    html: buildHtmlReportDocument(
      {
        ...input,
        selectedSections: [sec.id],
      },
      `${projectCode} · ${sec.titleKo}`
    ),
  }));
}
