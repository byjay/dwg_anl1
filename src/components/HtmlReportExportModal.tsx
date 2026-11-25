import React, { useMemo, useState } from 'react';
import { CheckSquare, Download, FileCode2, Files, Square, X } from 'lucide-react';
import {
  CrossLayerDiffItem,
  DrawingContentAnalysisReport,
  DrawingPinNote,
  EvaluatedLoopMatch,
  ParallelBatchSummary,
  RuleViolationHit,
} from '../types/diagram';
import { buildDiscrepancySeveritySummary } from '../utils/severitySummary';
import {
  buildHtmlReportDocument,
  buildPerSectionHtmlReports,
  getSectionItemCount,
  HTML_REPORT_SECTIONS,
  HtmlReportSectionId,
} from '../utils/htmlReportExporter';

interface HtmlReportExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  summary: ParallelBatchSummary;
  loops: EvaluatedLoopMatch[];
  diffs: CrossLayerDiffItem[];
  ruleViolations: RuleViolationHit[];
  pinNotes: DrawingPinNote[];
  analysisReport?: DrawingContentAnalysisReport | null;
}

function triggerHtmlDownload(filename: string, htmlContent: string) {
  const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export const HtmlReportExportModal: React.FC<HtmlReportExportModalProps> = ({
  isOpen,
  onClose,
  summary,
  loops,
  diffs,
  ruleViolations,
  pinNotes,
  analysisReport,
}) => {
  const [selectedSections, setSelectedSections] = useState<HtmlReportSectionId[]>(() =>
    HTML_REPORT_SECTIONS.map((s) => s.id)
  );
  const [lastExportMessage, setLastExportMessage] = useState<string | null>(null);

  const severitySummary = useMemo(
    () => buildDiscrepancySeveritySummary(loops),
    [loops]
  );

  const baseInput = useMemo(
    () => ({
      projectCode: 'H042',
      summary,
      loops,
      severitySummary,
      diffs,
      ruleViolations,
      pinNotes,
      analysisReport,
    }),
    [summary, loops, severitySummary, diffs, ruleViolations, pinNotes, analysisReport]
  );

  if (!isOpen) return null;

  const toggleSection = (id: HtmlReportSectionId) => {
    setSelectedSections((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    setSelectedSections(HTML_REPORT_SECTIONS.map((s) => s.id));
  };

  const handleClearAll = () => {
    setSelectedSections([]);
  };

  const handleDownloadCombinedHtml = () => {
    if (selectedSections.length === 0) return;
    const nowStamp = new Date().toISOString().slice(0, 10);
    const html = buildHtmlReportDocument({
      ...baseInput,
      selectedSections,
    });
    const filename = `H042_Full_Verification_Report_${nowStamp}.html`;
    triggerHtmlDownload(filename, html);
    setLastExportMessage(
      `통합 HTML 보고서(${selectedSections.length}개 항목)를 ${filename} 파일로 내보냈습니다.`
    );
  };

  const handleDownloadSplitPerSection = () => {
    if (selectedSections.length === 0) return;
    const files = buildPerSectionHtmlReports({
      ...baseInput,
      selectedSections,
    });
    files.forEach((file, idx) => {
      setTimeout(() => {
        triggerHtmlDownload(file.filename, file.html);
      }, idx * 120);
    });
    setLastExportMessage(
      `선택된 ${files.length}개 항목을 항목별 개별 HTML 파일로 순차 내보내기 완료했습니다.`
    );
  };

  const handleDownloadSingleSection = (sectionId: HtmlReportSectionId) => {
    const [single] = buildPerSectionHtmlReports({
      ...baseInput,
      selectedSections: [sectionId],
    });
    if (!single) return;
    triggerHtmlDownload(single.filename, single.html);
    setLastExportMessage(`개별 항목 보고서(${single.filename})를 다운로드했습니다.`);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="html-export-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
    >
      <div className="w-full max-w-2xl rounded border border-slate-200 bg-white shadow-lg">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
          <div className="flex items-center gap-2">
            <FileCode2 className="h-4 w-4 text-sky-700" />
            <h2
              id="html-export-modal-title"
              className="text-sm font-semibold text-slate-900"
            >
              전체 검증 보고서 HTML 항목별 내보내기
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="HTML 내보내기 모달 닫기"
            className="inline-flex h-7 w-7 items-center justify-center rounded text-slate-500 hover:bg-slate-100 hover:text-slate-900"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Selection Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-5 py-2.5 text-xs">
          <span className="text-slate-600 tabular-nums">
            포함할 항목 선택 ({selectedSections.length} / {HTML_REPORT_SECTIONS.length})
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSelectAll}
              className="inline-flex h-7 items-center gap-1 rounded border border-slate-300 bg-white px-2.5 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
            >
              <CheckSquare className="h-3 w-3" />
              <span>전체 선택</span>
            </button>
            <button
              type="button"
              onClick={handleClearAll}
              className="inline-flex h-7 items-center gap-1 rounded border border-slate-300 bg-white px-2.5 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
            >
              <Square className="h-3 w-3" />
              <span>선택 해제</span>
            </button>
          </div>
        </div>

        {/* Section Items Checklist */}
        <div className="max-h-[380px] divide-y divide-slate-200 overflow-y-auto px-5 py-1">
          {HTML_REPORT_SECTIONS.map((sec) => {
            const isChecked = selectedSections.includes(sec.id);
            const itemCount = getSectionItemCount(sec.id, baseInput);
            return (
              <div
                key={sec.id}
                className="flex items-center justify-between gap-3 py-2.5"
              >
                <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-2.5">
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => toggleSection(sec.id)}
                    className="mt-0.5 h-4 w-4 rounded border-slate-300 text-sky-700 focus:ring-sky-600"
                  />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-900">
                      <span>{sec.titleKo}</span>
                      <span className="font-mono text-[11px] font-normal text-slate-500 tabular-nums">
                        · {itemCount}건
                      </span>
                    </div>
                    <p className="mt-0.5 text-[11px] text-slate-500">
                      {sec.descriptionKo}
                    </p>
                  </div>
                </label>

                <button
                  type="button"
                  onClick={() => handleDownloadSingleSection(sec.id)}
                  aria-label={`${sec.titleKo} 개별 HTML 다운로드`}
                  className="inline-flex h-7 shrink-0 items-center gap-1 whitespace-nowrap rounded border border-slate-300 bg-white px-2.5 text-[11px] font-medium text-slate-700 hover:border-sky-600 hover:bg-sky-50 hover:text-sky-800"
                >
                  <Download className="h-3 w-3" />
                  <span>개별 HTML</span>
                </button>
              </div>
            );
          })}
        </div>

        {lastExportMessage && (
          <div className="border-t border-emerald-200 bg-emerald-50 px-5 py-2 text-xs text-emerald-800">
            {lastExportMessage}
          </div>
        )}

        {/* Footer Actions */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 items-center rounded border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-100"
          >
            닫기
          </button>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={selectedSections.length === 0}
              onClick={handleDownloadSplitPerSection}
              className="inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded border border-slate-300 bg-white px-3 text-xs font-medium text-slate-800 hover:bg-slate-100 disabled:opacity-50"
            >
              <Files className="h-3.5 w-3.5" />
              <span>항목별 개별 HTML 일괄 내보내기</span>
            </button>
            <button
              type="button"
              disabled={selectedSections.length === 0}
              onClick={handleDownloadCombinedHtml}
              className="inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded bg-sky-700 px-3.5 text-xs font-semibold text-white hover:bg-sky-800 disabled:opacity-50"
            >
              <Download className="h-3.5 w-3.5" />
              <span>선택 항목 통합 HTML 내보내기 ({selectedSections.length})</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
