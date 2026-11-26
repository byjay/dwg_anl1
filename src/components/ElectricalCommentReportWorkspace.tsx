import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertOctagon,
  Camera,
  CheckCircle2,
  ClipboardCheck,
  Download,
  ExternalLink,
  FileWarning,
  Filter,
  Loader2,
  Printer,
  Search,
  Table2,
  Wrench,
} from 'lucide-react';
import {
  CrossLayerDiffItem,
  DiscrepancySeverity,
  DrawingContentAnalysisReport,
  DrawingPinNote,
  EvaluatedLoopMatch,
  RuleViolationHit,
} from '../types/diagram';
import {
  buildElectricalCommentPackage,
  ElectricalTargetDiagram,
  EvidencePanelSpec,
  MissingCableActionRow,
  TemplateCommentSheet,
} from '../utils/electricalCommentEngine';
import { renderAllEvidenceSnapshots } from '../utils/pdfSnapshotRenderer';
import { buildTemplateStyleHtmlReport } from '../utils/templateReportHtmlExporter';

interface ElectricalCommentReportWorkspaceProps {
  evaluatedLoops: EvaluatedLoopMatch[];
  crossLayerDiffs: CrossLayerDiffItem[];
  ruleViolations: RuleViolationHit[];
  pinNotes: DrawingPinNote[];
  analysisReport?: DrawingContentAnalysisReport | null;
  onJumpToDrawingPage: (
    drawingId: string,
    pageNum: number,
    opts?: {
      tagRef: string;
      content: string;
      severity: DiscrepancySeverity;
      searchTerms?: string[];
      autoInsert?: boolean;
    }
  ) => void;
}

const DIAGRAM_FILTER_OPTIONS: Array<{
  id: 'ALL' | ElectricalTargetDiagram;
  label: string;
}> = [
  { id: 'ALL', label: '전체 도면' },
  { id: 'H042-CI-000-DIA-0001', label: 'DIA-0001 (iCAMS)' },
  { id: 'H042-CI-000-DIA-0002', label: 'DIA-0002 (PSDS)' },
  { id: 'H042-EL-000-DIA-0001', label: 'EL-000-DIA (Power)' },
  { id: 'H042-EL-100-GAR-0001', label: 'EL-100-GAR (배치도)' },
  { id: 'H042-PR-300-PID-0001', label: 'PR-300-PID (모듈 300)' },
  { id: 'H042-COMMON', label: '총괄 · 재요청' },
];

export const ElectricalCommentReportWorkspace: React.FC<
  ElectricalCommentReportWorkspaceProps
> = ({
  evaluatedLoops,
  crossLayerDiffs,
  ruleViolations,
  pinNotes,
  analysisReport,
  onJumpToDrawingPage,
}) => {
  const [selectedDiagram, setSelectedDiagram] = useState<'ALL' | ElectricalTargetDiagram>(
    'ALL'
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [showInlineTables, setShowInlineTables] = useState(false);
  const [snapshots, setSnapshots] = useState<Record<string, string>>({});
  const [isCapturing, setIsCapturing] = useState(false);
  const [captureProgress, setCaptureProgress] = useState<{
    completed: number;
    total: number;
  }>({ completed: 0, total: 0 });
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const attemptedCaptureIdsRef = useRef<Set<string>>(new Set());

  const reportPkg = useMemo(
    () =>
      buildElectricalCommentPackage({
        evaluatedLoops,
        crossLayerDiffs,
        ruleViolations,
        pinNotes,
        analysisReport,
      }),
    [evaluatedLoops, crossLayerDiffs, ruleViolations, pinNotes, analysisReport]
  );

  const allEvidencePanels = useMemo(() => {
    const panels: EvidencePanelSpec[] = [];
    const seen = new Set<string>();
    for (const sheet of reportPkg.commentSheets) {
      for (const panel of sheet.evidencePanels) {
        if (seen.has(panel.id)) continue;
        seen.add(panel.id);
        panels.push(panel);
      }
    }
    return panels;
  }, [reportPkg]);

  const runSnapshotCapture = useCallback(
    async (panels: EvidencePanelSpec[]): Promise<Record<string, string>> => {
      if (panels.length === 0) return {};
      setIsCapturing(true);
      setCaptureProgress({ completed: 0, total: panels.length });
      try {
        const rendered = await renderAllEvidenceSnapshots(
          panels,
          (completed, total, panelId, dataUrl) => {
            setCaptureProgress({ completed, total });
            if (dataUrl) {
              setSnapshots((prev) =>
                prev[panelId] === dataUrl ? prev : { ...prev, [panelId]: dataUrl }
              );
            }
          }
        );
        setSnapshots((prev) => ({ ...prev, ...rendered }));
        return rendered;
      } finally {
        setIsCapturing(false);
      }
    },
    []
  );

  // Auto-capture real cropped PDF evidence snapshots on mount or when new evidence panels appear
  useEffect(() => {
    const missingPanels = allEvidencePanels.filter(
      (p) => !snapshots[p.id] && !attemptedCaptureIdsRef.current.has(p.id)
    );
    if (missingPanels.length === 0 || isCapturing) return;
    missingPanels.forEach((p) => attemptedCaptureIdsRef.current.add(p.id));
    void runSnapshotCapture(missingPanels);
  }, [allEvidencePanels, snapshots, isCapturing, runSnapshotCapture]);

  const handleRegenerateSnapshots = () => {
    attemptedCaptureIdsRef.current.clear();
    allEvidencePanels.forEach((p) => attemptedCaptureIdsRef.current.add(p.id));
    setSnapshots({});
    void runSnapshotCapture(allEvidencePanels);
  };

  const handleExportTemplateHtml = async () => {
    let activeSnapshots = { ...snapshots };
    const missingPanels = allEvidencePanels.filter((p) => !activeSnapshots[p.id]);
    if (missingPanels.length > 0) {
      const rendered = await runSnapshotCapture(missingPanels);
      activeSnapshots = { ...activeSnapshots, ...rendered };
    }
    const html = buildTemplateStyleHtmlReport(reportPkg, activeSnapshots);
    const stamp = new Date().toISOString().slice(0, 10);
    const filename = `H042_Electrical_Comment_Report_${stamp}.html`;
    const blob = new Blob([html], { type: 'text/html;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
    setExportMessage(
      `첨부 PDF 양식 HTML 보고서(${reportPkg.commentSheets.length}개 슬라이드 · 도면 근거 이미지 ${Object.keys(activeSnapshots).length}장 포함)를 ${filename} 파일로 생성했습니다.`
    );
  };

  const handlePrintPdf = () => {
    if (typeof window !== 'undefined') {
      window.print();
    }
  };

  const normalizedQuery = searchQuery.trim().toLowerCase();

  const filteredMissingRows = useMemo(() => {
    return reportPkg.missingCableRows.filter((row) => {
      if (selectedDiagram !== 'ALL' && row.targetDiagram !== selectedDiagram) {
        return false;
      }
      if (!normalizedQuery) return true;
      const haystack = `${row.unitCode} ${row.tag} ${row.serviceName} ${row.issueTypeLabelKo} ${row.currentCableState} ${row.targetDiagram} ${row.evidenceRef} ${row.requiredAction}`.toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [reportPkg.missingCableRows, selectedDiagram, normalizedQuery]);

  const filteredCommentSheets = useMemo(() => {
    return reportPkg.commentSheets.filter((sheet) => {
      if (selectedDiagram !== 'ALL' && sheet.targetDiagram !== selectedDiagram) {
        return false;
      }
      if (!normalizedQuery) return true;
      const haystack = `${sheet.title} ${sheet.drawingSubtitle} ${sheet.targetDiagram} ${sheet.queries.join(' ')} ${sheet.electricalComments.join(' ')} ${sheet.missingCables.map((m) => `${m.tag} ${m.currentState}`).join(' ')}`.toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [reportPkg.commentSheets, selectedDiagram, normalizedQuery]);

  const handleJumpMissingRow = (row: MissingCableActionRow) => {
    onJumpToDrawingPage(row.drawingId, row.pageNum, {
      tagRef: row.tag,
      content: `${row.issueTypeLabelKo} — ${row.requiredAction}`,
      severity: row.severity,
      searchTerms: [row.tag.split('/')[0].trim()],
      autoInsert: true,
    });
  };

  const handleJumpPanel = (panel: EvidencePanelSpec, sheet: TemplateCommentSheet) => {
    onJumpToDrawingPage(panel.drawingId, panel.pageNum, {
      tagRef: sheet.missingCables[0]?.tag || panel.sheetLabel,
      content: sheet.electricalComments[0] || sheet.title,
      severity: sheet.severity,
      searchTerms: sheet.missingCables.map((m) => m.tag.split('/')[0].trim()),
      autoInsert: true,
    });
  };

  const capturedCount = allEvidencePanels.filter((p) => Boolean(snapshots[p.id])).length;

  return (
    <div className="space-y-5">
      {/* Primary Action Header & KPI Summary */}
      <section className="rounded border border-slate-200 bg-white p-5 print:hidden">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span className="font-mono font-semibold text-[#005CC8]">SAP T-Code QM02</span>
              <span aria-hidden="true">·</span>
              <span>H042 전기 생산 설계관련 요청건 (Rev1) 첨부 PDF 보고서 양식</span>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">
                도면 근거 캡처 {capturedCount}/{allEvidencePanels.length}장
              </span>
            </div>
            <h1 className="mt-1 text-lg font-bold tracking-tight text-slate-900">
              첨부 PDF 보고서 양식 문제점 정리 및 전기 Diagram 코멘트 ({reportPkg.commentSheets.length}슬라이드)
            </h1>
            <p className="mt-0.5 text-xs text-slate-600">
              제공해주신 H042 요청건 PDF 양식(상단 남색 바 · 청록 구분선 · 도면 근거 캡처 · 적색 질의/요청 박스) 그대로 1~16번 기존/신규 전 항목, 모듈 300(PR-300-PID), Mark B/C/D 및 추가 요청사항을 정리했습니다.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleRegenerateSnapshots}
              disabled={isCapturing}
              className="inline-flex h-9 items-center gap-1.5 rounded border border-slate-300 bg-white px-3 text-xs font-medium whitespace-nowrap text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              {isCapturing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-sky-700" />
              ) : (
                <Camera className="h-3.5 w-3.5 text-slate-600" />
              )}
              <span>
                {isCapturing
                  ? `도면 캡처 중 (${captureProgress.completed}/${captureProgress.total})`
                  : '도면 그림 다시 캡처'}
              </span>
            </button>

            <button
              type="button"
              onClick={handlePrintPdf}
              className="inline-flex h-9 items-center gap-1.5 rounded border border-slate-300 bg-white px-3 text-xs font-medium whitespace-nowrap text-slate-700 hover:bg-slate-50"
            >
              <Printer className="h-3.5 w-3.5 text-slate-600" />
              <span>PDF 보고서 인쇄 / 저장</span>
            </button>

            <button
              type="button"
              onClick={() => void handleExportTemplateHtml()}
              disabled={isCapturing}
              className="inline-flex h-9 items-center gap-1.5 rounded bg-[#103258] px-4 text-xs font-semibold whitespace-nowrap text-white hover:bg-[#0b2542] disabled:opacity-60"
            >
              <Download className="h-3.5 w-3.5" />
              <span>첨부양식 HTML 보고서 내보내기</span>
            </button>
          </div>
        </div>

        {exportMessage && (
          <div className="mt-3 flex items-center gap-2 rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-700" />
            <span>{exportMessage}</span>
          </div>
        )}

        {/* KPI Cards */}
        <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="rounded border border-slate-200 bg-slate-50/70 px-4 py-3">
            <div className="flex items-center justify-between text-[11px] font-medium text-slate-600">
              <span>첨부양식 보고서 슬라이드</span>
              <ClipboardCheck className="h-3.5 w-3.5 text-[#006B8F]" />
            </div>
            <div className="mt-1 flex items-baseline justify-between gap-2">
              <span className="font-mono text-2xl font-bold text-[#103258] tabular-nums">
                {reportPkg.summaryCounts.totalCommentSheets}장
              </span>
              <span className="text-[11px] text-slate-500 tabular-nums">
                Critical {reportPkg.summaryCounts.criticalSheets}건 포함
              </span>
            </div>
          </div>

          <div className="rounded border border-slate-200 bg-slate-50/70 px-4 py-3">
            <div className="flex items-center justify-between text-[11px] font-medium text-slate-600">
              <span>케이블 누락·HOLD·미할당</span>
              <FileWarning className="h-3.5 w-3.5 text-red-700" />
            </div>
            <div className="mt-1 flex items-baseline justify-between gap-2">
              <span className="font-mono text-2xl font-bold text-red-700 tabular-nums">
                {reportPkg.summaryCounts.totalMissingOrHoldCables}건
              </span>
              <span className="text-[11px] text-slate-500 tabular-nums">
                누락 {reportPkg.summaryCounts.cableMissingMarkB} · HOLD/C{' '}
                {reportPkg.summaryCounts.unassignedOrHoldCount}
              </span>
            </div>
          </div>

          <div className="rounded border border-slate-200 bg-slate-50/70 px-4 py-3">
            <div className="flex items-center justify-between text-[11px] font-medium text-slate-600">
              <span>태그·블록도 오기 / W/D 누락</span>
              <AlertOctagon className="h-3.5 w-3.5 text-amber-700" />
            </div>
            <div className="mt-1 flex items-baseline justify-between gap-2">
              <span className="font-mono text-2xl font-bold text-slate-900 tabular-nums">
                {reportPkg.summaryCounts.tagOrBlockErrorCount +
                  reportPkg.summaryCounts.wdMissingCount}
                건
              </span>
              <span className="text-[11px] text-slate-500 tabular-nums">
                오기 {reportPkg.summaryCounts.tagOrBlockErrorCount} · W/D누락{' '}
                {reportPkg.summaryCounts.wdMissingCount}
              </span>
            </div>
          </div>

          <div className="rounded border border-slate-200 bg-slate-50/70 px-4 py-3">
            <div className="flex items-center justify-between text-[11px] font-medium text-slate-600">
              <span>P&ID 단독(전장 미수록)</span>
              <Wrench className="h-3.5 w-3.5 text-slate-600" />
            </div>
            <div className="mt-1 flex items-baseline justify-between gap-2">
              <span className="font-mono text-2xl font-bold text-slate-900 tabular-nums">
                {reportPkg.summaryCounts.pidOnlyCount}건
              </span>
              <span className="text-[11px] text-slate-500">Mark D 패키지 확인</span>
            </div>
          </div>
        </div>
      </section>

      {/* Section A: Attached-Template Slide Deck (Primary Focus — Matches User PDF 1:1) */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded border border-slate-200 bg-white px-5 py-3.5 print:hidden">
          <div>
            <h2 className="text-sm font-bold text-slate-900">
              1. 첨부 PDF 보고서 양식 슬라이드 ({filteredCommentSheets.length} / {reportPkg.commentSheets.length} 슬라이드)
            </h2>
            <p className="text-[11px] text-slate-500">
              도면 필터 또는 검색어로 특정 도면의 문제점 슬라이드만 모아보거나 인쇄/HTML로 내보낼 수 있습니다.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-56">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                aria-label="문제점 보고서 검색"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="RL0113, EDJB, LCV-002 검색..."
                className="h-8 w-full rounded border border-slate-300 bg-white pr-3 pl-8 text-xs text-slate-900 placeholder:text-slate-400 focus:border-sky-600 focus:outline-none"
              />
            </div>

            <button
              type="button"
              onClick={() => setShowInlineTables((v) => !v)}
              className={`inline-flex h-8 items-center gap-1.5 rounded border px-2.5 text-[11px] font-medium whitespace-nowrap transition-colors ${
                showInlineTables
                  ? 'border-[#103258] bg-[#103258] text-white'
                  : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              <Table2 className="h-3.5 w-3.5" />
              <span>태그 대조표 함께 보기</span>
            </button>

            <div className="flex flex-wrap items-center gap-1 rounded border border-slate-200 bg-slate-100 p-0.5">
              <Filter className="mx-1.5 h-3 w-3 text-slate-500" />
              {DIAGRAM_FILTER_OPTIONS.map((opt) => {
                const active = selectedDiagram === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setSelectedDiagram(opt.id)}
                    className={`rounded px-2 py-1 text-[11px] font-medium whitespace-nowrap transition-colors ${
                      active
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {filteredCommentSheets.map((sheet) => {
          const isChecklist = sheet.slideKind === 'CHECKLIST';
          return (
            <article
              key={sheet.id}
              data-testid={`template-slide-${sheet.sheetNo}`}
              className="report-slide-page overflow-hidden rounded border border-slate-300 bg-white shadow-xs print:rounded-none print:border-0 print:shadow-none"
            >
              {/* Attached Template Top Dark Navy Bar */}
              <div className="h-2.5 w-full bg-[#103258]" />

              <div className="space-y-3 px-6 py-5">
                {/* Slide Title & Plain Right-Corner Label (Matches PDF Template) */}
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                  <h3 className="text-[19px] font-extrabold tracking-tight text-[#103258]">
                    {sheet.title}
                  </h3>
                  <span className="text-xs font-bold whitespace-nowrap text-slate-600">
                    {sheet.badgeLabel}
                  </span>
                </div>

                {/* Teal Divider Bar */}
                <div className="h-[3px] w-full bg-[#006B8F]" />

                {/* Evidence Drawing Subtitle */}
                <div className="text-xs font-bold text-[#8B1E24]">
                  {sheet.drawingSubtitle}
                </div>

                {/* Cropped Real PDF Evidence Images */}
                {sheet.evidencePanels.length > 0 && (
                  <div
                    className={`grid gap-3 ${
                      sheet.evidencePanels.length <= 1
                        ? 'grid-cols-1'
                        : 'grid-cols-1 lg:grid-cols-2'
                    }`}
                  >
                    {sheet.evidencePanels.map((panel) => {
                      const dataUrl = snapshots[panel.id];
                      return (
                        <figure
                          key={panel.id}
                          className="flex flex-col overflow-hidden rounded border border-slate-300 bg-white"
                        >
                          <div className="flex items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-3 py-1 text-[11px] print:hidden">
                            <div className="flex items-center gap-2 font-mono">
                              <span className="font-bold text-[#103258]">
                                {panel.drawingNo}
                              </span>
                              <span className="text-sky-700">
                                PDF p.{panel.pageNum} · {panel.sheetLabel}
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleJumpPanel(panel, sheet)}
                              className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-700 hover:border-sky-600 hover:text-sky-800"
                            >
                              <ExternalLink className="h-3 w-3" />
                              <span>근거 PDF 열기</span>
                            </button>
                          </div>

                          <div className="flex min-h-[210px] items-center justify-center bg-white p-1.5">
                            {dataUrl ? (
                              <img
                                src={dataUrl}
                                alt={panel.caption}
                                className="max-h-[340px] w-auto object-contain"
                              />
                            ) : (
                              <div className="flex flex-col items-center gap-1.5 py-10 text-center text-xs text-slate-500">
                                <Loader2 className="h-5 w-5 animate-spin text-[#006B8F]" />
                                <span className="font-medium text-slate-700">
                                  {panel.drawingNo} p.{panel.pageNum} 도면 근거 이미지 렌더링 중...
                                </span>
                              </div>
                            )}
                          </div>

                          <figcaption className="border-t border-slate-200 bg-slate-50 px-3 py-1 text-[11px] text-slate-600">
                            {panel.caption}
                          </figcaption>
                        </figure>
                      );
                    })}
                  </div>
                )}

                {/* Optional Inline Cable/Tag Comparison Table */}
                {showInlineTables && sheet.missingCables.length > 0 && (
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse border border-slate-300 text-left text-[11.5px]">
                      <thead>
                        <tr className="bg-slate-100 font-bold text-slate-800">
                          <th className="border border-slate-300 px-2.5 py-1.5">
                            누락·문제 태그
                          </th>
                          <th className="border border-slate-300 px-2.5 py-1.5">
                            현재 도면·케이블 상태
                          </th>
                          <th className="border border-slate-300 px-2.5 py-1.5">
                            케이블·도면 수정 요구사항
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {sheet.missingCables.map((mc, idx) => (
                          <tr key={idx}>
                            <td className="border border-slate-300 px-2.5 py-1.5 font-mono font-semibold text-slate-900">
                              {mc.tag}
                            </td>
                            <td className="border border-slate-300 px-2.5 py-1.5 text-slate-700">
                              {mc.currentState}
                            </td>
                            <td className="border border-slate-300 px-2.5 py-1.5 text-slate-900">
                              {mc.requiredCableSpec}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Attached Template Red Query Box (질의 / 요청) or Teal Checklist Box */}
                <div
                  className={
                    isChecklist
                      ? 'border-l-[4px] border-[#006B8F] bg-[#F1F5F9] px-5 py-4'
                      : 'border-l-[4px] border-[#9E1B24] bg-[#FDF2F2] px-4 py-3'
                  }
                >
                  <h4
                    className={`text-[13px] font-extrabold ${
                      isChecklist ? 'text-[#103258]' : 'text-[#9E1B24]'
                    }`}
                  >
                    {isChecklist ? '추가 요청사항 (재요청 · 총괄)' : '질의 / 요청'}
                  </h4>
                  <ul className="mt-1.5 list-disc space-y-1 pl-5 text-xs leading-relaxed text-slate-900">
                    {sheet.queries.map((q, idx) => {
                      const isArrow = q.trim().startsWith('->') || q.trim().startsWith('→');
                      return (
                        <li
                          key={idx}
                          className={isArrow ? 'font-bold text-[#9E1B24]' : ''}
                        >
                          {q}
                        </li>
                      );
                    })}
                  </ul>
                </div>

                {/* Compact Electrical Diagram Comment Action Strip */}
                <div className="border-l-[4px] border-[#006B8F] bg-slate-50 px-4 py-2">
                  <div className="text-[11.5px] font-extrabold text-[#005573]">
                    전기 Diagram 코멘트 조치사항 ({sheet.targetDiagram})
                  </div>
                  <ul className="mt-0.5 list-disc space-y-0.5 pl-4 text-[11.5px] leading-relaxed text-slate-800">
                    {sheet.electricalComments.map((c, idx) => (
                      <li key={idx}>{c}</li>
                    ))}
                  </ul>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-2 text-[11px] text-slate-500">
                  <span>
                    코멘트 대상: {sheet.targetDiagram} · 근거:{' '}
                    {sheet.evidencePanels
                      .map((p) => `${p.drawingNo} p.${p.pageNum}`)
                      .join(' / ') || '전 도면 공통'}
                  </span>
                  <span className="font-mono tabular-nums">
                    Slide {sheet.sheetNo} / {reportPkg.commentSheets.length}
                  </span>
                </div>
              </div>
            </article>
          );
        })}
      </section>

      {/* Section B: Diagram Summary Cards (Hidden on PDF Print so slides print clean) */}
      <section className="rounded border border-slate-200 bg-white p-5 print:hidden">
        <div className="border-b border-slate-200 pb-3">
          <h2 className="text-sm font-bold text-slate-900">
            2. 전기 Diagram별 코멘트 배분 요약
          </h2>
          <p className="text-[11px] text-slate-500">
            카드를 클릭하면 위 첨부양식 슬라이드와 아래 케이블 누락 목록이 해당 도면 기준으로 필터링됩니다.
          </p>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {reportPkg.diagramGroups.map((group) => {
            const isSelected = selectedDiagram === group.diagramNo;
            return (
              <button
                key={group.diagramNo}
                type="button"
                onClick={() =>
                  setSelectedDiagram((prev) =>
                    prev === group.diagramNo ? 'ALL' : group.diagramNo
                  )
                }
                className={`flex flex-col items-start rounded border p-3.5 text-left transition-colors ${
                  isSelected
                    ? 'border-[#103258] bg-sky-50/40'
                    : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/50'
                }`}
              >
                <div className="flex w-full items-center justify-between gap-2">
                  <span className="font-mono text-xs font-bold text-[#103258]">
                    {group.diagramNo}
                  </span>
                  <span className="text-[11px] font-semibold text-red-700 tabular-nums">
                    Critical {group.criticalCount} · 시트{' '}
                    {group.sheetNos.length > 0
                      ? group.sheetNos.map((n) => `#${n}`).join(',')
                      : '-'}
                  </span>
                </div>
                <div className="mt-0.5 text-xs font-semibold text-slate-900">
                  {group.diagramTitleKo}
                </div>
                <ul className="mt-2 list-disc space-y-1 pl-4 text-[11px] leading-relaxed text-slate-600">
                  {group.keyComments.slice(0, 2).map((c, idx) => (
                    <li key={idx} className="line-clamp-2">
                      {c}
                    </li>
                  ))}
                </ul>
              </button>
            );
          })}
        </div>
      </section>

      {/* Section C: Missing Cables & Issues Master Audit Table (Hidden on PDF Print) */}
      <section className="rounded border border-slate-200 bg-white print:hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-5 py-3">
          <div>
            <h2 className="text-sm font-bold text-slate-900">
              3. 전체 도면 문제점·케이블 누락 마스터 목록 ({filteredMissingRows.length}건)
            </h2>
            <p className="text-[11px] text-slate-500">
              요청서 p.1~18 항목 + Mark B/C/D + Module 300 HOLD + W/D 누락 일괄 목록
            </p>
          </div>
          <span className="font-mono text-xs font-semibold text-slate-600 tabular-nums">
            {filteredMissingRows.length}건 표시
          </span>
        </div>

        {filteredMissingRows.length === 0 ? (
          <div className="px-5 py-10 text-center text-xs text-slate-500">
            선택된 도면/검색 조건에 해당하는 항목이 없습니다.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-700">
                  <th className="px-3.5 py-2.5 whitespace-nowrap">유닛</th>
                  <th className="px-3.5 py-2.5 whitespace-nowrap">태그 / 대상</th>
                  <th className="px-3.5 py-2.5 whitespace-nowrap">문제 유형</th>
                  <th className="px-3.5 py-2.5">현재 도면·케이블 상태</th>
                  <th className="px-3.5 py-2.5 whitespace-nowrap">코멘트 대상 도면</th>
                  <th className="px-3.5 py-2.5">전기 Diagram 조치사항</th>
                  <th className="px-3.5 py-2.5 text-right whitespace-nowrap">근거 페이지</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredMissingRows.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50/70">
                    <td className="px-3.5 py-2.5 font-mono text-[11px] font-semibold text-slate-700 tabular-nums">
                      {row.unitCode}
                    </td>
                    <td className="px-3.5 py-2.5">
                      <div className="font-mono font-semibold text-slate-900">
                        {row.tag}
                      </div>
                      <div className="max-w-[210px] truncate text-[11px] text-slate-500">
                        {row.serviceName}
                      </div>
                    </td>
                    <td className="px-3.5 py-2.5 whitespace-nowrap">
                      <span
                        className={`text-[11px] font-semibold ${
                          row.severity === 'CRITICAL' ? 'text-red-700' : 'text-amber-700'
                        }`}
                      >
                        {row.severity} · {row.issueTypeLabelKo}
                      </span>
                    </td>
                    <td className="max-w-[260px] px-3.5 py-2.5 text-[11px] text-slate-700">
                      {row.currentCableState}
                    </td>
                    <td className="px-3.5 py-2.5 font-mono text-[11px] font-medium whitespace-nowrap text-[#103258]">
                      {row.targetDiagram}
                    </td>
                    <td className="max-w-[300px] px-3.5 py-2.5 text-[11px] text-slate-800">
                      {row.requiredAction}
                    </td>
                    <td className="px-3.5 py-2.5 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => handleJumpMissingRow(row)}
                        className="inline-flex h-7 items-center gap-1 rounded border border-slate-300 bg-white px-2.5 text-[11px] font-medium text-slate-700 hover:border-sky-600 hover:bg-sky-50 hover:text-sky-800"
                      >
                        <ExternalLink className="h-3 w-3" />
                        <span>{row.evidenceRef}</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};
