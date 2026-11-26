import {
  ElectricalCommentReportPackage,
  EvidencePanelSpec,
} from './electricalCommentEngine.ts';
import { escapeHtml } from './htmlReportExporter.ts';

function renderEvidenceVisualHtml(
  panel: EvidencePanelSpec,
  snapshotsByPanelId: Record<string, string>
): string {
  const imgSrc = snapshotsByPanelId[panel.id];
  const visualContent = imgSrc
    ? `<img src="${imgSrc}" alt="${escapeHtml(panel.caption)}" class="ev-img" />`
    : `<div class="ev-fallback">
        <div class="ev-fallback-tag">${escapeHtml(panel.drawingNo)} · ${escapeHtml(panel.sheetLabel)} (PDF p.${panel.pageNum})</div>
        <div class="ev-fallback-desc">${escapeHtml(panel.caption)}</div>
      </div>`;

  return `<figure class="ev-card">
    <div class="ev-card-head">
      <span class="ev-dwg">${escapeHtml(panel.drawingNo)}</span>
      <span class="ev-page">PDF p.${panel.pageNum} · ${escapeHtml(panel.sheetLabel)}</span>
    </div>
    <div class="ev-media">${visualContent}</div>
    <figcaption class="ev-caption">${escapeHtml(panel.caption)}</figcaption>
  </figure>`;
}

const TEMPLATE_REPORT_CSS = `
  * { box-sizing: border-box; }
  @page {
    size: A4 landscape;
    margin: 8mm;
  }
  body {
    font-family: "Malgun Gothic", "Noto Sans KR", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    background: #e2e8f0;
    color: #0f172a;
    margin: 0;
    padding: 24px 16px;
    line-height: 1.45;
  }
  .deck {
    max-width: 1220px;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: 24px;
  }
  .slide {
    background: #ffffff;
    border: 1px solid #cbd5e1;
    box-shadow: 0 4px 16px rgba(15, 23, 42, 0.08);
    position: relative;
    overflow: hidden;
    page-break-after: always;
    break-after: page;
  }
  .slide-top-bar {
    height: 10px;
    background: #103258;
    width: 100%;
  }
  .slide-inner {
    padding: 20px 30px 22px 30px;
  }
  .slide-header-row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 16px;
  }
  .slide-title {
    margin: 0;
    font-size: 22px;
    font-weight: 800;
    color: #103258;
    letter-spacing: -0.02em;
  }
  .slide-corner-label {
    font-size: 12.5px;
    font-weight: 700;
    color: #475569;
    white-space: nowrap;
  }
  .slide-corner-label.is-new {
    color: #1e293b;
  }
  .teal-rule {
    height: 3px;
    background: #006b8f;
    margin: 8px 0 9px 0;
  }
  .drawing-subtitle {
    font-size: 12.5px;
    font-weight: 700;
    color: #8b1e24;
    margin-bottom: 12px;
  }
  .drawing-subtitle .muted-ref {
    color: #334155;
    font-weight: 600;
  }
  .cover-kpis {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 12px;
    margin: 12px 0 16px 0;
  }
  .kpi-box {
    border: 1px solid #cbd5e1;
    border-left: 4px solid #006b8f;
    background: #f8fafc;
    padding: 9px 12px;
  }
  .kpi-box.crit { border-left-color: #b91c1c; background: #fef2f2; }
  .kpi-label { font-size: 11px; color: #475569; font-weight: 600; }
  .kpi-num { font-size: 21px; font-weight: 800; color: #0f172a; margin-top: 2px; font-variant-numeric: tabular-nums; }
  .summary-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 11px;
    margin-bottom: 12px;
  }
  .summary-table th, .summary-table td {
    border: 1px solid #cbd5e1;
    padding: 5px 8px;
    text-align: left;
    vertical-align: top;
  }
  .summary-table th {
    background: #103258;
    color: #ffffff;
    font-weight: 700;
  }
  .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
  .ev-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
    margin-bottom: 12px;
  }
  .ev-grid.single {
    grid-template-columns: 1fr;
  }
  .ev-card {
    margin: 0;
    border: 1px solid #cbd5e1;
    background: #ffffff;
  }
  .ev-card-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: #f8fafc;
    border-bottom: 1px solid #e2e8f0;
    padding: 4px 10px;
    font-size: 10.5px;
  }
  .ev-dwg { font-family: ui-monospace, monospace; font-weight: 700; color: #103258; }
  .ev-page { font-family: ui-monospace, monospace; color: #0369a1; font-weight: 600; }
  .ev-media {
    background: #ffffff;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 210px;
    max-height: 330px;
    overflow: hidden;
    padding: 4px;
  }
  .ev-img {
    max-width: 100%;
    max-height: 320px;
    object-fit: contain;
    display: block;
    background: #ffffff;
  }
  .ev-fallback {
    padding: 20px;
    text-align: center;
    color: #475569;
    font-size: 11.5px;
  }
  .ev-fallback-tag { font-weight: 700; color: #103258; margin-bottom: 4px; }
  .ev-caption {
    padding: 4px 10px;
    font-size: 10.5px;
    color: #475569;
    border-top: 1px solid #e2e8f0;
    background: #f8fafc;
  }
  .query-box {
    border-left: 4px solid #9e1b24;
    background: #fdf2f2;
    padding: 11px 16px;
    margin-bottom: 8px;
  }
  .query-box.checklist {
    border-left-color: #006b8f;
    background: #f1f5f9;
    padding: 16px 20px;
  }
  .query-box-title {
    margin: 0 0 6px 0;
    font-size: 13px;
    font-weight: 800;
    color: #9e1b24;
  }
  .query-box.checklist .query-box-title {
    color: #103258;
  }
  .query-box ul {
    margin: 0;
    padding-left: 18px;
    font-size: 12.5px;
    color: #0f172a;
  }
  .query-box li { margin-bottom: 4px; }
  .query-box li.action-arrow { color: #9e1b24; font-weight: 700; }
  .comment-strip {
    border-left: 4px solid #006b8f;
    background: #f8fafc;
    padding: 7px 14px;
    font-size: 11.5px;
    color: #0f172a;
  }
  .comment-strip-title {
    margin: 0 0 3px 0;
    font-size: 11.5px;
    font-weight: 800;
    color: #005573;
  }
  .comment-strip ul {
    margin: 0;
    padding-left: 16px;
  }
  .slide-footer {
    margin-top: 10px;
    padding-top: 6px;
    border-top: 1px solid #e2e8f0;
    display: flex;
    justify-content: space-between;
    font-size: 10px;
    color: #64748b;
  }
  @media print {
    body { background: #ffffff; padding: 0; }
    .deck { gap: 0; max-width: none; }
    .slide { border: none; box-shadow: none; margin: 0; }
  }
`;

/**
 * Builds a complete self-contained HTML report formatted strictly after the attached
 * H042 slide/query template, embedding captured PDF snapshots, evidence pages, missing cables,
 * and Electrical Diagram comments.
 */
export function buildTemplateStyleHtmlReport(
  pkg: ElectricalCommentReportPackage,
  snapshotsByPanelId: Record<string, string> = {}
): string {
  const missingCableRowsHtml = pkg.missingCableRows
    .map(
      (r) => `<tr>
        <td class="mono">${escapeHtml(r.unitCode)}</td>
        <td class="mono"><strong>${escapeHtml(r.tag)}</strong></td>
        <td>${escapeHtml(r.issueTypeLabelKo)}</td>
        <td>${escapeHtml(r.currentCableState)}</td>
        <td class="mono">${escapeHtml(r.targetDiagram)}</td>
        <td>${escapeHtml(r.evidenceRef)}</td>
        <td>${escapeHtml(r.requiredAction)}</td>
      </tr>`
    )
    .join('');

  const diagramGroupRowsHtml = pkg.diagramGroups
    .map(
      (g) => `<tr>
        <td class="mono"><strong>${escapeHtml(g.diagramNo)}</strong><br>${escapeHtml(g.diagramTitleKo)}</td>
        <td class="mono">Critical ${g.criticalCount} · Warning ${g.warningCount}</td>
        <td class="mono">${g.sheetNos.length > 0 ? g.sheetNos.map((n) => `#${n}`).join(', ') : '-'}</td>
        <td>${escapeHtml(g.keyComments.slice(0, 3).join(' / '))}</td>
      </tr>`
    )
    .join('');

  const coverSlideHtml = `<article class="slide" data-slide="cover">
    <div class="slide-top-bar"></div>
    <div class="slide-inner">
      <div class="slide-header-row">
        <h1 class="slide-title">0. H042 전기 생산 설계 문제점 · 케이블 누락 및 Diagram 코멘트 총괄표</h1>
        <span class="slide-corner-label is-new">자동 생성 · ${escapeHtml(pkg.generatedAt)}</span>
      </div>
      <div class="teal-rule"></div>
      <div class="drawing-subtitle">
        대상 : <span class="muted-ref">EL-000-DIA-0001/0002 · EL-100-GAR-0001 · CI-000-DIA-0001(iCAMS) · CI-000-DIA-0002(PSDS) · PR-100/200/300-PID-0001</span>
      </div>

      <div class="cover-kpis">
        <div class="kpi-box crit">
          <div class="kpi-label">케이블 누락 · HOLD · 미할당</div>
          <div class="kpi-num">${pkg.summaryCounts.totalMissingOrHoldCables}건</div>
        </div>
        <div class="kpi-box crit">
          <div class="kpi-label">첨부양식 슬라이드</div>
          <div class="kpi-num">${pkg.summaryCounts.totalCommentSheets}장</div>
        </div>
        <div class="kpi-box">
          <div class="kpi-label">태그·블록도 오기 / W/D 누락</div>
          <div class="kpi-num">${pkg.summaryCounts.tagOrBlockErrorCount + pkg.summaryCounts.wdMissingCount}건</div>
        </div>
        <div class="kpi-box">
          <div class="kpi-label">Critical 중대 코멘트</div>
          <div class="kpi-num">${pkg.summaryCounts.criticalSheets}건</div>
        </div>
      </div>

      <h3 style="margin:0 0 6px 0;font-size:12.5px;color:#103258;">[A] 전기 Diagram별 코멘트 배분 현황</h3>
      <table class="summary-table">
        <thead>
          <tr>
            <th style="width:24%">대상 전기 Diagram</th>
            <th style="width:14%">중요도</th>
            <th style="width:14%">근거 슬라이드</th>
            <th>핵심 코멘트 요약</th>
          </tr>
        </thead>
        <tbody>${diagramGroupRowsHtml}</tbody>
      </table>

      <h3 style="margin:0 0 6px 0;font-size:12.5px;color:#103258;">[B] 케이블 누락 및 미확정(HOLD/T.B.D/RC****) 정리 목록</h3>
      <table class="summary-table">
        <thead>
          <tr>
            <th>유닛</th>
            <th>계기·장비 태그</th>
            <th>누락·문제 유형</th>
            <th>현재 도면 상태</th>
            <th>코멘트 대상 도면</th>
            <th>근거 페이지</th>
            <th>조치 요구사항</th>
          </tr>
        </thead>
        <tbody>${missingCableRowsHtml}</tbody>
      </table>

      <div class="slide-footer">
        <span>${escapeHtml(pkg.projectCode)} 선박 배관·전장 다이어그램 분석기 · 첨부양식 보고서</span>
        <span>Summary Sheet</span>
      </div>
    </div>
  </article>`;

  const detailSlidesHtml = pkg.commentSheets
    .map((sheet) => {
      const evGridClass = sheet.evidencePanels.length <= 1 ? 'ev-grid single' : 'ev-grid';
      const panelsHtml = sheet.evidencePanels
        .map((p) => renderEvidenceVisualHtml(p, snapshotsByPanelId))
        .join('');
      const queriesHtml = sheet.queries
        .map((q) => {
          const isArrow = q.trim().startsWith('->') || q.trim().startsWith('→');
          return `<li class="${isArrow ? 'action-arrow' : ''}">${escapeHtml(q)}</li>`;
        })
        .join('');
      const commentsHtml = sheet.electricalComments
        .map((c) => `<li>${escapeHtml(c)}</li>`)
        .join('');
      const isChecklist = sheet.slideKind === 'CHECKLIST';

      return `<article class="slide" data-slide="${sheet.sheetNo}">
        <div class="slide-top-bar"></div>
        <div class="slide-inner">
          <div class="slide-header-row">
            <h2 class="slide-title">${escapeHtml(sheet.title)}</h2>
            <span class="slide-corner-label ${sheet.isNewTag ? 'is-new' : ''}">${escapeHtml(sheet.badgeLabel)}</span>
          </div>
          <div class="teal-rule"></div>
          <div class="drawing-subtitle">${escapeHtml(sheet.drawingSubtitle)}</div>

          ${
            sheet.evidencePanels.length > 0
              ? `<div class="${evGridClass}">${panelsHtml}</div>`
              : ''
          }

          <div class="query-box ${isChecklist ? 'checklist' : ''}">
            <h3 class="query-box-title">${isChecklist ? '추가 요청사항 (재요청 · 총괄)' : '질의 / 요청'}</h3>
            <ul>${queriesHtml}</ul>
          </div>

          <div class="comment-strip">
            <div class="comment-strip-title">전기 Diagram 코멘트 조치사항 (${escapeHtml(sheet.targetDiagram)})</div>
            <ul>${commentsHtml}</ul>
          </div>

          <div class="slide-footer">
            <span>대상: ${escapeHtml(sheet.targetDiagram)} · 근거: ${escapeHtml(sheet.evidencePanels.map((p) => `${p.drawingNo} p.${p.pageNum}`).join(' / ') || '전 도면 공통')}</span>
            <span>Slide ${sheet.sheetNo} / ${pkg.commentSheets.length}</span>
          </div>
        </div>
      </article>`;
    })
    .join('\n');

  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(pkg.projectCode)} 전기 생산 설계 문제점 및 Diagram 코멘트 보고서 (첨부양식)</title>
  <style>${TEMPLATE_REPORT_CSS}</style>
</head>
<body>
  <main class="deck">
    ${coverSlideHtml}
    ${detailSlidesHtml}
  </main>
</body>
</html>`;
}
