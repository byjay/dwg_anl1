import React, { useMemo, useState } from 'react';
import {
  AlertOctagon,
  CheckCircle2,
  ClipboardList,
  Download,
  ExternalLink,
  Eye,
  FileSpreadsheet,
  FileText,
  Filter,
  RotateCcw,
  ShieldAlert,
} from 'lucide-react';
import { WorkbenchTab } from './TopBar';
import {
  ProcessChecklistEvaluation,
  ReviewDisciplineStage,
} from '../utils/drawingProcessChecklistEngine';
import {
  buildSapIncompleteHtmlReport,
  buildSapIncompleteReportPayload,
  exportSapIncompleteCsv,
  exportSapIncompleteJson,
} from '../utils/sapReportExporter';

interface ProcessChecklistPanelProps {
  evaluation: ProcessChecklistEvaluation;
  onToggleManualSignOff: (itemId: string, nextValue: boolean) => void;
  onMarkAutoCompletedSignedOff: () => void;
  onResetManualSignOffs: () => void;
  onSelectTab: (tab: WorkbenchTab) => void;
}

export const ProcessChecklistPanel: React.FC<ProcessChecklistPanelProps> = ({
  evaluation,
  onToggleManualSignOff,
  onMarkAutoCompletedSignedOff,
  onResetManualSignOffs,
  onSelectTab,
}) => {
  const [stageFilter, setStageFilter] = useState<ReviewDisciplineStage | 'ALL'>('ALL');
  const [incompleteOnly, setIncompleteOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSapPreview, setShowSapPreview] = useState(false);
  const [sapExportNotice, setSapExportNotice] = useState<string | null>(null);

  const sapPayload = useMemo(
    () => buildSapIncompleteReportPayload(evaluation),
    [evaluation]
  );

  const visibleItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return evaluation.items.filter((item) => {
      if (stageFilter !== 'ALL' && item.discipline !== stageFilter) return false;
      if (incompleteOnly && item.effectiveCompleted) return false;
      if (!q) return true;
      return (
        item.code.toLowerCase().includes(q) ||
        item.titleKo.toLowerCase().includes(q) ||
        item.findingSummaryKo.toLowerCase().includes(q) ||
        item.actionRequiredKo.toLowerCase().includes(q) ||
        item.affectedTags.some((t) => t.toLowerCase().includes(q)) ||
        item.evidenceDrawings.some((d) => d.toLowerCase().includes(q))
      );
    });
  }, [evaluation.items, stageFilter, incompleteOnly, searchQuery]);

  const triggerDownload = (content: string, mimeType: string, filename: string) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const dateStamp = new Date().toISOString().slice(0, 10);

  const handleExportSapHtml = () => {
    const html = buildSapIncompleteHtmlReport(sapPayload);
    const filename = `SAP_ZREVIEW_OPEN_ITEMS_${dateStamp}.html`;
    triggerDownload(html, 'text/html;charset=utf-8;', filename);
    setSapExportNotice(
      `${filename} (미완료 ${sapPayload.summary.incompleteCount}건 · HOLD ${sapPayload.summary.holdBlockedCount}건) SAP ALV HTML 보고서를 추출했습니다.`
    );
  };

  const handleExportSapCsv = () => {
    const csv = exportSapIncompleteCsv(sapPayload);
    const filename = `SAP_ZREVIEW_OPEN_ITEMS_${dateStamp}.csv`;
    triggerDownload('\uFEFF' + csv, 'text/csv;charset=utf-8;', filename);
    setSapExportNotice(
      `${filename} (SAP ALV 행 ${sapPayload.rows.length}건) 엑셀 호환 CSV 파일을 추출했습니다.`
    );
  };

  const handleExportSapJson = () => {
    const json = exportSapIncompleteJson(sapPayload);
    const filename = `SAP_ZREVIEW_OPEN_ITEMS_${dateStamp}.json`;
    triggerDownload(json, 'application/json;charset=utf-8;', filename);
    setSapExportNotice(
      `${filename} (SAP RFC ET_OPEN_ITEMS ${sapPayload.rows.length}건) 페이로드를 추출했습니다.`
    );
  };

  return (
    <div className="space-y-4">
      {/* 4-Stage Practical Engineering Review Process Stepper */}
      <section className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
        {evaluation.summary.byStage.map((stage) => {
          const isSelected = stageFilter === stage.discipline;
          return (
            <button
              key={stage.discipline}
              type="button"
              data-testid={`stage-card-${stage.discipline}`}
              onClick={() =>
                setStageFilter((prev) =>
                  prev === stage.discipline ? 'ALL' : stage.discipline
                )
              }
              className={`rounded border p-3 text-left transition-colors ${
                isSelected
                  ? 'border-[#0070F2] bg-sky-50/80'
                  : 'border-slate-200 bg-white hover:border-slate-300'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-[11px] font-bold text-[#005CC8]">
                  STAGE 0{stage.stageOrder}
                </span>
                <span className="font-mono text-xs font-bold text-slate-800 tabular-nums">
                  {stage.completed}/{stage.total} 완료
                </span>
              </div>
              <div className="mt-1 text-xs font-bold text-slate-900">
                {stage.shortLabelKo}
              </div>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded bg-slate-100">
                <div
                  style={{ width: `${stage.completionPct}%` }}
                  className={`h-full ${
                    stage.incomplete === 0 ? 'bg-emerald-600' : 'bg-[#0070F2]'
                  }`}
                />
              </div>
              <div className="mt-1.5 flex items-center justify-between font-mono text-[10.5px] tabular-nums">
                <span
                  className={
                    stage.incomplete > 0
                      ? 'font-semibold text-amber-700'
                      : 'font-semibold text-emerald-700'
                  }
                >
                  미완료 {stage.incomplete}건
                </span>
                {stage.holdBlocked > 0 && (
                  <span className="font-semibold text-red-700">
                    HOLD {stage.holdBlocked}건
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </section>

      {/* Real-Time SAP Incomplete Items Report Export Bar */}
      <section className="rounded border border-slate-300 bg-[#1B2A3A] p-4 text-white">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 font-mono text-[11px] text-sky-200">
              <span>SAP REPORT · ZREVIEW_OPEN_ITEMS</span>
              <span aria-hidden="true">·</span>
              <span>PROGRAM ZR_H042_DWG_CHK_01</span>
              <span aria-hidden="true">·</span>
              <span
                data-testid="sap-gate-status-badge"
                className={`rounded px-1.5 py-0.5 font-bold ${
                  sapPayload.header.releaseGateStatus === 'RELEASE_READY'
                    ? 'bg-emerald-500/20 text-emerald-200'
                    : 'bg-red-500/25 text-red-200'
                }`}
              >
                {sapPayload.header.releaseGateStatus}
              </span>
            </div>
            <h2 className="mt-1 text-sm font-bold">
              실시간 미완료 항목 SAP 보고 추출 (현재 미완료{' '}
              <span data-testid="live-incomplete-count" className="font-mono text-amber-300 tabular-nums">
                {evaluation.summary.incompleteCount}건
              </span>{' '}
              / 전체 {evaluation.summary.total}건 · 진행률 {evaluation.summary.completionRatePct}%)
            </h2>
            <p className="mt-0.5 text-[11px] text-slate-300">
              P&amp;ID · GAR · Electrical · 통합교차 단계의 미완료 및 HOLD 차단({evaluation.summary.holdBlockedCount}건) 항목만 실시간으로 SAP ALV Spool/Excel/RFC 포맷으로 추출합니다.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              data-testid="toggle-sap-preview"
              onClick={() => setShowSapPreview((v) => !v)}
              className="inline-flex h-8 items-center gap-1.5 rounded border border-slate-500 bg-slate-800 px-3 text-xs font-medium text-slate-100 hover:bg-slate-700"
            >
              <Eye className="h-3.5 w-3.5" />
              <span>{showSapPreview ? 'SAP 미리보기 닫기' : 'SAP 미완료 미리보기'}</span>
            </button>
            <button
              type="button"
              data-testid="export-sap-html"
              onClick={handleExportSapHtml}
              className="inline-flex h-8 items-center gap-1.5 rounded bg-[#0070F2] px-3 text-xs font-semibold text-white hover:bg-[#005CC8]"
            >
              <FileText className="h-3.5 w-3.5" />
              <span>SAP ALV 보고서 (.html)</span>
            </button>
            <button
              type="button"
              data-testid="export-sap-csv"
              onClick={handleExportSapCsv}
              className="inline-flex h-8 items-center gap-1.5 rounded border border-sky-400/50 bg-sky-900/40 px-3 text-xs font-semibold text-sky-100 hover:bg-sky-900/70"
            >
              <FileSpreadsheet className="h-3.5 w-3.5" />
              <span>SAP ALV 엑셀 (.csv)</span>
            </button>
            <button
              type="button"
              data-testid="export-sap-json"
              onClick={handleExportSapJson}
              className="inline-flex h-8 items-center gap-1.5 rounded border border-slate-500 bg-slate-800 px-3 text-xs font-medium text-slate-100 hover:bg-slate-700"
            >
              <Download className="h-3.5 w-3.5" />
              <span>SAP RFC JSON</span>
            </button>
          </div>
        </div>

        {sapExportNotice && (
          <div
            data-testid="sap-export-success"
            className="mt-3 flex items-center gap-2 rounded border border-emerald-400/40 bg-emerald-950/60 px-3 py-1.5 text-xs text-emerald-100"
          >
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-300" />
            <span>{sapExportNotice}</span>
          </div>
        )}

        {/* Inline Real-Time SAP ALV Spool Preview */}
        {showSapPreview && (
          <div
            data-testid="sap-alv-preview-table"
            className="mt-3 overflow-hidden rounded border border-slate-600 bg-white text-slate-900"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-[#EEF4FB] px-3 py-2 font-mono text-[11px] text-[#103258]">
              <span>
                ALV SPOOL · CLIENT {sapPayload.header.client} · PROJECT{' '}
                {sapPayload.header.projectDef} · 미완료 {sapPayload.rows.length}건
              </span>
              <span>
                HOLD {sapPayload.summary.holdBlockedCount} · CRITICAL{' '}
                {sapPayload.summary.criticalCount} · WARNING {sapPayload.summary.warningCount}
              </span>
            </div>
            <div className="max-h-72 overflow-auto">
              <table className="w-full border-collapse text-left text-[11px]">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-100 text-slate-700">
                    <th className="px-2.5 py-1.5 font-mono">POSNR</th>
                    <th className="px-2.5 py-1.5 font-mono">CHK_CODE</th>
                    <th className="px-2.5 py-1.5 font-mono">ALV_STAT</th>
                    <th className="px-2.5 py-1.5">단계/공종</th>
                    <th className="px-2.5 py-1.5">미완료 사유</th>
                    <th className="px-2.5 py-1.5 font-mono">TCODE / 팀</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {sapPayload.rows.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-3 py-6 text-center font-semibold text-emerald-700">
                        미완료 항목이 없습니다. 모든 검토 항목이 완료되었습니다.
                      </td>
                    </tr>
                  ) : (
                    sapPayload.rows.map((r) => (
                      <tr key={r.itemId} className="align-top hover:bg-slate-50">
                        <td className="px-2.5 py-1.5 font-mono text-slate-500">{r.lineNo}</td>
                        <td className="px-2.5 py-1.5 font-mono font-bold text-slate-900 whitespace-nowrap">
                          {r.itemId}
                        </td>
                        <td className="px-2.5 py-1.5 font-mono whitespace-nowrap">
                          <span
                            className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-bold ${
                              r.sapStatusCode === 'E0001_HOLD'
                                ? 'bg-red-100 text-red-800'
                                : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {r.alvStatusIcon} {r.sapStatusLabelKo}
                          </span>
                        </td>
                        <td className="px-2.5 py-1.5 whitespace-nowrap">
                          <span className="font-semibold">{r.disciplineKo}</span>
                        </td>
                        <td className="px-2.5 py-1.5 text-slate-700">
                          <div className="font-semibold text-slate-900">{r.checkTitle}</div>
                          <div>{r.incompleteReason}</div>
                        </td>
                        <td className="px-2.5 py-1.5 font-mono whitespace-nowrap text-slate-700">
                          {r.sapTCode} · {r.responsibleGroup}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {/* Filter & Process Checklist Table */}
      <section className="overflow-hidden rounded border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2.5 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <Filter className="h-3.5 w-3.5 text-slate-500" />
            <select
              aria-label="실무 공종 단계 필터"
              value={stageFilter}
              onChange={(e) =>
                setStageFilter(e.target.value as ReviewDisciplineStage | 'ALL')
              }
              className="h-7 rounded border border-slate-300 bg-white px-2 text-xs text-slate-800"
            >
              <option value="ALL">전체 4단계 ({evaluation.summary.total}건)</option>
              <option value="PID">1단계 · P&amp;ID 공정도</option>
              <option value="GAR">2단계 · GAR 배치도</option>
              <option value="ELECTRICAL">3단계 · Electrical 전장</option>
              <option value="CROSS_GATE">4단계 · 통합교차 · 출도게이트</option>
            </select>

            <button
              type="button"
              data-testid="filter-incomplete-only"
              onClick={() => setIncompleteOnly((v) => !v)}
              className={`inline-flex h-7 items-center gap-1 rounded border px-2.5 text-xs font-semibold transition-colors ${
                incompleteOnly
                  ? 'border-red-300 bg-red-50 text-red-800'
                  : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
              }`}
            >
              <AlertOctagon className="h-3.5 w-3.5" />
              <span>미완료 항목만 보기 ({evaluation.summary.incompleteCount})</span>
            </button>

            <button
              type="button"
              onClick={onMarkAutoCompletedSignedOff}
              className="inline-flex h-7 items-center gap-1 rounded border border-emerald-300 bg-emerald-50 px-2.5 text-[11px] font-semibold text-emerald-900 hover:bg-emerald-100"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span>자동 통과 일괄 확인</span>
            </button>

            <button
              type="button"
              onClick={onResetManualSignOffs}
              className="inline-flex h-7 items-center gap-1 rounded border border-slate-300 bg-white px-2 text-[11px] font-medium text-slate-600 hover:bg-slate-100"
            >
              <RotateCcw className="h-3 w-3" />
              <span>서명 초기화</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="text"
              aria-label="실무 체크리스트 검색"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="태그(SDV), 코드(CHK-GAR), 도면명 검색..."
              className="h-7 w-60 rounded border border-slate-300 bg-white px-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-[#0070F2] focus:outline-none"
            />
            <span className="font-mono text-[11px] text-slate-500 tabular-nums">
              표시 {visibleItems.length} / {evaluation.summary.total}
            </span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600">
                <th className="w-16 px-3 py-2 text-center">완료</th>
                <th className="w-28 px-3 py-2">단계·코드</th>
                <th className="w-28 px-3 py-2">공종</th>
                <th className="px-3 py-2">실무 검토 항목 및 실시간 판정 근거</th>
                <th className="w-32 px-3 py-2">상태 / 심각도</th>
                <th className="w-52 px-3 py-2">대상 태그 · 근거 도면</th>
                <th className="w-28 px-3 py-2 text-right">SAP 이동</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {visibleItems.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                    선택한 필터 조건에 해당하는 실무 검토 항목이 없습니다.
                  </td>
                </tr>
              ) : (
                visibleItems.map((item) => (
                  <tr
                    key={item.id}
                    data-testid={`process-row-${item.code}`}
                    className={`align-top hover:bg-slate-50/80 ${
                      item.effectiveCompleted ? 'bg-emerald-50/15' : ''
                    }`}
                  >
                    <td className="px-3 py-2.5 text-center">
                      <input
                        type="checkbox"
                        aria-label={`${item.code} 실무 검토 완료 처리`}
                        checked={item.effectiveCompleted}
                        onChange={(e) =>
                          onToggleManualSignOff(item.id, e.target.checked)
                        }
                        className="h-4 w-4 accent-[#0070F2]"
                      />
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <div className="font-mono font-bold text-slate-900">{item.code}</div>
                      <div className="font-mono text-[10px] text-slate-500">
                        {item.processStandardRef}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1 rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10.5px] font-semibold text-slate-800">
                        <ClipboardList className="h-3 w-3 text-[#0070F2]" />
                        {item.disciplineLabelKo}
                      </span>
                      <div className="mt-0.5 font-mono text-[10px] text-slate-500">
                        {item.responsibleGroup}
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="font-semibold text-slate-900">{item.titleKo}</div>
                      <div className="mt-0.5 text-slate-700">{item.findingSummaryKo}</div>
                      <div className="mt-1 text-[11px] font-medium text-[#005CC8]">
                        조치: {item.actionRequiredKo}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      {item.effectiveCompleted ? (
                        <span className="inline-flex items-center gap-1 rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 font-mono text-[10.5px] font-semibold text-emerald-800">
                          <CheckCircle2 className="h-3 w-3" />
                          완료됨
                        </span>
                      ) : item.autoStatus === 'HOLD_BLOCKED' ? (
                        <span className="inline-flex items-center gap-1 rounded border border-red-200 bg-red-50 px-1.5 py-0.5 font-mono text-[10.5px] font-bold text-red-800">
                          <ShieldAlert className="h-3 w-3" />
                          HOLD 차단
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 font-mono text-[10.5px] font-semibold text-amber-800">
                          <AlertOctagon className="h-3 w-3" />
                          미완료
                        </span>
                      )}
                      <div className="mt-1 font-mono text-[10px] text-slate-500">
                        {item.severity} · 건수 {item.affectedCount}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 font-mono text-[10.5px] text-slate-700">
                      <div className="font-semibold text-slate-900">
                        {item.affectedTags.length > 0
                          ? item.affectedTags.slice(0, 3).join(', ')
                          : '-'}
                      </div>
                      <div className="mt-0.5 text-slate-500">
                        {item.evidenceDrawings.length > 0
                          ? item.evidenceDrawings.slice(0, 2).join(' · ')
                          : '-'}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => onSelectTab(item.targetTab)}
                        className="inline-flex h-7 items-center gap-1 rounded border border-slate-300 bg-white px-2 font-mono text-[11px] font-semibold text-slate-700 hover:border-[#0070F2] hover:text-[#0070F2]"
                      >
                        <span>{item.sapTCode}</span>
                        <ExternalLink className="h-3 w-3" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
