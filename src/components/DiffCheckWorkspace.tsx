import React, { useMemo, useState } from 'react';
import {
  GitCompare,
  ArrowRight,
  FileText,
  MapPinPlus,
  Play,
  Search,
  CheckCircle2,
  AlertTriangle,
  AlertOctagon,
  FileDiff,
  Loader2,
} from 'lucide-react';
import { H042_DRAWINGS } from '../data/h042Dataset';
import {
  CrossLayerDiffItem,
  CustomDiffPairResult,
  DiffPairScope,
  DiscrepancySeverity,
  DrawingChangeComparison,
  DrawingChangeType,
  ExtractedEntityKind,
  ExtractedPdfEntity,
} from '../types/diagram';
import { runParallelCustomDiff } from '../utils/diffEngine';
import {
  analyzeDrawingsContent,
  compareDocumentEntities,
} from '../utils/drawingContentAnalyzer';

interface UploadedPdfChoice {
  id: string;
  name: string;
  objectUrl: string;
}

interface DiffCheckWorkspaceProps {
  diffs: CrossLayerDiffItem[];
  uploadedPdfs?: UploadedPdfChoice[];
  cachedEntities?: ExtractedPdfEntity[];
  onCacheExtractedEntities?: (entities: ExtractedPdfEntity[]) => void;
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
  onCompareSideBySide: (
    left: { drawingId: string; pageNum: number },
    right: { drawingId: string; pageNum: number },
    opts?: {
      tagRef: string;
      searchTerms: string[];
      severity: DiscrepancySeverity;
      content: string;
      autoInsert?: boolean;
    }
  ) => void;
}

const DEFAULT_PIPING_LIST = `# Tag, CableNo, JunctionBox
100-PIT-201A, RS0101, 100-ISJB-001
100-FIT-203B, RC0308, 100-ISJB-003
100-SDV-254A, NO.TBD, 100-NISJB-001
200-PDIT-111E, HC0509, 200-ISJB-005
200-SDY-101, HS0601, 200-NISJB-001
200-ZSO-101, HS0602, 200-NISJB-001`;

const DEFAULT_ELECTRICAL_LIST = `# Tag, CableNo, JunctionBox
100-PIT-201A, RS0101, 100-ISJB-001
100-FIT-203B, RC03208, 100-ISJB-003
100-SDV-254A, MISSING, 100-NISJB-001
200-PEIT-111E, HC0509, 200-ISJB-005
200-SDY-101, HS0601, 100-NISJB-001
100-ZSO-101, HS0602, 100-NISJB-001
100-TIT-252A, RC0306, 100-ISJB-003`;

const CHANGE_BADGE_LABELS: Record<DrawingChangeType, string> = {
  MODIFIED: '변경/불일치',
  REMOVED: '기준에만 존재',
  ADDED: '비교도면 신규',
  UNCHANGED: '동일 일치',
};

export const DiffCheckWorkspace: React.FC<DiffCheckWorkspaceProps> = ({
  diffs,
  uploadedPdfs = [],
  cachedEntities = [],
  onCacheExtractedEntities,
  onJumpToDrawingPage,
  onCompareSideBySide,
}) => {
  const [mode, setMode] = useState<'LAYER_DIFF' | 'PDF_CHANGE_DIFF' | 'CUSTOM_DIFF'>('LAYER_DIFF');
  const [scopeFilter, setScopeFilter] = useState<'ALL' | DiffPairScope>('ALL');
  const [severityFilter, setSeverityFilter] = useState<'ALL' | DiscrepancySeverity>('ALL');
  const [query, setQuery] = useState('');

  // PDF-vs-PDF Change Comparison State
  const pdfChoices = useMemo(() => {
    const base = H042_DRAWINGS.map((d) => ({
      id: d.id,
      label: `${d.id} · ${d.titleKo}`,
      url: d.pdfUrl,
    }));
    const custom = uploadedPdfs.map((u) => ({
      id: u.id,
      label: `[업로드] ${u.name}`,
      url: u.objectUrl,
    }));
    return [...base, ...custom];
  }, [uploadedPdfs]);

  const [leftPdfId, setLeftPdfId] = useState('PR-200-PID-0001');
  const [rightPdfId, setRightPdfId] = useState('PD-200-GAR-0001');
  const [pdfComparison, setPdfComparison] = useState<DrawingChangeComparison | null>(null);
  const [isPdfCompareRunning, setIsPdfCompareRunning] = useState(false);
  const [pdfCompareError, setPdfCompareError] = useState<string | null>(null);
  const [changeTypeFilter, setChangeTypeFilter] = useState<'ALL' | DrawingChangeType>('ALL');
  const [changeKindFilter, setChangeKindFilter] = useState<'ALL' | ExtractedEntityKind>('ALL');
  const [changeQuery, setChangeQuery] = useState('');

  // Custom pairwise diff state
  const [pipingText, setPipingText] = useState(DEFAULT_PIPING_LIST);
  const [electricalText, setElectricalText] = useState(DEFAULT_ELECTRICAL_LIST);
  const [customDiffResults, setCustomDiffResults] = useState<CustomDiffPairResult[] | null>(null);
  const [isCustomRunning, setIsCustomRunning] = useState(false);

  const filteredDiffs = useMemo(() => {
    const q = query.trim().toLowerCase();
    return diffs.filter((d) => {
      if (scopeFilter !== 'ALL' && d.scope !== scopeFilter) return false;
      if (severityFilter !== 'ALL' && d.severity !== severityFilter) return false;
      if (!q) return true;
      const hay = [
        d.canonicalTag,
        d.title,
        d.summary,
        ...d.deltas.flatMap((dl) => [dl.fieldLabel, dl.leftValue, dl.rightValue]),
      ]
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [diffs, scopeFilter, severityFilter, query]);

  const scopeCounts = useMemo(() => {
    const counts: Record<DiffPairScope, number> = {
      PID_VS_GAR: 0,
      PID_VS_DIA: 0,
      BLOCK_VS_CONNECTION: 0,
      REVISION_VS_ACTIVE: 0,
    };
    for (const d of diffs) {
      counts[d.scope] += 1;
    }
    return counts;
  }, [diffs]);

  const handleRunCustomDiff = async () => {
    setIsCustomRunning(true);
    try {
      const res = await runParallelCustomDiff(pipingText, electricalText);
      setCustomDiffResults(res);
    } finally {
      setIsCustomRunning(false);
    }
  };

  const handleRunPdfChangeDiff = async () => {
    const leftDoc = pdfChoices.find((c) => c.id === leftPdfId);
    const rightDoc = pdfChoices.find((c) => c.id === rightPdfId);
    if (!leftDoc || !rightDoc) return;

    const started = Date.now();
    setIsPdfCompareRunning(true);
    setPdfCompareError(null);
    try {
      let leftEntities = cachedEntities.filter((e) => e.drawingId === leftDoc.id);
      let rightEntities = cachedEntities.filter((e) => e.drawingId === rightDoc.id);

      const missingTargets = [];
      if (leftEntities.length === 0) {
        missingTargets.push({ id: leftDoc.id, url: leftDoc.url });
      }
      if (rightEntities.length === 0 && rightDoc.id !== leftDoc.id) {
        missingTargets.push({ id: rightDoc.id, url: rightDoc.url });
      }

      if (missingTargets.length > 0) {
        const extracted = await analyzeDrawingsContent(missingTargets);
        onCacheExtractedEntities?.(extracted.entities);
        if (leftEntities.length === 0) {
          leftEntities = extracted.entities.filter((e) => e.drawingId === leftDoc.id);
        }
        if (rightEntities.length === 0) {
          rightEntities = extracted.entities.filter((e) => e.drawingId === rightDoc.id);
        }
      }

      const comparison = compareDocumentEntities(
        leftDoc.id,
        leftDoc.label,
        leftEntities,
        rightDoc.id,
        rightDoc.label,
        rightEntities,
        Date.now() - started
      );
      setPdfComparison(comparison);
    } catch (err) {
      setPdfCompareError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsPdfCompareRunning(false);
    }
  };

  const filteredChangeItems = useMemo(() => {
    if (!pdfComparison) return [];
    const q = changeQuery.trim().toLowerCase();
    return pdfComparison.items.filter((item) => {
      if (changeTypeFilter !== 'ALL' && item.changeType !== changeTypeFilter) return false;
      if (changeKindFilter !== 'ALL' && item.kind !== changeKindFilter) return false;
      if (!q) return true;
      return (
        item.normalizedKey.toLowerCase().includes(q) ||
        item.detailKo.toLowerCase().includes(q)
      );
    });
  }, [pdfComparison, changeTypeFilter, changeKindFilter, changeQuery]);

  return (
    <div className="space-y-4">
      {/* Top Mode & KPI Summary Strip */}
      <section className="flex flex-wrap items-center justify-between gap-3 rounded border border-slate-200 bg-white px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setMode('LAYER_DIFF')}
            className={`inline-flex h-8 items-center gap-1.5 rounded border px-3 text-xs font-semibold transition-colors ${
              mode === 'LAYER_DIFF'
                ? 'border-sky-600 bg-sky-50 text-sky-800'
                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            <GitCompare className="h-3.5 w-3.5" />
            <span>H042 도면 계층 디프체크 ({diffs.length}건)</span>
          </button>
          <button
            type="button"
            onClick={() => setMode('PDF_CHANGE_DIFF')}
            className={`inline-flex h-8 items-center gap-1.5 rounded border px-3 text-xs font-semibold transition-colors ${
              mode === 'PDF_CHANGE_DIFF'
                ? 'border-sky-600 bg-sky-50 text-sky-800'
                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            <FileDiff className="h-3.5 w-3.5" />
            <span>PDF-대-PDF 변경·차이 비교</span>
          </button>
          <button
            type="button"
            onClick={() => setMode('CUSTOM_DIFF')}
            className={`inline-flex h-8 items-center gap-1.5 rounded border px-3 text-xs font-semibold transition-colors ${
              mode === 'CUSTOM_DIFF'
                ? 'border-sky-600 bg-sky-50 text-sky-800'
                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            <Play className="h-3.5 w-3.5" />
            <span>사용자 목록 병렬 디프</span>
          </button>
        </div>

        <div className="flex items-center gap-3 text-xs text-slate-600 tabular-nums">
          <span>P&ID↔GAR {scopeCounts.PID_VS_GAR}</span>
          <span>·</span>
          <span>P&ID↔DIA {scopeCounts.PID_VS_DIA}</span>
          <span>·</span>
          <span>블록도↔결선표 {scopeCounts.BLOCK_VS_CONNECTION}</span>
          <span>·</span>
          <span>리비전 {scopeCounts.REVISION_VS_ACTIVE}</span>
        </div>
      </section>

      {mode === 'LAYER_DIFF' ? (
        <div className="space-y-3">
          {/* Scope & Severity Filter Bar */}
          <section className="flex flex-wrap items-center justify-between gap-3 rounded border border-slate-200 bg-white px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-[240px]">
                <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  aria-label="디프 항목 검색"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="태그, 오타값, JB명, 케이블 검색..."
                  className="h-8 w-full rounded border border-slate-300 bg-white pr-3 pl-8 text-xs text-slate-900 placeholder:text-slate-400 focus:border-sky-600 focus:outline-none"
                />
              </div>

              <select
                aria-label="디프 비교 계층 필터"
                value={scopeFilter}
                onChange={(e) => setScopeFilter(e.target.value as 'ALL' | DiffPairScope)}
                className="h-8 rounded border border-slate-300 bg-white px-2.5 text-xs text-slate-700"
              >
                <option value="ALL">전체 비교 계층 ({diffs.length})</option>
                <option value="BLOCK_VS_CONNECTION">전장 블록도 ↔ 결선 테이블 ({scopeCounts.BLOCK_VS_CONNECTION})</option>
                <option value="PID_VS_DIA">P&ID/GAR ↔ 전장 결선도 ({scopeCounts.PID_VS_DIA})</option>
                <option value="PID_VS_GAR">P&ID ↔ GAR 배치도 ({scopeCounts.PID_VS_GAR})</option>
                <option value="REVISION_VS_ACTIVE">리비전 이력 ↔ 현행 전장도 ({scopeCounts.REVISION_VS_ACTIVE})</option>
              </select>

              <select
                aria-label="심각도 필터"
                value={severityFilter}
                onChange={(e) => setSeverityFilter(e.target.value as 'ALL' | DiscrepancySeverity)}
                className="h-8 rounded border border-slate-300 bg-white px-2.5 text-xs text-slate-700"
              >
                <option value="ALL">전체 심각도</option>
                <option value="CRITICAL">CRITICAL (심각)</option>
                <option value="WARNING">WARNING (주의)</option>
                <option value="INFO">INFO (참고)</option>
              </select>
            </div>

            <div className="text-xs text-slate-500 tabular-nums">
              검출 {filteredDiffs.length} / {diffs.length}건
            </div>
          </section>

          {/* Diff Cards with Left vs Right Value Deltas + Direct Drawing Jump / Note Creation */}
          <div className="space-y-3">
            {filteredDiffs.map((diff) => (
              <article
                key={diff.id}
                className="rounded border border-slate-200 bg-white"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[10px] font-semibold ${
                        diff.severity === 'CRITICAL'
                          ? 'border-red-200 bg-red-50 text-red-800'
                          : diff.severity === 'WARNING'
                            ? 'border-amber-200 bg-amber-50 text-amber-800'
                            : 'border-sky-200 bg-sky-50 text-sky-800'
                      }`}
                    >
                      {diff.severity}
                    </span>
                    <span className="font-mono text-xs font-semibold text-slate-900">
                      {diff.canonicalTag}
                    </span>
                    <span className="text-slate-300">·</span>
                    <span className="text-xs font-medium text-slate-600">{diff.scopeLabelKo}</span>
                    <span className="text-slate-300">·</span>
                    <span className="text-xs font-semibold text-slate-900">{diff.title}</span>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    {diff.leftJump && diff.rightJump && (
                      <button
                        type="button"
                        onClick={() => {
                          const terms = Array.from(
                            new Set(
                              [
                                diff.canonicalTag,
                                ...diff.deltas.flatMap((dl) => [dl.leftValue, dl.rightValue]),
                              ].filter((v) => v && v.trim().length >= 3 && !v.includes('미표기'))
                            )
                          );
                          onCompareSideBySide(diff.leftJump!, diff.rightJump!, {
                            tagRef: diff.canonicalTag,
                            searchTerms: terms,
                            severity: diff.severity,
                            content: `${diff.title} — ${diff.recommendedFix}`,
                            autoInsert: true,
                          });
                        }}
                        className="inline-flex h-7 items-center gap-1 rounded border border-slate-300 bg-white px-2.5 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                      >
                        <FileText className="h-3 w-3" />
                        <span>양측 도면 위치·노트 비교</span>
                      </button>
                    )}
                    {(diff.rightJump || diff.leftJump) && (
                      <button
                        type="button"
                        onClick={() => {
                          const target = diff.rightJump || diff.leftJump!;
                          const terms = Array.from(
                            new Set(
                              [
                                ...diff.deltas.flatMap((dl) => [dl.rightValue, dl.leftValue]),
                                diff.canonicalTag,
                              ].filter((v) => v && v.trim().length >= 3 && !v.includes('미표기'))
                            )
                          );
                          onJumpToDrawingPage(target.drawingId, target.pageNum, {
                            tagRef: diff.canonicalTag,
                            severity: diff.severity,
                            content: `${diff.title} — ${diff.recommendedFix}`,
                            searchTerms: terms,
                            autoInsert: true,
                          });
                        }}
                        className="inline-flex h-7 items-center gap-1 rounded bg-sky-700 px-2.5 text-[11px] font-semibold text-white hover:bg-sky-800"
                      >
                        <MapPinPlus className="h-3 w-3" />
                        <span>PDF 위치 찾아 자동 노트 삽입</span>
                      </button>
                    )}
                  </div>
                </div>

                <div className="space-y-3 px-4 py-3">
                  <p className="text-xs text-slate-700">{diff.summary}</p>

                  {/* Field-Level Left vs Right Diff Rows */}
                  <div className="overflow-x-auto rounded border border-slate-200">
                    <table className="w-full border-collapse text-left text-xs">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600">
                          <th className="w-36 px-3 py-1.5">비교 필드</th>
                          <th className="px-3 py-1.5">기준 도면 값 (Expected / Source)</th>
                          <th className="w-8 px-1 py-1.5 text-center" />
                          <th className="px-3 py-1.5">대상 도면 값 (Actual / Target)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {diff.deltas.map((delta, i) => (
                          <tr key={i}>
                            <td className="px-3 py-2 font-medium text-slate-700">
                              {delta.fieldLabel}
                            </td>
                            <td className="bg-emerald-50/50 px-3 py-2">
                              <div className="text-[10px] text-slate-500">{delta.leftSourceLabel}</div>
                              <div className="font-mono font-semibold text-emerald-900">
                                {delta.leftValue}
                              </div>
                            </td>
                            <td className="px-1 py-2 text-center text-slate-400">
                              <ArrowRight className="mx-auto h-3.5 w-3.5" />
                            </td>
                            <td className="bg-red-50/60 px-3 py-2">
                              <div className="text-[10px] text-slate-500">{delta.rightSourceLabel}</div>
                              <div className="font-mono font-semibold text-red-900">
                                {delta.rightValue}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-600">
                    <div>
                      <span className="font-semibold text-sky-800">권고 조치: </span>
                      <span>{diff.recommendedFix}</span>
                    </div>
                    <div className="flex items-center gap-2 font-mono">
                      {diff.leftJump && (
                        <button
                          type="button"
                          onClick={() => {
                            const terms = Array.from(
                              new Set(
                                [
                                  ...diff.deltas.map((dl) => dl.leftValue),
                                  diff.canonicalTag,
                                ].filter((v) => v && v.trim().length >= 3 && !v.includes('미표기'))
                              )
                            );
                            onJumpToDrawingPage(diff.leftJump!.drawingId, diff.leftJump!.pageNum, {
                              tagRef: diff.canonicalTag,
                              severity: diff.severity,
                              content: `${diff.title} — ${diff.recommendedFix}`,
                              searchTerms: terms,
                              autoInsert: true,
                            });
                          }}
                          className="text-sky-700 underline-offset-2 hover:underline"
                        >
                          {diff.leftJump.label}
                        </button>
                      )}
                      {diff.rightJump && (
                        <button
                          type="button"
                          onClick={() => {
                            const terms = Array.from(
                              new Set(
                                [
                                  ...diff.deltas.map((dl) => dl.rightValue),
                                  diff.canonicalTag,
                                ].filter((v) => v && v.trim().length >= 3 && !v.includes('미표기'))
                              )
                            );
                            onJumpToDrawingPage(diff.rightJump!.drawingId, diff.rightJump!.pageNum, {
                              tagRef: diff.canonicalTag,
                              severity: diff.severity,
                              content: `${diff.title} — ${diff.recommendedFix}`,
                              searchTerms: terms,
                              autoInsert: true,
                            });
                          }}
                          className="text-sky-700 underline-offset-2 hover:underline"
                        >
                          {diff.rightJump.label}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      ) : mode === 'PDF_CHANGE_DIFF' ? (
        /* Mode 2: Live PDF-vs-PDF & Revision Change Comparison */
        <div className="space-y-4">
          <section className="rounded border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">
                  도면-대-도면 실물 내용 변경·차이 비교 (PDF / Revision Diff)
                </h2>
                <p className="text-xs text-slate-500">
                  기준 도면과 비교 도면(또는 업로드된 개정 도면 PDF)의 모든 페이지에서 태그·라인·케이블·JB·장비·HOLD를 병렬 추출해 변경/누락/추가 항목을 산출합니다.
                </p>
              </div>
              <button
                type="button"
                disabled={isPdfCompareRunning}
                onClick={() => void handleRunPdfChangeDiff()}
                className="inline-flex h-8 items-center gap-1.5 rounded bg-sky-700 px-3.5 text-xs font-semibold text-white hover:bg-sky-800 disabled:opacity-60"
              >
                {isPdfCompareRunning ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <FileDiff className="h-3.5 w-3.5" />
                )}
                <span>{isPdfCompareRunning ? '병렬 비교 추출 중...' : '병렬 도면 변경 비교 실행'}</span>
              </button>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-medium text-slate-500">빠른 비교 조합:</span>
              <button
                type="button"
                onClick={() => {
                  setLeftPdfId('PR-200-PID-0001');
                  setRightPdfId('PD-200-GAR-0001');
                }}
                className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] text-slate-700 hover:border-sky-400 hover:bg-sky-50"
              >
                200 모듈 P&amp;ID ↔ GAR
              </button>
              <button
                type="button"
                onClick={() => {
                  setLeftPdfId('PR-100-PID-0001');
                  setRightPdfId('PD-100-GAR-0001');
                }}
                className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] text-slate-700 hover:border-sky-400 hover:bg-sky-50"
              >
                100 모듈 P&amp;ID ↔ GAR
              </button>
              <button
                type="button"
                onClick={() => {
                  setLeftPdfId('PR-200-PID-0001');
                  setRightPdfId('CI-000-DIA-0001');
                }}
                className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] text-slate-700 hover:border-sky-400 hover:bg-sky-50"
              >
                200 P&amp;ID ↔ iCAMS 결선도
              </button>
              <button
                type="button"
                onClick={() => {
                  setLeftPdfId('CI-000-DIA-0001');
                  setRightPdfId('CI-000-DIA-0002');
                }}
                className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] text-slate-700 hover:border-sky-400 hover:bg-sky-50"
              >
                iCAMS ↔ PSDS 결선도
              </button>
            </div>

            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <label htmlFor="diff-left-pdf" className="mb-1 block text-xs font-semibold text-slate-700">
                  기준 도면 (Baseline PDF)
                </label>
                <select
                  id="diff-left-pdf"
                  value={leftPdfId}
                  onChange={(e) => setLeftPdfId(e.target.value)}
                  className="h-8 w-full rounded border border-slate-300 bg-white px-2.5 text-xs text-slate-900"
                >
                  {pdfChoices.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="diff-right-pdf" className="mb-1 block text-xs font-semibold text-slate-700">
                  비교 도면 (Target / Revision PDF)
                </label>
                <select
                  id="diff-right-pdf"
                  value={rightPdfId}
                  onChange={(e) => setRightPdfId(e.target.value)}
                  className="h-8 w-full rounded border border-slate-300 bg-white px-2.5 text-xs text-slate-900"
                >
                  {pdfChoices.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {pdfCompareError && (
              <div className="mt-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
                도면 비교 오류: {pdfCompareError}
              </div>
            )}
          </section>

          {pdfComparison ? (
            <section className="rounded border border-slate-200 bg-white">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
                <div className="flex flex-wrap items-center gap-3 text-xs tabular-nums">
                  <span className="font-semibold text-slate-900">
                    {pdfComparison.leftDrawingId} ↔ {pdfComparison.rightDrawingId}
                  </span>
                  <span className="text-red-700 font-semibold">
                    변경/불일치 {pdfComparison.summary.modified}
                  </span>
                  <span className="text-amber-700 font-semibold">
                    기준만 존재 {pdfComparison.summary.removed}
                  </span>
                  <span className="text-sky-700 font-semibold">
                    비교 신규 {pdfComparison.summary.added}
                  </span>
                  <span className="text-emerald-700">
                    동일 일치 {pdfComparison.summary.unchanged}
                  </span>
                  <span className="text-slate-400">
                    ({(pdfComparison.durationMs / 1000).toFixed(2)}s)
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    aria-label="도면 변경 항목 검색"
                    value={changeQuery}
                    onChange={(e) => setChangeQuery(e.target.value)}
                    placeholder="태그/라인/케이블 검색..."
                    className="h-7 rounded border border-slate-300 bg-white px-2.5 text-xs text-slate-900"
                  />
                  <select
                    aria-label="변경 상태 필터"
                    value={changeTypeFilter}
                    onChange={(e) => setChangeTypeFilter(e.target.value as 'ALL' | DrawingChangeType)}
                    className="h-7 rounded border border-slate-300 bg-white px-2 text-xs text-slate-700"
                  >
                    <option value="ALL">전체 변화 ({pdfComparison.items.length})</option>
                    <option value="MODIFIED">변경/불일치 ({pdfComparison.summary.modified})</option>
                    <option value="REMOVED">기준에만 존재 ({pdfComparison.summary.removed})</option>
                    <option value="ADDED">비교도면 신규 ({pdfComparison.summary.added})</option>
                    <option value="UNCHANGED">동일 일치 ({pdfComparison.summary.unchanged})</option>
                  </select>
                  <select
                    aria-label="변경 엔티티 유형"
                    value={changeKindFilter}
                    onChange={(e) => setChangeKindFilter(e.target.value as 'ALL' | ExtractedEntityKind)}
                    className="h-7 rounded border border-slate-300 bg-white px-2 text-xs text-slate-700"
                  >
                    <option value="ALL">전체 유형</option>
                    <option value="TAG">태그</option>
                    <option value="LINE_NO">배관 라인</option>
                    <option value="EQUIPMENT">장비</option>
                    <option value="CABLE">케이블</option>
                    <option value="JUNCTION_BOX">JB</option>
                    <option value="HOLD_OR_NOTE">HOLD · 주석</option>
                  </select>
                </div>
              </div>

              <div className="max-h-[460px] overflow-auto">
                <table className="w-full border-collapse text-left text-xs">
                  <thead className="sticky top-0 z-10 bg-slate-50 text-[11px] font-semibold text-slate-600">
                    <tr className="border-b border-slate-200">
                      <th className="px-3 py-2">변화 구분</th>
                      <th className="px-3 py-2">식별자 / 유형</th>
                      <th className="px-3 py-2">기준 도면 ({pdfComparison.leftDrawingId})</th>
                      <th className="px-3 py-2">비교 도면 ({pdfComparison.rightDrawingId})</th>
                      <th className="px-3 py-2">판정 요약</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {filteredChangeItems.slice(0, 150).map((item) => (
                      <tr key={item.id} className="hover:bg-slate-50">
                        <td className="px-3 py-2 whitespace-nowrap">
                          <span
                            className={`inline-flex rounded border px-1.5 py-0.5 text-[10px] font-semibold ${
                              item.changeType === 'MODIFIED'
                                ? 'border-red-200 bg-red-50 text-red-800'
                                : item.changeType === 'REMOVED'
                                  ? 'border-amber-200 bg-amber-50 text-amber-800'
                                  : item.changeType === 'ADDED'
                                    ? 'border-sky-200 bg-sky-50 text-sky-800'
                                    : 'border-emerald-200 bg-emerald-50 text-emerald-800'
                            }`}
                          >
                            {CHANGE_BADGE_LABELS[item.changeType]}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          <div className="font-mono font-semibold text-slate-900">
                            {item.normalizedKey}
                          </div>
                          <div className="text-[10px] text-slate-500">{item.kind}</div>
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex flex-wrap gap-1">
                            {item.leftOccurrences.length > 0 ? (
                              item.leftOccurrences.slice(0, 3).map((occ, idx) => (
                                <button
                                  key={idx}
                                  type="button"
                                  onClick={() =>
                                    onJumpToDrawingPage(pdfComparison.leftDrawingId, occ.pageNum, {
                                      tagRef: item.normalizedKey,
                                      severity: item.severity,
                                      content: `[도면 비교 ${CHANGE_BADGE_LABELS[item.changeType]}] ${item.detailKo}`,
                                      searchTerms: [occ.rawText, item.normalizedKey],
                                      autoInsert: true,
                                    })
                                  }
                                  className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2 py-0.5 font-mono text-[11px] text-sky-800 hover:bg-sky-50"
                                >
                                  <MapPinPlus className="h-3 w-3" />
                                  <span>p.{occ.pageNum} ({occ.rawText})</span>
                                </button>
                              ))
                            ) : (
                              <span className="text-slate-400">미검출</span>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex flex-wrap gap-1">
                            {item.rightOccurrences.length > 0 ? (
                              item.rightOccurrences.slice(0, 3).map((occ, idx) => (
                                <button
                                  key={idx}
                                  type="button"
                                  onClick={() =>
                                    onJumpToDrawingPage(pdfComparison.rightDrawingId, occ.pageNum, {
                                      tagRef: item.normalizedKey,
                                      severity: item.severity,
                                      content: `[도면 비교 ${CHANGE_BADGE_LABELS[item.changeType]}] ${item.detailKo}`,
                                      searchTerms: [occ.rawText, item.normalizedKey],
                                      autoInsert: true,
                                    })
                                  }
                                  className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2 py-0.5 font-mono text-[11px] text-sky-800 hover:bg-sky-50"
                                >
                                  <MapPinPlus className="h-3 w-3" />
                                  <span>p.{occ.pageNum} ({occ.rawText})</span>
                                </button>
                              ))
                            ) : (
                              <span className="text-slate-400">미검출</span>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-slate-700">{item.detailKo}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : (
            <div className="rounded border border-dashed border-slate-300 bg-white px-4 py-8 text-center text-xs text-slate-600">
              비교할 기준 도면과 대상 도면을 선택한 뒤 <strong>병렬 도면 변경 비교 실행</strong>을 누르면 실제 PDF 페이지 전체를 스캔하여 변경·누락·신규 항목을 추출합니다.
            </div>
          )}
        </div>
      ) : (
        /* Mode 3: Custom Pairwise Parallel Diff */
        <div className="space-y-4">
          <section className="rounded border border-slate-200 bg-white p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">
                  사용자 배관 vs 전장 목록 병렬 디프체크
                </h2>
                <p className="text-xs text-slate-500">
                  형식: <code className="font-mono">태그, 케이블번호, JunctionBox</code> (줄바꿈 구분) — 4개 파티션으로 병렬 비교합니다.
                </p>
              </div>
              <button
                type="button"
                disabled={isCustomRunning}
                onClick={() => void handleRunCustomDiff()}
                className="inline-flex h-8 items-center gap-1.5 rounded bg-sky-700 px-3.5 text-xs font-semibold text-white hover:bg-sky-800 disabled:opacity-60"
              >
                <Play className="h-3.5 w-3.5" />
                <span>{isCustomRunning ? '병렬 비교 중...' : '병렬 디프체크 실행'}</span>
              </button>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label htmlFor="custom-piping-list" className="mb-1 block text-xs font-semibold text-sky-800">
                  기준 배관 목록 (P&ID / GAR)
                </label>
                <textarea
                  id="custom-piping-list"
                  rows={8}
                  value={pipingText}
                  onChange={(e) => setPipingText(e.target.value)}
                  className="w-full rounded border border-slate-300 bg-slate-50 p-2.5 font-mono text-xs text-slate-900 focus:border-sky-600 focus:bg-white focus:outline-none"
                />
              </div>
              <div>
                <label htmlFor="custom-elec-list" className="mb-1 block text-xs font-semibold text-slate-800">
                  비교 전장 목록 (iCAMS / PSDS)
                </label>
                <textarea
                  id="custom-elec-list"
                  rows={8}
                  value={electricalText}
                  onChange={(e) => setElectricalText(e.target.value)}
                  className="w-full rounded border border-slate-300 bg-slate-50 p-2.5 font-mono text-xs text-slate-900 focus:border-sky-600 focus:bg-white focus:outline-none"
                />
              </div>
            </div>
          </section>

          {customDiffResults && (
            <section className="rounded border border-slate-200 bg-white">
              <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 text-xs">
                <span className="font-semibold text-slate-900">
                  병렬 디프 결과 ({customDiffResults.length}개 태그)
                </span>
                <div className="flex items-center gap-3 tabular-nums">
                  <span className="text-emerald-700">
                    일치 {customDiffResults.filter((r) => r.status === 'MATCHED').length}
                  </span>
                  <span className="text-red-700">
                    불일치/누락 {customDiffResults.filter((r) => r.status !== 'MATCHED').length}
                  </span>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600">
                      <th className="px-3 py-2">상태</th>
                      <th className="px-3 py-2">태그</th>
                      <th className="px-3 py-2">배관 (케이블 / JB)</th>
                      <th className="px-3 py-2">전장 (케이블 / JB)</th>
                      <th className="px-3 py-2">판정 상세</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {customDiffResults.map((r) => (
                      <tr key={r.tag}>
                        <td className="px-3 py-2">
                          <span
                            className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-semibold ${
                              r.status === 'MATCHED'
                                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                                : r.status === 'VALUE_DIFF'
                                  ? 'border-amber-200 bg-amber-50 text-amber-800'
                                  : 'border-red-200 bg-red-50 text-red-800'
                            }`}
                          >
                            {r.status === 'MATCHED' ? (
                              <CheckCircle2 className="h-3 w-3" />
                            ) : r.status === 'VALUE_DIFF' ? (
                              <AlertTriangle className="h-3 w-3" />
                            ) : (
                              <AlertOctagon className="h-3 w-3" />
                            )}
                            <span>{r.status}</span>
                          </span>
                        </td>
                        <td className="px-3 py-2 font-mono font-semibold text-slate-900">{r.tag}</td>
                        <td className="px-3 py-2 font-mono text-[11px] text-slate-700">
                          {r.pipingCable ? `${r.pipingCable} / ${r.pipingJb}` : '-'}
                        </td>
                        <td className="px-3 py-2 font-mono text-[11px] text-slate-700">
                          {r.electricalCable ? `${r.electricalCable} / ${r.electricalJb}` : '-'}
                        </td>
                        <td className="px-3 py-2 text-slate-700">{r.detail}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
};
