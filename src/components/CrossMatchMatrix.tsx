import React, { useMemo, useState } from 'react';
import {
  Search,
  RefreshCw,
  Download,
  Plus,
  AlertTriangle,
  AlertOctagon,
  CheckCircle2,
  XCircle,
  ArrowUpRight,
  RotateCcw,
  FileSearch,
  FileCode2,
  Cable,
  Layers,
  Cpu,
  Gauge,
  ClipboardCheck,
} from 'lucide-react';
import {
  CrossLayerDiffItem,
  DrawingContentAnalysisReport,
  DrawingPinNote,
  EvaluatedLoopMatch,
  MatchStatus,
  ParallelBatchSummary,
  RuleViolationHit,
  UnitCode,
} from '../types/diagram';
import { LoopFilterOptions, exportLoopsToCsv } from '../utils/diagramMatcher';
import { ParallelMatchVisualizer } from './ParallelMatchVisualizer';
import { DiscrepancySeveritySummaryCard } from './DiscrepancySeveritySummaryCard';
import { HtmlReportExportModal } from './HtmlReportExportModal';

interface CrossMatchMatrixProps {
  loops: EvaluatedLoopMatch[];
  filteredLoops: EvaluatedLoopMatch[];
  summary: ParallelBatchSummary;
  filters: LoopFilterOptions;
  onChangeFilters: (next: LoopFilterOptions) => void;
  onRerunParallelMatch: () => void;
  onInspectLoop: (loopId: string) => void;
  onCompareInPdf: (loop: EvaluatedLoopMatch, autoInsert?: boolean) => void;
  onOpenAddLoop: () => void;
  isBatchRunning: boolean;
  analysisReport?: DrawingContentAnalysisReport | null;
  diffs?: CrossLayerDiffItem[];
  ruleViolations?: RuleViolationHit[];
  pinNotes?: DrawingPinNote[];
  onOpenCommentReport?: () => void;
}

const STATUS_STYLE_MAP: Record<MatchStatus, { text: string; border: string; bg: string }> = {
  MATCHED: { text: 'text-emerald-800', border: 'border-emerald-200', bg: 'bg-emerald-50' },
  CABLE_MISSING: { text: 'text-red-800', border: 'border-red-200', bg: 'bg-red-50' },
  UNASSIGNED_CIRCUIT: { text: 'text-amber-800', border: 'border-amber-200', bg: 'bg-amber-50' },
  PID_ONLY: { text: 'text-amber-800', border: 'border-amber-200', bg: 'bg-amber-50' },
  CONFLICT: { text: 'text-red-800', border: 'border-red-200', bg: 'bg-red-50' },
  REVISION_DRIFT: { text: 'text-amber-900', border: 'border-amber-300', bg: 'bg-amber-50' },
};

export const CrossMatchMatrix: React.FC<CrossMatchMatrixProps> = ({
  loops,
  filteredLoops,
  summary,
  filters,
  onChangeFilters,
  onRerunParallelMatch,
  onInspectLoop,
  onCompareInPdf,
  onOpenAddLoop,
  isBatchRunning,
  analysisReport,
  diffs = [],
  ruleViolations = [],
  pinNotes = [],
  onOpenCommentReport,
}) => {
  const [isHtmlExportOpen, setIsHtmlExportOpen] = useState(false);
  const topDiscrepancyLoop = useMemo(
    () =>
      filteredLoops.find((l) => l.discrepancies.some((d) => d.severity === 'CRITICAL')) ||
      filteredLoops.find((l) => l.discrepancies.length > 0) ||
      loops.find((l) => l.discrepancies.length > 0) ||
      filteredLoops[0] ||
      loops[0],
    [filteredLoops, loops]
  );
  const hasActiveFilter = useMemo(
    () =>
      filters.unitCode !== 'ALL' ||
      filters.status !== 'ALL' ||
      filters.system !== 'ALL' ||
      filters.query.trim() !== '',
    [filters]
  );

  const handleDownloadCsv = () => {
    const csv = exportLoopsToCsv(filteredLoops);
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `H042_Diagram_CrossMatch_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      {/* Concise Icon KPI Cards */}
      <section aria-label="병렬 매칭 요약 지표" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="flex items-center gap-3 rounded border border-slate-200 bg-white px-4 py-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded border border-slate-200 bg-slate-50 text-slate-700">
            <Layers className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-medium text-slate-500">전체 시그널 루프</div>
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-mono text-2xl font-semibold text-slate-900 tabular-nums">
                {summary.totalLoops}
              </span>
              <span className="truncate text-[11px] text-slate-500 tabular-nums">
                {summary.workerPartitionCount}모듈 · {summary.batchDurationMs}ms
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 rounded border border-slate-200 bg-white px-4 py-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded border border-emerald-200 bg-emerald-50 text-emerald-700">
            <CheckCircle2 className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-medium text-slate-500">3-Way 정상 매칭</div>
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-mono text-2xl font-semibold text-emerald-700 tabular-nums">
                {summary.matchedCount}
              </span>
              <span className="text-xs font-medium text-emerald-700 tabular-nums">
                정합률 {summary.matchRatePercent}%
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 rounded border border-slate-200 bg-white px-4 py-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded border border-amber-200 bg-amber-50 text-amber-700">
            <Cable className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-medium text-slate-500">케이블 누락 · 미할당</div>
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-mono text-2xl font-semibold text-amber-700 tabular-nums">
                {summary.cableMissingCount + summary.unassignedCircuitCount + summary.pidOnlyCount}
              </span>
              <span className="text-[11px] text-slate-500 tabular-nums">
                B:{summary.cableMissingCount} · C:{summary.unassignedCircuitCount} · D:{summary.pidOnlyCount}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 rounded border border-slate-200 bg-white px-4 py-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded border border-red-200 bg-red-50 text-red-700">
            <AlertOctagon className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-medium text-slate-500">도면 오기 · 리비전 충돌</div>
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-mono text-2xl font-semibold text-red-700 tabular-nums">
                {summary.conflictCount + summary.revisionDriftCount}
              </span>
              <span className="text-[11px] text-red-700 tabular-nums">
                심각 {summary.criticalIssuesCount} · 주의 {summary.warningIssuesCount}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Parallel Worker Partition & Quick Actions Strip */}
      <section className="flex flex-wrap items-center justify-between gap-3 rounded border border-slate-200 bg-white px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="font-semibold text-slate-800">모듈 필터</span>
          {summary.moduleBreakdown.map((mod) => (
            <button
              key={mod.unitCode}
              type="button"
              onClick={() =>
                onChangeFilters({
                  ...filters,
                  unitCode: filters.unitCode === mod.unitCode ? 'ALL' : mod.unitCode,
                })
              }
              title={mod.moduleName}
              className={`inline-flex items-center gap-1.5 rounded border px-2.5 py-1 transition-colors ${
                filters.unitCode === mod.unitCode
                  ? 'border-sky-600 bg-sky-50 text-sky-800'
                  : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300'
              }`}
            >
              <span className="font-mono font-semibold">{mod.unitCode}</span>
              <span className="text-slate-400">·</span>
              <span className="inline-flex items-center gap-0.5 tabular-nums text-emerald-700">
                <CheckCircle2 className="h-3 w-3" />
                <span>{mod.matched}</span>
              </span>
              <span className="inline-flex items-center gap-0.5 tabular-nums text-red-700">
                <AlertTriangle className="h-3 w-3" />
                <span>{mod.issues}</span>
              </span>
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {topDiscrepancyLoop && (
            <button
              type="button"
              onClick={() => onCompareInPdf(topDiscrepancyLoop, true)}
              className="inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded border border-sky-700 bg-sky-700 px-2.5 text-xs font-semibold text-white hover:bg-sky-800"
            >
              <FileSearch className="h-3.5 w-3.5" />
              <span>결함 리스트 → PDF 위치·노트</span>
            </button>
          )}
          <button
            type="button"
            onClick={onOpenAddLoop}
            className="inline-flex h-8 items-center gap-1 whitespace-nowrap rounded border border-slate-300 bg-white px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>매칭 루프 추가</span>
          </button>
          <button
            type="button"
            onClick={onRerunParallelMatch}
            disabled={isBatchRunning}
            className="inline-flex h-8 items-center gap-1 whitespace-nowrap rounded border border-slate-300 bg-white px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isBatchRunning ? 'animate-spin' : ''}`} />
            <span>병렬 매칭 재계산</span>
          </button>
          <button
            type="button"
            onClick={handleDownloadCsv}
            className="inline-flex h-8 items-center gap-1 whitespace-nowrap rounded border border-slate-300 bg-white px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            <Download className="h-3.5 w-3.5" />
            <span>CSV 내보내기</span>
          </button>
          <button
            type="button"
            onClick={() => setIsHtmlExportOpen(true)}
            className="inline-flex h-8 items-center gap-1 whitespace-nowrap rounded border border-slate-300 bg-white px-2.5 text-xs font-medium text-slate-800 hover:border-sky-600 hover:bg-sky-50 hover:text-sky-800"
          >
            <FileCode2 className="h-3.5 w-3.5" />
            <span>HTML 보고서 내보내기</span>
          </button>
          {onOpenCommentReport && (
            <button
              type="button"
              onClick={onOpenCommentReport}
              className="inline-flex h-8 items-center gap-1 whitespace-nowrap rounded border border-[#103258] bg-[#103258] px-2.5 text-xs font-semibold text-white hover:bg-[#0b2542]"
            >
              <ClipboardCheck className="h-3.5 w-3.5" />
              <span>전기 코멘트·첨부양식</span>
            </button>
          )}
        </div>
      </section>

      {/* Severity Summary Dashboard Card (Critical / Warning / Info -> Click to Inspect Loop) */}
      <DiscrepancySeveritySummaryCard
        loops={loops}
        onInspectLoop={onInspectLoop}
      />

      {/* D3 Sunburst & Cross-Drawing Network Topology Visualizer */}
      <ParallelMatchVisualizer
        loops={loops}
        summary={summary}
        filters={filters}
        onChangeFilters={onChangeFilters}
        onInspectLoop={onInspectLoop}
        onCompareInPdf={onCompareInPdf}
        analysisReport={analysisReport}
      />

      {/* Filter & Search Toolbar */}
      <section className="rounded border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
          <div className="flex flex-1 flex-wrap items-center gap-2">
            <div className="relative min-w-[240px] flex-1 max-w-sm">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                aria-label="태그, 케이블, JB, 라인번호 검색"
                value={filters.query}
                onChange={(e) => onChangeFilters({ ...filters, query: e.target.value })}
                placeholder="태그(SDV-101), 케이블(RC0308), JB(ISJB) 검색..."
                className="h-8 w-full rounded border border-slate-300 bg-white pr-3 pl-8 text-xs text-slate-900 placeholder:text-slate-400 focus:border-sky-600 focus:outline-none"
              />
            </div>

            <select
              aria-label="유닛 모듈 필터"
              value={filters.unitCode}
              onChange={(e) =>
                onChangeFilters({ ...filters, unitCode: e.target.value as 'ALL' | UnitCode })
              }
              className="h-8 rounded border border-slate-300 bg-white px-2.5 text-xs text-slate-700 focus:border-sky-600 focus:outline-none"
            >
              <option value="ALL">전체 유닛 (All Units)</option>
              <option value="100">100 · Regastainer</option>
              <option value="200">200 · HP Pump Skid</option>
              <option value="300">300 · Recondenser</option>
              <option value="400">400 · Utility Interface</option>
            </select>

            <select
              aria-label="매칭 상태 필터"
              value={filters.status}
              onChange={(e) =>
                onChangeFilters({
                  ...filters,
                  status: e.target.value as LoopFilterOptions['status'],
                })
              }
              className="h-8 rounded border border-slate-300 bg-white px-2.5 text-xs text-slate-700 focus:border-sky-600 focus:outline-none"
            >
              <option value="ALL">전체 상태 ({loops.length})</option>
              <option value="ISSUES_ONLY">불일치/누락만 보기</option>
              <option value="MATCHED">정상 매칭</option>
              <option value="CONFLICT">도면 불일치 / 오기</option>
              <option value="CABLE_MISSING">케이블 누락 (Mark B)</option>
              <option value="UNASSIGNED_CIRCUIT">번호 미할당 (Mark C)</option>
              <option value="PID_ONLY">P&ID 단독 (Mark D)</option>
              <option value="REVISION_DRIFT">리비전 불일치</option>
            </select>

            <select
              aria-label="전장 계통 필터"
              value={filters.system}
              onChange={(e) =>
                onChangeFilters({
                  ...filters,
                  system: e.target.value as LoopFilterOptions['system'],
                })
              }
              className="h-8 rounded border border-slate-300 bg-white px-2.5 text-xs text-slate-700 focus:border-sky-600 focus:outline-none"
            >
              <option value="ALL">전체 전장 계통</option>
              <option value="ICAMS">iCAMS (DIA-0001)</option>
              <option value="PSDS">PSDS (DIA-0002)</option>
              <option value="ESD_MCC">EXMAR ESD / MCC</option>
              <option value="UNLINKED">전장 미연결 (Unlinked)</option>
            </select>

            {hasActiveFilter && (
              <button
                type="button"
                onClick={() =>
                  onChangeFilters({ unitCode: 'ALL', status: 'ALL', system: 'ALL', query: '' })
                }
                className="inline-flex h-8 items-center gap-1 rounded border border-slate-200 px-2 text-xs text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              >
                <RotateCcw className="h-3 w-3" />
                <span>초기화</span>
              </button>
            )}
          </div>

          <div className="text-xs text-slate-500 tabular-nums">
            표시 {filteredLoops.length} / {loops.length} 건
          </div>
        </div>

        {/* Icon + Cable Continuity Cross-Matching Table */}
        {filteredLoops.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14 text-center">
            <p className="text-sm font-medium text-slate-700">조건에 일치하는 매칭 루프가 없습니다.</p>
            <p className="mt-1 text-xs text-slate-500">
              검색어나 모듈/상태 필터를 초기화하거나 새 매칭 루프를 추가해 주세요.
            </p>
            <button
              type="button"
              onClick={() =>
                onChangeFilters({ unitCode: 'ALL', status: 'ALL', system: 'ALL', query: '' })
              }
              className="mt-3 inline-flex h-8 items-center gap-1.5 rounded border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              필터 전체 초기화
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600">
                  <th className="px-3 py-2.5">유닛</th>
                  <th className="px-3 py-2.5">기준 태그 (P&ID)</th>
                  <th className="px-3 py-2.5">배관 · 장비</th>
                  <th className="px-3 py-2.5">GAR · 계통</th>
                  <th className="px-3 py-2.5">3-Way 케이블 연결 경로</th>
                  <th className="px-3 py-2.5">검증 상태</th>
                  <th className="px-3 py-2.5 text-right">완전도</th>
                  <th className="px-3 py-2.5 text-right">추적</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredLoops.map((loop) => {
                  const st = STATUS_STYLE_MAP[loop.status];
                  const firstPath = loop.electricalPaths[0];
                  const shortCable =
                    loop.primaryCableNo === 'UNWIRED'
                      ? '미연결'
                      : loop.primaryCableNo === 'LOCAL (NO CABLE)'
                        ? '로컬 게이지'
                        : loop.primaryCableNo.split(/\s+/)[0];
                  const garOk = Boolean(loop.gar);
                  const elecOk =
                    loop.status === 'MATCHED'
                      ? true
                      : loop.status === 'PID_ONLY' || loop.status === 'CABLE_MISSING'
                        ? false
                        : 'WARN';

                  return (
                    <tr
                      key={loop.id}
                      onClick={() => onInspectLoop(loop.id)}
                      className="cursor-pointer transition-colors hover:bg-sky-50/40"
                    >
                      <td className="px-3 py-2 font-mono font-semibold text-slate-700 tabular-nums">
                        {loop.unitCode}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1.5">
                          <Gauge className="h-3.5 w-3.5 shrink-0 text-sky-700" />
                          <span className="font-mono font-semibold text-slate-900">
                            {loop.canonicalTag}
                          </span>
                        </div>
                        <div className="max-w-[200px] truncate pl-5 text-[11px] text-slate-500">
                          {loop.serviceName}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <div className="font-mono text-[11px] text-slate-800">
                          {loop.pid.lineNo || loop.equipmentTag}
                        </div>
                        <div className="text-[11px] text-slate-500 tabular-nums">
                          {loop.pid.sheet} · {loop.equipmentTag}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1 font-mono text-[11px] text-slate-800">
                          <span>{loop.gar ? `Mk.${loop.gar.markupCode}` : '미표기'}</span>
                          <span className="text-slate-300">·</span>
                          <Cpu className="h-3 w-3 text-slate-500" />
                          <span>{loop.primarySystem}</span>
                        </div>
                        <div className="max-w-[160px] truncate text-[10.5px] text-slate-500">
                          {loop.gar ? `GAR ${loop.gar.sheet}` : 'GAR 없음'}
                          {firstPath ? ` · ${firstPath.connectionSheet}` : ''}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        {/* Visual 3-Point Cable Continuity Schematic */}
                        <div className="flex items-center gap-1.5 font-mono text-[11px]">
                          <span
                            title="P&ID"
                            className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-emerald-500 bg-emerald-50 text-[9px] font-bold text-emerald-700"
                          >
                            P
                          </span>
                          <span
                            className={`h-0.5 w-3 ${garOk ? 'bg-emerald-500' : 'border-t border-dashed border-amber-500'}`}
                          />
                          <span
                            title="GAR"
                            className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[9px] font-bold ${
                              garOk
                                ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                                : 'border-amber-400 bg-amber-50 text-amber-700'
                            }`}
                          >
                            G
                          </span>
                          <span
                            className={`h-0.5 w-3 ${
                              elecOk === true
                                ? 'bg-emerald-500'
                                : elecOk === false
                                  ? 'border-t border-dashed border-red-500'
                                  : 'bg-amber-400'
                            }`}
                          />
                          <span
                            className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10.5px] font-medium ${
                              elecOk === true
                                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                                : elecOk === false
                                  ? 'border-red-200 bg-red-50 text-red-700'
                                  : 'border-amber-200 bg-amber-50 text-amber-800'
                            }`}
                          >
                            <Cable className="h-3 w-3 shrink-0" />
                            <span>{shortCable}</span>
                          </span>
                        </div>
                        <div className="mt-0.5 truncate text-[10.5px] text-slate-500">
                          JB: {loop.primaryJunctionBox}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[11px] font-medium ${st.border} ${st.bg} ${st.text}`}
                        >
                          {loop.status === 'MATCHED' ? (
                            <CheckCircle2 className="h-3 w-3 shrink-0" />
                          ) : loop.status === 'CONFLICT' || loop.status === 'CABLE_MISSING' ? (
                            <XCircle className="h-3 w-3 shrink-0" />
                          ) : (
                            <AlertTriangle className="h-3 w-3 shrink-0" />
                          )}
                          <span>{loop.statusLabelKo}</span>
                        </span>
                        {loop.discrepancies.length > 0 && (
                          <div className="mt-0.5 max-w-[200px] truncate text-[10.5px] text-slate-500">
                            {loop.discrepancies[0].title}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          <span className="inline-block h-1.5 w-10 overflow-hidden rounded-full bg-slate-200">
                            <span
                              className={`block h-full ${
                                loop.completenessScore >= 90
                                  ? 'bg-emerald-600'
                                  : loop.completenessScore >= 60
                                    ? 'bg-amber-500'
                                    : 'bg-red-600'
                              }`}
                              style={{ width: `${loop.completenessScore}%` }}
                            />
                          </span>
                          <span className="font-mono font-semibold text-slate-800 tabular-nums">
                            {loop.completenessScore}%
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="inline-flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onCompareInPdf(loop, true);
                            }}
                            aria-label={`${loop.canonicalTag} PDF 위치 찾기 및 자동 노트 삽입`}
                            title="PDF 위치·자동 노트"
                            className="inline-flex h-7 items-center gap-1 whitespace-nowrap rounded border border-slate-200 bg-white px-2 text-[11px] font-medium text-slate-700 hover:border-sky-600 hover:bg-sky-50 hover:text-sky-800"
                          >
                            <FileSearch className="h-3 w-3" />
                            <span>PDF</span>
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onInspectLoop(loop.id);
                            }}
                            aria-label={`${loop.canonicalTag} 루프 추적 열기`}
                            title="루프 추적"
                            className="inline-flex h-7 w-7 items-center justify-center rounded border border-slate-200 text-slate-600 hover:border-sky-600 hover:text-sky-700"
                          >
                            <ArrowUpRight className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <HtmlReportExportModal
        isOpen={isHtmlExportOpen}
        onClose={() => setIsHtmlExportOpen(false)}
        summary={summary}
        loops={loops}
        diffs={diffs}
        ruleViolations={ruleViolations}
        pinNotes={pinNotes}
        analysisReport={analysisReport}
      />
    </div>
  );
};
