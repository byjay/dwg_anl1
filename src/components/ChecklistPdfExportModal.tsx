import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Download,
  FileText,
  Loader2,
  Printer,
  ShieldAlert,
  X,
} from 'lucide-react';
import {
  DrawingPinNote,
  EvaluatedLoopMatch,
  LearnedEngineeringRule,
  RuleViolationHit,
  SpecReviewReport,
} from '../types/diagram';
import {
  MasterChecklistSummary,
  MasterDirectiveItem,
} from '../utils/masterChecklistEngine';
import {
  buildChecklistPdfReportData,
  generateChecklistPdfBlob,
} from '../utils/checklistPdfExporter';

interface ChecklistPdfExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  allItems: MasterDirectiveItem[];
  filteredItems: MasterDirectiveItem[];
  summary: MasterChecklistSummary;
  verifiedIds: Record<number, boolean>;
  evaluatedLoops: EvaluatedLoopMatch[];
  ruleViolations: RuleViolationHit[];
  specReport: SpecReviewReport;
  pinNotes: DrawingPinNote[];
  learnedRules: LearnedEngineeringRule[];
  isFilteredActive: boolean;
}

export const ChecklistPdfExportModal: React.FC<ChecklistPdfExportModalProps> = ({
  isOpen,
  onClose,
  allItems,
  filteredItems,
  summary,
  verifiedIds,
  evaluatedLoops,
  ruleViolations,
  specReport,
  pinNotes,
  learnedRules,
  isFilteredActive,
}) => {
  const [checklistScope, setChecklistScope] = useState<'ALL' | 'FILTERED'>(
    isFilteredActive ? 'FILTERED' : 'ALL'
  );
  const [includeChecklist, setIncludeChecklist] = useState(true);
  const [includeIssues, setIncludeIssues] = useState(true);
  const [includeLearnedRules, setIncludeLearnedRules] = useState(true);
  const [includeResolvedNotes, setIncludeResolvedNotes] = useState(false);

  const [isGenerating, setIsGenerating] = useState(false);
  const [exportNotice, setExportNotice] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const reportData = useMemo(
    () =>
      buildChecklistPdfReportData({
        allItems,
        filteredItems,
        summary,
        verifiedIds,
        evaluatedLoops,
        ruleViolations,
        specReport,
        pinNotes,
        learnedRules,
        options: {
          checklistScope,
          includeChecklist,
          includeIssues,
          includeLearnedRules,
          includeResolvedNotes,
        },
      }),
    [
      allItems,
      filteredItems,
      summary,
      verifiedIds,
      evaluatedLoops,
      ruleViolations,
      specReport,
      pinNotes,
      learnedRules,
      checklistScope,
      includeChecklist,
      includeIssues,
      includeLearnedRules,
      includeResolvedNotes,
    ]
  );

  if (!isOpen) return null;

  const hasAnySection = includeChecklist || includeIssues || includeLearnedRules;

  const handleDownloadPdf = async () => {
    if (!hasAnySection || isGenerating) return;
    setIsGenerating(true);
    setExportNotice(null);
    setExportError(null);
    try {
      const result = await generateChecklistPdfBlob(reportData);
      const url = URL.createObjectURL(result.blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = result.filename;
      a.click();
      URL.revokeObjectURL(url);
      setExportNotice(
        `${result.filename} (A4 가로 총 ${result.pageCount}페이지 · 체크리스트 ${
          includeChecklist ? reportData.checklistRows.length : 0
        }건 · 이슈 ${includeIssues ? reportData.issues.length : 0}건 · 학습규칙 ${
          includeLearnedRules ? reportData.learnedRuleRows.length : 0
        }건) PDF 파일 생성을 완료했습니다.`
      );
    } catch (err) {
      setExportError(
        err instanceof Error ? err.message : 'PDF 문서 생성 중 오류가 발생했습니다.'
      );
    } finally {
      setIsGenerating(false);
    }
  };

  const handleBrowserPrint = () => {
    if (typeof window !== 'undefined') {
      window.print();
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="pdf-export-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 print:static print:inset-auto print:block print:bg-white print:p-0"
    >
      <div className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-md border border-slate-300 bg-white shadow-xl print:max-h-none print:max-w-none print:overflow-visible print:rounded-none print:border-0 print:shadow-none">
        {/* Modal Header & Export Controls (Hidden on Print) */}
        <div className="border-b border-slate-200 bg-slate-50 px-5 py-3.5 print:hidden">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 shrink-0 text-[#0070F2]" />
                <h2
                  id="pdf-export-modal-title"
                  className="text-sm font-bold text-slate-900"
                >
                  인쇄용 PDF 보고서 구성 및 내보내기 (체크리스트 · 검출 이슈 · 학습 규칙)
                </h2>
              </div>
              <p className="mt-0.5 text-[11px] text-slate-600">
                현재 체크리스트 검증 상태, 전 공종 검출 이슈(루프·룰·스펙·핀노트), 학습 규칙을 A4 규격 PDF 파일로 다운로드하거나 브라우저 인쇄합니다.
              </p>
            </div>
            <button
              type="button"
              aria-label="PDF 내보내기 창 닫기"
              onClick={onClose}
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded border border-slate-300 bg-white text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Options & Action Buttons */}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-3 text-xs">
            <div className="flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-1.5 text-slate-700">
                <span className="font-semibold">체크리스트 범위:</span>
                <select
                  aria-label="PDF 체크리스트 포함 범위"
                  value={checklistScope}
                  onChange={(e) =>
                    setChecklistScope(e.target.value as 'ALL' | 'FILTERED')
                  }
                  className="h-7 rounded border border-slate-300 bg-white px-2 text-xs text-slate-800"
                >
                  <option value="ALL">전체 마스터 항목 ({allItems.length}건)</option>
                  <option value="FILTERED">
                    현재 필터 결과 ({filteredItems.length}건)
                  </option>
                </select>
              </label>

              <label className="inline-flex cursor-pointer items-center gap-1.5 font-medium text-slate-800">
                <input
                  type="checkbox"
                  checked={includeChecklist}
                  onChange={(e) => setIncludeChecklist(e.target.checked)}
                  className="h-3.5 w-3.5 accent-[#0070F2]"
                />
                <span>체크리스트 현황 ({reportData.checklistRows.length})</span>
              </label>

              <label className="inline-flex cursor-pointer items-center gap-1.5 font-medium text-slate-800">
                <input
                  type="checkbox"
                  checked={includeIssues}
                  onChange={(e) => setIncludeIssues(e.target.checked)}
                  className="h-3.5 w-3.5 accent-[#0070F2]"
                />
                <span>검출 이슈 ({reportData.issues.length})</span>
              </label>

              <label className="inline-flex cursor-pointer items-center gap-1.5 font-medium text-slate-800">
                <input
                  type="checkbox"
                  checked={includeLearnedRules}
                  onChange={(e) => setIncludeLearnedRules(e.target.checked)}
                  className="h-3.5 w-3.5 accent-[#0070F2]"
                />
                <span>학습 규칙 ({reportData.learnedRuleRows.length})</span>
              </label>

              <label className="inline-flex cursor-pointer items-center gap-1.5 text-slate-600">
                <input
                  type="checkbox"
                  checked={includeResolvedNotes}
                  onChange={(e) => setIncludeResolvedNotes(e.target.checked)}
                  className="h-3.5 w-3.5 accent-[#0070F2]"
                />
                <span>해결된 핀노트 포함</span>
              </label>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                data-testid="browser-print-pdf"
                disabled={!hasAnySection}
                onClick={handleBrowserPrint}
                className="inline-flex h-8 items-center gap-1.5 rounded border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Printer className="h-3.5 w-3.5" />
                <span>브라우저 인쇄</span>
              </button>
              <button
                type="button"
                data-testid="download-print-ready-pdf"
                disabled={!hasAnySection || isGenerating}
                onClick={() => void handleDownloadPdf()}
                className="inline-flex h-8 items-center gap-1.5 rounded bg-[#0070F2] px-3.5 text-xs font-semibold text-white hover:bg-[#005CC8] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>PDF 렌더링 중...</span>
                  </>
                ) : (
                  <>
                    <Download className="h-3.5 w-3.5" />
                    <span>PDF 파일 다운로드 (.pdf)</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {exportNotice && (
            <div
              data-testid="pdf-export-success"
              className="mt-2.5 flex items-center gap-2 rounded border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs text-emerald-900"
            >
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-700" />
              <span>{exportNotice}</span>
            </div>
          )}

          {exportError && (
            <div className="mt-2.5 flex items-center gap-2 rounded border border-red-200 bg-red-50 px-3 py-1.5 text-xs text-red-900">
              <ShieldAlert className="h-3.5 w-3.5 shrink-0 text-red-700" />
              <span>{exportError}</span>
            </div>
          )}

          {!hasAnySection && (
            <div className="mt-2.5 rounded border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-900">
              최소 1개 이상의 포함 섹션(체크리스트 현황, 검출 이슈, 학습 규칙)을 선택하세요.
            </div>
          )}
        </div>

        {/* Formatted Print-Ready Preview Sheet */}
        <div className="flex-1 overflow-y-auto bg-slate-100 p-5 print:overflow-visible print:bg-white print:p-0">
          <article className="checklist-print-sheet mx-auto max-w-[1060px] space-y-6 rounded border border-slate-300 bg-white p-6 shadow-xs print:max-w-none print:rounded-none print:border-0 print:p-0 print:shadow-none">
            {/* Print Banner */}
            <header className="border-b-2 border-[#0070F2] pb-4">
              <div className="flex flex-wrap items-center justify-between gap-2 font-mono text-[11px] text-slate-500">
                <span className="font-semibold text-[#005CC8]">
                  SAP T-CODE ZCL99 · {reportData.documentNo}
                </span>
                <span>
                  {reportData.projectCode} · 생성일시: {reportData.generatedAt}
                </span>
              </div>
              <h3 className="mt-1.5 text-lg font-bold text-slate-900">
                {reportData.documentTitle}
              </h3>
              <p className="mt-0.5 text-xs text-slate-600">{reportData.filterDescription}</p>
            </header>

            {/* Executive KPI Strip */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded border border-slate-200 bg-slate-50 p-3">
                <div className="text-[11px] font-semibold text-slate-500">
                  1. 마스터 체크리스트 현황
                </div>
                <div className="mt-1 font-mono text-base font-bold text-slate-900 tabular-nums">
                  가중 적용률 {reportData.checklistStats.appliedPct}% (완료{' '}
                  {reportData.checklistStats.implementedCount}/
                  {reportData.checklistStats.total})
                </div>
                <div className="mt-1 text-[11px] text-slate-600 tabular-nums">
                  부분 적용 {reportData.checklistStats.partialCount}건 · 로드맵{' '}
                  {reportData.checklistStats.plannedCount}건 · 엔지니어 검증{' '}
                  {reportData.checklistStats.verifiedCount}건
                </div>
              </div>

              <div className="rounded border border-slate-200 bg-slate-50 p-3">
                <div className="text-[11px] font-semibold text-slate-500">
                  2. 검출된 설계 이슈 (Issues)
                </div>
                <div className="mt-1 font-mono text-base font-bold text-slate-900 tabular-nums">
                  총 {reportData.issueStats.total}건 (CRITICAL{' '}
                  {reportData.issueStats.critical})
                </div>
                <div className="mt-1 text-[11px] text-slate-600 tabular-nums">
                  루프 {reportData.issueStats.bySource.loopDiff} · 룰{' '}
                  {reportData.issueStats.bySource.ruleHit} · 스펙{' '}
                  {reportData.issueStats.bySource.specCheck} · 핀노트{' '}
                  {reportData.issueStats.bySource.pinNote}
                </div>
              </div>

              <div className="rounded border border-slate-200 bg-slate-50 p-3">
                <div className="text-[11px] font-semibold text-slate-500">
                  3. 학습된 엔지니어링 규칙 (Rules)
                </div>
                <div className="mt-1 font-mono text-base font-bold text-slate-900 tabular-nums">
                  활성 {reportData.learnedStats.enabledCount} /{' '}
                  {reportData.learnedStats.total}건
                </div>
                <div className="mt-1 text-[11px] text-slate-600 tabular-nums">
                  시스템 {reportData.learnedStats.systemCount}건 · 엔지니어{' '}
                  {reportData.learnedStats.userCount}건 · 누적 적용{' '}
                  {reportData.learnedStats.totalApplications}회
                </div>
              </div>
            </div>

            {/* Domain Breakdown */}
            <section className="space-y-2">
              <h4 className="border-l-4 border-[#103258] pl-2.5 text-sm font-bold text-slate-900">
                9대 엔지니어링 영역별 적용 현황
              </h4>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse border border-slate-200 text-left text-[11px]">
                  <thead>
                    <tr className="bg-slate-100 text-slate-700">
                      <th className="border border-slate-200 px-2.5 py-1.5">영역</th>
                      <th className="border border-slate-200 px-2.5 py-1.5 text-center">전체</th>
                      <th className="border border-slate-200 px-2.5 py-1.5 text-center">적용 완료</th>
                      <th className="border border-slate-200 px-2.5 py-1.5 text-center">부분 적용</th>
                      <th className="border border-slate-200 px-2.5 py-1.5 text-center">로드맵</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reportData.domainRows.map((dom) => (
                      <tr key={dom.domainId}>
                        <td className="border border-slate-200 px-2.5 py-1.5 font-medium text-slate-900">
                          {dom.domainTitle}
                        </td>
                        <td className="border border-slate-200 px-2.5 py-1.5 text-center font-mono">
                          {dom.total}
                        </td>
                        <td className="border border-slate-200 px-2.5 py-1.5 text-center font-mono font-semibold text-emerald-700">
                          {dom.implemented}
                        </td>
                        <td className="border border-slate-200 px-2.5 py-1.5 text-center font-mono text-amber-700">
                          {dom.partial}
                        </td>
                        <td className="border border-slate-200 px-2.5 py-1.5 text-center font-mono text-slate-600">
                          {dom.planned}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Section 1: Checklist Status */}
            {includeChecklist && (
              <section data-testid="pdf-preview-checklist-section" className="space-y-2">
                <h4 className="border-l-4 border-[#0070F2] pl-2.5 text-sm font-bold text-slate-900">
                  Section 1 · 마스터 체크리스트 현황 ({reportData.checklistRows.length}건)
                </h4>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse border border-slate-200 text-left text-[11px]">
                    <thead>
                      <tr className="bg-slate-100 text-slate-700">
                        <th className="border border-slate-200 px-2 py-1.5">코드</th>
                        <th className="border border-slate-200 px-2 py-1.5">영역 / 항목명</th>
                        <th className="border border-slate-200 px-2 py-1.5">표준</th>
                        <th className="border border-slate-200 px-2 py-1.5 text-center">상태</th>
                        <th className="border border-slate-200 px-2 py-1.5 text-center">검증</th>
                        <th className="border border-slate-200 px-2 py-1.5">적용 내역 및 근거</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reportData.checklistRows.map((row) => (
                        <tr key={row.id} className="align-top">
                          <td className="border border-slate-200 px-2 py-1.5 font-mono font-bold whitespace-nowrap text-slate-900">
                            {row.code}
                          </td>
                          <td className="border border-slate-200 px-2 py-1.5">
                            <div className="text-[10px] text-slate-500">{row.domainTitle}</div>
                            <div className="font-semibold text-slate-900">{row.title}</div>
                          </td>
                          <td className="border border-slate-200 px-2 py-1.5 font-mono text-slate-700">
                            {row.standardRef}
                          </td>
                          <td className="border border-slate-200 px-2 py-1.5 text-center font-mono font-semibold whitespace-nowrap">
                            {row.statusLabel}
                          </td>
                          <td className="border border-slate-200 px-2 py-1.5 text-center font-mono whitespace-nowrap">
                            {row.verified ? '✔ 확인' : '-'}
                          </td>
                          <td className="border border-slate-200 px-2 py-1.5 text-slate-700">
                            <div>{row.implementationNote}</div>
                            <div className="font-mono text-[10px] text-slate-500">
                              {row.evidenceModule}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {/* Section 2: Identified Issues */}
            {includeIssues && (
              <section data-testid="pdf-preview-issues-section" className="space-y-2">
                <h4 className="border-l-4 border-red-600 pl-2.5 text-sm font-bold text-slate-900">
                  Section 2 · 검출된 설계 이슈 및 위반 내역 ({reportData.issues.length}건)
                </h4>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse border border-slate-200 text-left text-[11px]">
                    <thead>
                      <tr className="bg-slate-100 text-slate-700">
                        <th className="border border-slate-200 px-2 py-1.5 text-center">No</th>
                        <th className="border border-slate-200 px-2 py-1.5 text-center">심각도</th>
                        <th className="border border-slate-200 px-2 py-1.5">출처 / 위치</th>
                        <th className="border border-slate-200 px-2 py-1.5">대상 태그</th>
                        <th className="border border-slate-200 px-2 py-1.5">이슈 내용 및 근거</th>
                        <th className="border border-slate-200 px-2 py-1.5">권고 조치</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reportData.issues.map((iss) => (
                        <tr key={`${iss.source}-${iss.seq}`} className="align-top">
                          <td className="border border-slate-200 px-2 py-1.5 text-center font-mono">
                            {iss.seq}
                          </td>
                          <td className="border border-slate-200 px-2 py-1.5 text-center font-mono font-bold">
                            <span
                              className={
                                iss.severity === 'CRITICAL'
                                  ? 'text-red-700'
                                  : iss.severity === 'WARNING'
                                    ? 'text-amber-700'
                                    : 'text-sky-700'
                              }
                            >
                              {iss.severity}
                            </span>
                          </td>
                          <td className="border border-slate-200 px-2 py-1.5">
                            <div className="font-semibold text-slate-800">{iss.sourceLabel}</div>
                            <div className="font-mono text-[10px] text-slate-500">
                              {iss.location}
                            </div>
                          </td>
                          <td className="border border-slate-200 px-2 py-1.5 font-mono font-bold text-slate-900">
                            {iss.tagOrTarget}
                          </td>
                          <td className="border border-slate-200 px-2 py-1.5 text-slate-700">
                            <div className="font-semibold text-slate-900">{iss.title}</div>
                            <div>{iss.detail}</div>
                          </td>
                          <td className="border border-slate-200 px-2 py-1.5 text-slate-800">
                            {iss.recommendation}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {/* Section 3: Learned Rules */}
            {includeLearnedRules && (
              <section data-testid="pdf-preview-rules-section" className="space-y-2">
                <h4 className="border-l-4 border-emerald-600 pl-2.5 text-sm font-bold text-slate-900">
                  Section 3 · 학습된 엔지니어링 규칙 ({reportData.learnedRuleRows.length}건)
                </h4>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse border border-slate-200 text-left text-[11px]">
                    <thead>
                      <tr className="bg-slate-100 text-slate-700">
                        <th className="border border-slate-200 px-2 py-1.5">코드</th>
                        <th className="border border-slate-200 px-2 py-1.5 text-center">심각도</th>
                        <th className="border border-slate-200 px-2 py-1.5 text-center">상태 / 출처</th>
                        <th className="border border-slate-200 px-2 py-1.5">규칙명 및 조건</th>
                        <th className="border border-slate-200 px-2 py-1.5">학습 교훈</th>
                        <th className="border border-slate-200 px-2 py-1.5">POS 자동 반영 조항</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reportData.learnedRuleRows.map((rule) => (
                        <tr key={rule.code} className="align-top">
                          <td className="border border-slate-200 px-2 py-1.5 font-mono font-bold whitespace-nowrap text-slate-900">
                            {rule.code}
                          </td>
                          <td className="border border-slate-200 px-2 py-1.5 text-center font-mono font-bold whitespace-nowrap">
                            {rule.severity}
                          </td>
                          <td className="border border-slate-200 px-2 py-1.5 text-center font-mono whitespace-nowrap">
                            <div>{rule.enabled ? '활성' : '비활성'}</div>
                            <div className="text-[10px] text-slate-500">
                              {rule.tCodeOrigin} · {rule.appliedCount}회
                            </div>
                          </td>
                          <td className="border border-slate-200 px-2 py-1.5">
                            <div className="text-[10px] text-slate-500">{rule.categoryLabelKo}</div>
                            <div className="font-semibold text-slate-900">{rule.titleKo}</div>
                            <div className="font-mono text-[10px] text-slate-600">
                              {rule.patternOrCondition}
                            </div>
                          </td>
                          <td className="border border-slate-200 px-2 py-1.5 text-slate-700">
                            {rule.learnedLessonKo}
                          </td>
                          <td className="border border-slate-200 px-2 py-1.5 text-slate-800">
                            {rule.posRequirementClause}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
          </article>
        </div>
      </div>
    </div>
  );
};
