import React, { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  ClipboardCheck,
  Download,
  ExternalLink,
  FileCode2,
  FileText,
  Filter,
  Calculator,
  ShieldAlert,
  Wrench,
  Clock,
} from 'lucide-react';
import { ChecklistPdfExportModal } from './ChecklistPdfExportModal';
import { WorkbenchTab } from './TopBar';
import {
  CrossLayerDiffItem,
  DrawingContentAnalysisReport,
  DrawingPinNote,
  EvaluatedLoopMatch,
  LearnedEngineeringRule,
  ParallelAnalyzeResponse,
  RuleViolationHit,
  SpecReviewReport,
} from '../types/diagram';
import { ProcessChecklistPanel } from './ProcessChecklistPanel';
import { evaluateDrawingProcessChecklist } from '../utils/drawingProcessChecklistEngine';
import {
  buildMasterChecklistHtmlReport,
  DirectiveStatus,
  evaluateMasterChecklist,
  exportChecklistCsv,
  MASTER_DOMAINS,
} from '../utils/masterChecklistEngine';
import {
  calculateCableVoltageDrop,
  checkB313PressureTemp,
  convertEngineeringUnit,
  EngineeringUnit,
  exportDexpiSummaryJson,
  parseConfigurableLineNumber,
  verifyIntrinsicSafetyLoop,
} from '../utils/engineeringCalculators';

const STORAGE_KEY = 'h042_checklist_99_verified_v1';
const PROCESS_SIGNOFF_STORAGE_KEY = 'h042_process_checklist_signoff_v1';

interface ChecklistReportWorkspaceProps {
  evaluatedLoops: EvaluatedLoopMatch[];
  crossLayerDiffs?: CrossLayerDiffItem[];
  learnedRules: LearnedEngineeringRule[];
  ruleViolations: RuleViolationHit[];
  pinNotes: DrawingPinNote[];
  specReport: SpecReviewReport;
  analysisReport: DrawingContentAnalysisReport | null;
  aiResult: ParallelAnalyzeResponse | null;
  onSelectTab: (tab: WorkbenchTab) => void;
}

export const ChecklistReportWorkspace: React.FC<ChecklistReportWorkspaceProps> = ({
  evaluatedLoops,
  crossLayerDiffs = [],
  learnedRules,
  ruleViolations,
  pinNotes,
  specReport,
  analysisReport,
  aiResult,
  onSelectTab,
}) => {
  const [subView, setSubView] = useState<'PROCESS' | 'CHECKLIST' | 'GUIDE'>('PROCESS');
  const [domainFilter, setDomainFilter] = useState<number | 'ALL'>('ALL');
  const [statusFilter, setStatusFilter] = useState<DirectiveStatus | 'ALL'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [isPdfModalOpen, setIsPdfModalOpen] = useState(false);

  const [verifiedIds, setVerifiedIds] = useState<Record<number, boolean>>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as Record<number, boolean>) : { 1: true, 13: true, 89: true };
    } catch {
      return { 1: true, 13: true, 89: true };
    }
  });

  const [manualSignOffs, setManualSignOffs] = useState<Record<string, boolean>>(() => {
    try {
      const raw = localStorage.getItem(PROCESS_SIGNOFF_STORAGE_KEY);
      return raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
    } catch {
      return {};
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(verifiedIds));
    } catch {
      // Ignore storage quota errors
    }
  }, [verifiedIds]);

  useEffect(() => {
    try {
      localStorage.setItem(PROCESS_SIGNOFF_STORAGE_KEY, JSON.stringify(manualSignOffs));
    } catch {
      // Ignore storage quota errors
    }
  }, [manualSignOffs]);

  const processEvaluation = useMemo(
    () =>
      evaluateDrawingProcessChecklist({
        evaluatedLoops,
        crossLayerDiffs,
        ruleViolations,
        specReport,
        pinNotes,
        analysisReport,
        aiResult,
        manualSignOffs,
      }),
    [
      evaluatedLoops,
      crossLayerDiffs,
      ruleViolations,
      specReport,
      pinNotes,
      analysisReport,
      aiResult,
      manualSignOffs,
    ]
  );

  const handleToggleProcessSignOff = (itemId: string, nextValue: boolean) => {
    setManualSignOffs((prev) => ({ ...prev, [itemId]: nextValue }));
  };

  const handleMarkAutoCompletedSignedOff = () => {
    setManualSignOffs((prev) => {
      const next = { ...prev };
      for (const item of processEvaluation.items) {
        if (item.autoStatus === 'COMPLETED') {
          next[item.id] = true;
        }
      }
      return next;
    });
  };

  const handleResetProcessSignOffs = () => {
    setManualSignOffs({});
  };

  const { items, summary } = useMemo(
    () =>
      evaluateMasterChecklist({
        evaluatedLoops,
        learnedRules,
        ruleViolations,
        pinNotes,
        specReport,
        analysisReport,
        aiResult,
      }),
    [evaluatedLoops, learnedRules, ruleViolations, pinNotes, specReport, analysisReport, aiResult]
  );

  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return items.filter((item) => {
      if (domainFilter !== 'ALL' && item.domainId !== domainFilter) return false;
      if (statusFilter !== 'ALL' && item.status !== statusFilter) return false;
      if (!q) return true;
      return (
        item.code.toLowerCase().includes(q) ||
        item.title.toLowerCase().includes(q) ||
        item.standardRef.toLowerCase().includes(q) ||
        item.implementationNote.toLowerCase().includes(q) ||
        item.evidenceModule.toLowerCase().includes(q)
      );
    });
  }, [items, domainFilter, statusFilter, searchQuery]);

  const verifiedCount = useMemo(
    () => items.filter((i) => Boolean(verifiedIds[i.id])).length,
    [items, verifiedIds]
  );

  const toggleVerified = (id: number) => {
    setVerifiedIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleMarkImplementedVerified = () => {
    const next = { ...verifiedIds };
    for (const item of items) {
      if (item.status === 'IMPLEMENTED') next[item.id] = true;
    }
    setVerifiedIds(next);
  };

  const handleDownloadHtmlReport = () => {
    const html = buildMasterChecklistHtmlReport({ items, summary, verifiedIds });
    const blob = new Blob([html], { type: 'text/html;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `H042_Master_Checklist_1_99_${new Date().toISOString().slice(0, 10)}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadCsv = () => {
    const csv = exportChecklistCsv(items, verifiedIds);
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `H042_Master_Checklist_1_99_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadDexpi = () => {
    const json = exportDexpiSummaryJson(evaluatedLoops, analysisReport);
    const blob = new Blob([json], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `H042_DEXPI_2_0_1_Topology_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Interactive Living Design Guide Calculators state
  const [unitVal, setUnitVal] = useState('45');
  const [fromUnit, setFromUnit] = useState<EngineeringUnit>('bar');
  const [toUnit, setToUnit] = useState<EngineeringUnit>('psi');

  const unitResult = useMemo(() => {
    const num = Number(unitVal);
    if (!Number.isFinite(num)) return null;
    try {
      return convertEngineeringUnit(num, fromUnit, toUnit);
    } catch (err) {
      return { error: err instanceof Error ? err.message : '변환 불가' };
    }
  }, [unitVal, fromUnit, toUnit]);

  const [lineInput, setLineInput] = useState('6"-300-LN-003-ZEA-C80');
  const [designPressBar, setDesignPressBar] = useState('48');
  const [designTempC, setDesignTempC] = useState('-163');

  const lineParsed = useMemo(() => parseConfigurableLineNumber(lineInput), [lineInput]);
  const b313Check = useMemo(
    () =>
      checkB313PressureTemp(
        lineParsed.pipeSpec || 'ZEA',
        Number(designPressBar) || 0,
        Number(designTempC) || 0
      ),
    [lineParsed.pipeSpec, designPressBar, designTempC]
  );

  const [vdVoltage, setVdVoltage] = useState('440');
  const [vdPhases, setVdPhases] = useState<1 | 3>(3);
  const [vdPowerKw, setVdPowerKw] = useState('22');
  const [vdLengthM, setVdLengthM] = useState('85');
  const [vdAreaMm2, setVdAreaMm2] = useState('16');
  const [vdAmpacity, setVdAmpacity] = useState('85');

  const vdResult = useMemo(() => {
    try {
      return calculateCableVoltageDrop({
        systemVoltageV: Number(vdVoltage) || 440,
        phases: vdPhases,
        loadPowerKw: Number(vdPowerKw) || 0,
        powerFactor: 0.85,
        cableLengthM: Number(vdLengthM) || 0,
        conductorAreaMm2: Number(vdAreaMm2) || 16,
        ratedAmpacityA: Number(vdAmpacity) || 85,
        maxAllowedDropPct: 5,
      });
    } catch {
      return null;
    }
  }, [vdVoltage, vdPhases, vdPowerKw, vdLengthM, vdAreaMm2, vdAmpacity]);

  const [isCableLen, setIsCableLen] = useState('180');
  const [isCiNf, setIsCiNf] = useState('12');
  const [isCoNf, setIsCoNf] = useState('83');

  const isLoopResult = useMemo(
    () =>
      verifyIntrinsicSafetyLoop(
        { uoV: 28, ioMa: 93, poW: 0.65, coNf: Number(isCoNf) || 83, loMh: 4.2 },
        { uiV: 30, iiMa: 100, piW: 0.75, ciNf: Number(isCiNf) || 12, liMh: 0.1 },
        { lengthM: Number(isCableLen) || 0, ccNfPerM: 0.2, lcMhPerM: 0.001 }
      ),
    [isCableLen, isCiNf, isCoNf]
  );

  return (
    <div className="space-y-4">
      {/* Header & KPI Bar */}
      <section className={`rounded border border-slate-200 bg-white p-5 ${isPdfModalOpen ? 'print:hidden' : ''}`}>
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-4">
          <div className="max-w-3xl">
            <div className="flex items-center gap-2">
              <ClipboardCheck className="h-4 w-4 text-[#0070F2]" />
              <h1 className="text-base font-bold text-slate-900">
                ZCL99 · 실무 도면검토(P&amp;ID·GAR·전장) 자동 체크리스트 및 SAP 미완료 보고
              </h1>
            </div>
            <p className="mt-1 text-xs text-slate-600">
              P&amp;ID · GAR · Electrical · 통합교차 도면 분석 결과와 실무 검토 프로세스 게이트를 실시간 집계하여
              완료되지 않은 항목을 SAP ALV/Excel/RFC 포맷으로 즉시 추출하고, 1~99 마스터 체크리스트 및 공학 계산기를 제공합니다.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              data-testid="open-pdf-export-modal"
              onClick={() => setIsPdfModalOpen(true)}
              className="inline-flex h-8 items-center gap-1.5 rounded bg-[#0070F2] px-3 text-xs font-semibold text-white hover:bg-[#005CC8]"
            >
              <FileText className="h-3.5 w-3.5" />
              <span>인쇄용 PDF 내보내기</span>
            </button>
            <button
              type="button"
              onClick={handleDownloadHtmlReport}
              className="inline-flex h-8 items-center gap-1.5 rounded border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              <Download className="h-3.5 w-3.5" />
              <span>체크리스트 HTML 보고서</span>
            </button>
            <button
              type="button"
              onClick={handleDownloadCsv}
              className="inline-flex h-8 items-center gap-1.5 rounded border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              <Download className="h-3.5 w-3.5" />
              <span>CSV 내보내기</span>
            </button>
            <button
              type="button"
              onClick={handleDownloadDexpi}
              className="inline-flex h-8 items-center gap-1.5 rounded border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              <FileCode2 className="h-3.5 w-3.5" />
              <span>DEXPI 2.0.1 JSON</span>
            </button>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
          <div className="rounded border border-sky-200 bg-sky-50/70 px-3.5 py-2.5">
            <div className="text-[11px] font-medium text-sky-800">실무 도면검토 진행</div>
            <div className="mt-1 font-mono text-xl font-bold text-sky-900 tabular-nums">
              {processEvaluation.summary.completedCount}/{processEvaluation.summary.total}
            </div>
            <div className="mt-0.5 font-mono text-[10px] text-sky-700 tabular-nums">
              완료율 {processEvaluation.summary.completionRatePct}%
            </div>
          </div>
          <div className="rounded border border-red-200 bg-red-50/70 px-3.5 py-2.5">
            <div className="text-[11px] font-medium text-red-800">미완료 (SAP 추출 대상)</div>
            <div className="mt-1 font-mono text-xl font-bold text-red-900 tabular-nums">
              {processEvaluation.summary.incompleteCount}건
            </div>
            <div className="mt-0.5 font-mono text-[10px] text-red-700 tabular-nums">
              HOLD 차단 {processEvaluation.summary.holdBlockedCount}건
            </div>
          </div>
          <div className="rounded border border-emerald-200 bg-emerald-50/70 px-3.5 py-2.5">
            <div className="text-[11px] font-medium text-emerald-800">마스터 1~99 적용</div>
            <div className="mt-1 font-mono text-xl font-bold text-emerald-900 tabular-nums">
              {summary.implementedCount}/{summary.total}
            </div>
          </div>
          <div className="rounded border border-amber-200 bg-amber-50/70 px-3.5 py-2.5">
            <div className="text-[11px] font-medium text-amber-800">부분 적용 / 로드맵</div>
            <div className="mt-1 font-mono text-xl font-bold text-amber-900 tabular-nums">
              {summary.partialCount} / {summary.plannedCount}
            </div>
          </div>
          <div className="rounded border border-slate-200 bg-slate-50 px-3.5 py-2.5">
            <div className="text-[11px] font-medium text-slate-600">1~99 수동 검증</div>
            <div className="mt-1 font-mono text-xl font-bold text-slate-900 tabular-nums">
              {verifiedCount} / {summary.total}
            </div>
          </div>
        </div>

        {/* Sub-view Switcher */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <div className="inline-flex flex-wrap rounded border border-slate-200 bg-slate-50 p-0.5 text-xs">
            <button
              type="button"
              data-testid="tab-process-checklist"
              onClick={() => setSubView('PROCESS')}
              className={`inline-flex items-center gap-1.5 rounded px-3 py-1.5 font-semibold transition-colors ${
                subView === 'PROCESS'
                  ? 'bg-[#0070F2] text-white'
                  : 'text-slate-700 hover:text-slate-900'
              }`}
            >
              <ClipboardCheck className="h-3.5 w-3.5" />
              <span>
                실무 도면검토 체크리스트 (P&amp;ID·GAR·전장 · 미완료{' '}
                {processEvaluation.summary.incompleteCount}건)
              </span>
            </button>
            <button
              type="button"
              data-testid="tab-master-checklist"
              onClick={() => setSubView('CHECKLIST')}
              className={`inline-flex items-center gap-1.5 rounded px-3 py-1.5 font-semibold transition-colors ${
                subView === 'CHECKLIST'
                  ? 'bg-[#0070F2] text-white'
                  : 'text-slate-700 hover:text-slate-900'
              }`}
            >
              <ClipboardCheck className="h-3.5 w-3.5" />
              <span>1~99 체크리스트 매트릭스 (99건)</span>
            </button>
            <button
              type="button"
              data-testid="tab-design-guide"
              onClick={() => setSubView('GUIDE')}
              className={`inline-flex items-center gap-1.5 rounded px-3 py-1.5 font-semibold transition-colors ${
                subView === 'GUIDE'
                  ? 'bg-[#0070F2] text-white'
                  : 'text-slate-700 hover:text-slate-900'
              }`}
            >
              <Calculator className="h-3.5 w-3.5" />
              <span>Living Design Guide · 공학 계산기</span>
            </button>
          </div>

          {subView === 'CHECKLIST' && (
            <button
              type="button"
              onClick={handleMarkImplementedVerified}
              className="inline-flex h-7 items-center gap-1 rounded border border-emerald-300 bg-emerald-50 px-2.5 text-[11px] font-semibold text-emerald-900 hover:bg-emerald-100"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span>적용 완료({summary.implementedCount}건) 일괄 확인 체크</span>
            </button>
          )}
        </div>
      </section>

      {subView === 'PROCESS' ? (
        <div className={isPdfModalOpen ? 'print:hidden' : ''}>
          <ProcessChecklistPanel
            evaluation={processEvaluation}
            onToggleManualSignOff={handleToggleProcessSignOff}
            onMarkAutoCompletedSignedOff={handleMarkAutoCompletedSignedOff}
            onResetManualSignOffs={handleResetProcessSignOffs}
            onSelectTab={onSelectTab}
          />
        </div>
      ) : subView === 'CHECKLIST' ? (
        <>
          {/* Domain Progress Grid (1~9) */}
          <section className={`grid grid-cols-1 gap-2.5 sm:grid-cols-3 lg:grid-cols-3 ${isPdfModalOpen ? 'print:hidden' : ''}`}>
            {summary.domainBreakdown.map((dom) => {
              const isSelected = domainFilter === dom.domainId;
              return (
                <button
                  key={dom.domainId}
                  type="button"
                  onClick={() =>
                    setDomainFilter((prev) => (prev === dom.domainId ? 'ALL' : dom.domainId))
                  }
                  className={`rounded border p-3 text-left transition-colors ${
                    isSelected
                      ? 'border-[#0070F2] bg-sky-50/70'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-xs font-semibold text-slate-900">
                      {dom.domainTitle}
                    </span>
                    <span className="shrink-0 font-mono text-[11px] font-bold text-slate-700 tabular-nums">
                      {dom.implemented}/{dom.total}
                    </span>
                  </div>
                  <div className="mt-2 flex h-1.5 w-full overflow-hidden rounded bg-slate-100">
                    <div
                      style={{ width: `${(dom.implemented / dom.total) * 100}%` }}
                      className="bg-emerald-600"
                    />
                    <div
                      style={{ width: `${(dom.partial / dom.total) * 100}%` }}
                      className="bg-amber-400"
                    />
                  </div>
                  <div className="mt-1.5 flex items-center gap-3 font-mono text-[10px] text-slate-500 tabular-nums">
                    <span className="text-emerald-700">완료 {dom.implemented}</span>
                    <span className="text-amber-700">부분 {dom.partial}</span>
                    <span>로드맵 {dom.planned}</span>
                  </div>
                </button>
              );
            })}
          </section>

          {/* Filter Strip + 99-Row Checklist Table */}
          <section className={`overflow-hidden rounded border border-slate-200 bg-white ${isPdfModalOpen ? 'print:hidden' : ''}`}>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2.5 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <Filter className="h-3.5 w-3.5 text-slate-500" />
                <select
                  aria-label="영역 필터"
                  value={domainFilter}
                  onChange={(e) =>
                    setDomainFilter(e.target.value === 'ALL' ? 'ALL' : Number(e.target.value))
                  }
                  className="h-7 rounded border border-slate-300 bg-white px-2 text-xs text-slate-800"
                >
                  <option value="ALL">전체 9개 영역 (01~99)</option>
                  {MASTER_DOMAINS.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.title} ({d.range})
                    </option>
                  ))}
                </select>

                <select
                  aria-label="적용 상태 필터"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as DirectiveStatus | 'ALL')}
                  className="h-7 rounded border border-slate-300 bg-white px-2 text-xs text-slate-800"
                >
                  <option value="ALL">전체 상태 (99)</option>
                  <option value="IMPLEMENTED">적용 완료 ({summary.implementedCount})</option>
                  <option value="PARTIAL">부분 적용 ({summary.partialCount})</option>
                  <option value="PLANNED">아키텍처 로드맵 ({summary.plannedCount})</option>
                </select>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  aria-label="체크리스트 검색"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="번호(ENG-13), 표준(IEC), 모듈명 검색..."
                  className="h-7 w-60 rounded border border-slate-300 bg-white px-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-[#0070F2] focus:outline-none"
                />
                <span className="font-mono text-[11px] text-slate-500 tabular-nums">
                  표시 {filteredItems.length} / {summary.total}
                </span>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600">
                    <th className="w-14 px-3 py-2 text-center">확인</th>
                    <th className="w-20 px-3 py-2">코드</th>
                    <th className="px-3 py-2">영역 / 지시사항 항목</th>
                    <th className="w-36 px-3 py-2">표준·기술</th>
                    <th className="w-28 px-3 py-2">상태</th>
                    <th className="px-3 py-2">적용 내역 및 근거 모듈</th>
                    <th className="w-24 px-3 py-2 text-right">실행 이동</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {filteredItems.map((item) => {
                    const checked = Boolean(verifiedIds[item.id]);
                    return (
                      <tr key={item.id} className="align-top hover:bg-slate-50/70">
                        <td className="px-3 py-2.5 text-center">
                          <input
                            type="checkbox"
                            aria-label={`${item.code} 엔지니어 검증 확인`}
                            checked={checked}
                            onChange={() => toggleVerified(item.id)}
                            className="h-3.5 w-3.5 accent-[#0070F2]"
                          />
                        </td>
                        <td className="px-3 py-2.5 font-mono font-bold text-slate-900 tabular-nums">
                          {item.code}
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="text-[10px] font-medium text-slate-500">
                            {item.domainTitle}
                          </div>
                          <div className="mt-0.5 font-semibold text-slate-900">{item.title}</div>
                        </td>
                        <td className="px-3 py-2.5 font-mono text-[11px] text-slate-700">
                          {item.standardRef}
                        </td>
                        <td className="px-3 py-2.5">
                          {item.status === 'IMPLEMENTED' ? (
                            <span className="inline-flex items-center gap-1 rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-emerald-800">
                              <CheckCircle2 className="h-3 w-3" />
                              적용 완료
                            </span>
                          ) : item.status === 'PARTIAL' ? (
                            <span className="inline-flex items-center gap-1 rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-amber-800">
                              <Wrench className="h-3 w-3" />
                              부분 적용
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded border border-slate-200 bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-slate-700">
                              <Clock className="h-3 w-3" />
                              로드맵
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="text-slate-700">{item.implementationNote}</div>
                          <div className="mt-0.5 font-mono text-[10px] text-slate-500">
                            근거: {item.evidenceModule}
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          {item.targetTab && item.targetTab !== 'checklist' ? (
                            <button
                              type="button"
                              onClick={() => onSelectTab(item.targetTab!)}
                              className="inline-flex h-7 items-center gap-1 rounded border border-slate-300 bg-white px-2 text-[11px] font-medium text-slate-700 hover:border-[#0070F2] hover:text-[#0070F2]"
                            >
                              <span>열기</span>
                              <ExternalLink className="h-3 w-3" />
                            </button>
                          ) : (
                            <span className="font-mono text-[10px] text-slate-400">ZCL99</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : (
        /* Living Design Guide & Pure Engineering Calculators */
        <div className={`grid grid-cols-1 gap-4 lg:grid-cols-2 ${isPdfModalOpen ? 'print:hidden' : ''}`}>
          {/* 1. IEC 61892-6 / 60092 Voltage Drop & Ampacity Calculator */}
          <section className="rounded border border-slate-200 bg-white p-4">
            <h2 className="text-sm font-bold text-slate-900">
              IEC 60092 케이블 전압강하(ΔV%) · 허용전류 검증기 (ENG-46/48)
            </h2>
            <p className="mt-0.5 text-[11px] text-slate-500">
              선박/해양플랜트 동력 케이블 전압강하(≤5%) 및 45°C 초과 디레이팅 검증
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2.5 text-xs sm:grid-cols-3">
              <label className="space-y-1">
                <span className="block text-[11px] font-medium text-slate-600">계통 전압 (V)</span>
                <input
                  type="number"
                  value={vdVoltage}
                  onChange={(e) => setVdVoltage(e.target.value)}
                  className="h-8 w-full rounded border border-slate-300 px-2 font-mono"
                />
              </label>
              <label className="space-y-1">
                <span className="block text-[11px] font-medium text-slate-600">상수</span>
                <select
                  value={vdPhases}
                  onChange={(e) => setVdPhases(Number(e.target.value) as 1 | 3)}
                  className="h-8 w-full rounded border border-slate-300 bg-white px-2"
                >
                  <option value={3}>3상 (AC 3Φ)</option>
                  <option value={1}>단상 / DC</option>
                </select>
              </label>
              <label className="space-y-1">
                <span className="block text-[11px] font-medium text-slate-600">부하 용량 (kW)</span>
                <input
                  type="number"
                  value={vdPowerKw}
                  onChange={(e) => setVdPowerKw(e.target.value)}
                  className="h-8 w-full rounded border border-slate-300 px-2 font-mono"
                />
              </label>
              <label className="space-y-1">
                <span className="block text-[11px] font-medium text-slate-600">케이블 긍장 (m)</span>
                <input
                  type="number"
                  value={vdLengthM}
                  onChange={(e) => setVdLengthM(e.target.value)}
                  className="h-8 w-full rounded border border-slate-300 px-2 font-mono"
                />
              </label>
              <label className="space-y-1">
                <span className="block text-[11px] font-medium text-slate-600">도체 단면적 (mm²)</span>
                <input
                  type="number"
                  value={vdAreaMm2}
                  onChange={(e) => setVdAreaMm2(e.target.value)}
                  className="h-8 w-full rounded border border-slate-300 px-2 font-mono"
                />
              </label>
              <label className="space-y-1">
                <span className="block text-[11px] font-medium text-slate-600">정격 허용전류 (A)</span>
                <input
                  type="number"
                  value={vdAmpacity}
                  onChange={(e) => setVdAmpacity(e.target.value)}
                  className="h-8 w-full rounded border border-slate-300 px-2 font-mono"
                />
              </label>
            </div>
            {vdResult && (
              <div
                data-testid="vd-calc-result"
                className={`mt-3 rounded border p-3 text-xs ${
                  vdResult.overallPass
                    ? 'border-emerald-200 bg-emerald-50/70 text-emerald-950'
                    : 'border-red-200 bg-red-50/70 text-red-950'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2 font-mono font-bold tabular-nums">
                  <span>
                    전류 {vdResult.loadCurrentA}A · ΔV {vdResult.voltageDropV}V ({vdResult.voltageDropPct}%)
                  </span>
                  <span>{vdResult.overallPass ? 'PASS (IEC 적합)' : 'FAIL (규격 초과)'}</span>
                </div>
                <div className="mt-1 text-[11px]">{vdResult.notes.join(' · ')}</div>
              </div>
            )}
          </section>

          {/* 2. IEC 60079-11 Intrinsic Safety (Ex ia) Entity Loop Check */}
          <section className="rounded border border-slate-200 bg-white p-4">
            <h2 className="text-sm font-bold text-slate-900">
              IEC 60079-11 본질안전(IS · Ex ia) 루프 파라미터 검증 (ENG-52)
            </h2>
            <p className="mt-0.5 text-[11px] text-slate-500">
              IS 배리어(Uo/Io/Po/Co/Lo) vs 현장 계기(Ui/Ii/Pi/Ci/Li) + 케이블 정전용량/인덕턴스(Cc/Lc) 검증
            </p>
            <div className="mt-3 grid grid-cols-3 gap-2.5 text-xs">
              <label className="space-y-1">
                <span className="block text-[11px] font-medium text-slate-600">배리어 Co (nF)</span>
                <input
                  type="number"
                  value={isCoNf}
                  onChange={(e) => setIsCoNf(e.target.value)}
                  className="h-8 w-full rounded border border-slate-300 px-2 font-mono"
                />
              </label>
              <label className="space-y-1">
                <span className="block text-[11px] font-medium text-slate-600">계기 Ci (nF)</span>
                <input
                  type="number"
                  value={isCiNf}
                  onChange={(e) => setIsCiNf(e.target.value)}
                  className="h-8 w-full rounded border border-slate-300 px-2 font-mono"
                />
              </label>
              <label className="space-y-1">
                <span className="block text-[11px] font-medium text-slate-600">케이블 길이 (m)</span>
                <input
                  type="number"
                  value={isCableLen}
                  onChange={(e) => setIsCableLen(e.target.value)}
                  className="h-8 w-full rounded border border-slate-300 px-2 font-mono"
                />
              </label>
            </div>
            <div
              className={`mt-3 rounded border p-3 text-xs ${
                isLoopResult.compliant
                  ? 'border-emerald-200 bg-emerald-50/70'
                  : 'border-red-200 bg-red-50/70'
              }`}
            >
              <div className="flex items-center justify-between font-semibold">
                <span>
                  케이블 누적 Cc={isLoopResult.totalCcNf}nF · Lc={isLoopResult.totalLcMh}mH
                </span>
                <span className="font-mono">
                  {isLoopResult.compliant ? 'Ex ia PASS' : 'Ex ia FAIL'}
                </span>
              </div>
              <div className="mt-2 space-y-1 font-mono text-[11px]">
                {isLoopResult.checks.map((c) => (
                  <div key={c.formula} className="flex items-center justify-between">
                    <span>
                      {c.formula} ({c.barrierOrLimit} vs {c.fieldTotal})
                    </span>
                    <span className={c.pass ? 'text-emerald-700 font-bold' : 'text-red-700 font-bold'}>
                      {c.pass ? 'OK' : 'FAIL'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* 3. ASME B31.3 Line Grammar & Pressure-Temperature Class Checker */}
          <section className="rounded border border-slate-200 bg-white p-4">
            <h2 className="text-sm font-bold text-slate-900">
              ASME B31.3 배관 라인 문법 · PMS P-T 정격 검증기 (ENG-24/34/35)
            </h2>
            <div className="mt-3 grid grid-cols-1 gap-2.5 text-xs sm:grid-cols-3">
              <label className="space-y-1 sm:col-span-3">
                <span className="block text-[11px] font-medium text-slate-600">배관 Line Number</span>
                <input
                  type="text"
                  value={lineInput}
                  onChange={(e) => setLineInput(e.target.value)}
                  className="h-8 w-full rounded border border-slate-300 px-2.5 font-mono"
                />
              </label>
              <label className="space-y-1">
                <span className="block text-[11px] font-medium text-slate-600">설계 압력 (bar)</span>
                <input
                  type="number"
                  value={designPressBar}
                  onChange={(e) => setDesignPressBar(e.target.value)}
                  className="h-8 w-full rounded border border-slate-300 px-2 font-mono"
                />
              </label>
              <label className="space-y-1">
                <span className="block text-[11px] font-medium text-slate-600">설계 온도 (°C)</span>
                <input
                  type="number"
                  value={designTempC}
                  onChange={(e) => setDesignTempC(e.target.value)}
                  className="h-8 w-full rounded border border-slate-300 px-2 font-mono"
                />
              </label>
              <div className="flex items-end">
                <div className="w-full rounded border border-slate-200 bg-slate-50 px-2.5 py-1.5 font-mono text-[11px]">
                  {lineParsed.valid
                    ? `Class ${lineParsed.pipeSpec} · ${lineParsed.sizeInch}"`
                    : '문법 오류'}
                </div>
              </div>
            </div>
            <div
              className={`mt-3 rounded border p-3 text-xs ${
                b313Check.compliant
                  ? 'border-emerald-200 bg-emerald-50/70 text-emerald-950'
                  : 'border-red-200 bg-red-50/70 text-red-950'
              }`}
            >
              <div className="flex items-center gap-1.5 font-semibold">
                {!b313Check.compliant && <ShieldAlert className="h-3.5 w-3.5 text-red-700" />}
                <span>{b313Check.messages.join(' / ')}</span>
              </div>
            </div>
          </section>

          {/* 4. SI Engineering Unit Normalizer */}
          <section className="rounded border border-slate-200 bg-white p-4">
            <h2 className="text-sm font-bold text-slate-900">
              SI 공학 단위 정규화 변환기 (ENG-25)
            </h2>
            <p className="mt-0.5 text-[11px] text-slate-500">
              압력(bar/kPa/MPa/psi), 온도(°C/°F/K), 관경(DN/NPS), 동력(kW/HP), 케이블 단면적(mm²/AWG)
            </p>
            <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
              <input
                type="number"
                aria-label="변환 입력값"
                value={unitVal}
                onChange={(e) => setUnitVal(e.target.value)}
                className="h-8 rounded border border-slate-300 px-2 font-mono"
              />
              <select
                aria-label="원본 단위"
                value={fromUnit}
                onChange={(e) => setFromUnit(e.target.value as EngineeringUnit)}
                className="h-8 rounded border border-slate-300 bg-white px-2 font-mono"
              >
                {(['bar', 'kPa', 'MPa', 'psi', 'C', 'F', 'K', 'DN', 'NPS', 'kW', 'HP', 'mm2', 'AWG'] as EngineeringUnit[]).map(
                  (u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  )
                )}
              </select>
              <select
                aria-label="변환 목표 단위"
                value={toUnit}
                onChange={(e) => setToUnit(e.target.value as EngineeringUnit)}
                className="h-8 rounded border border-slate-300 bg-white px-2 font-mono"
              >
                {(['bar', 'kPa', 'MPa', 'psi', 'C', 'F', 'K', 'DN', 'NPS', 'kW', 'HP', 'mm2', 'AWG'] as EngineeringUnit[]).map(
                  (u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  )
                )}
              </select>
            </div>
            <div className="mt-3 rounded border border-slate-200 bg-slate-50 p-3 text-xs">
              {unitResult && 'error' in unitResult ? (
                <span className="text-red-700">{unitResult.error}</span>
              ) : unitResult ? (
                <div className="space-y-1">
                  <div className="font-mono text-sm font-bold text-slate-900 tabular-nums">
                    {unitResult.inputValue} {unitResult.fromUnit} = {unitResult.outputValue}{' '}
                    {unitResult.toUnit}
                  </div>
                  <div className="font-mono text-[11px] text-slate-600">
                    SI 정규화: {unitResult.siCanonicalValue} {unitResult.siCanonicalUnit} ·{' '}
                    {unitResult.formulaNote}
                  </div>
                </div>
              ) : (
                <span className="text-slate-500">숫자를 입력하면 자동 환산됩니다.</span>
              )}
            </div>
          </section>
        </div>
      )}

      <ChecklistPdfExportModal
        isOpen={isPdfModalOpen}
        onClose={() => setIsPdfModalOpen(false)}
        allItems={items}
        filteredItems={filteredItems}
        summary={summary}
        verifiedIds={verifiedIds}
        evaluatedLoops={evaluatedLoops}
        ruleViolations={ruleViolations}
        specReport={specReport}
        pinNotes={pinNotes}
        learnedRules={learnedRules}
        isFilteredActive={
          domainFilter !== 'ALL' || statusFilter !== 'ALL' || searchQuery.trim().length > 0
        }
      />
    </div>
  );
};
