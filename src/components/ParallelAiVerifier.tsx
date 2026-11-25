import React, { useState } from 'react';
import {
  Cpu,
  Play,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  Loader2,
  ScanSearch,
  MapPinPlus,
  Sparkles,
} from 'lucide-react';
import { H042_DRAWINGS } from '../data/h042Dataset';
import {
  CustomPdfAttachment,
  DiscrepancySeverity,
  ParallelAnalyzeResponse,
} from '../types/diagram';
import {
  LocalPdfAuditResponse,
  LocalPdfFinding,
  runLocalPdfVectorAudit,
} from '../utils/localPdfAudit';

export type FreeGeminiModel = 'gemini-3.1-flash-lite' | 'gemini-4-hydrogen';

interface ParallelAiVerifierProps {
  result: ParallelAnalyzeResponse | null;
  isRunning: boolean;
  error: string | null;
  customAttachments: CustomPdfAttachment[];
  initialFocusQuery?: string;
  selectedModel: FreeGeminiModel;
  onChangeModel: (model: FreeGeminiModel) => void;
  onRunParallelAudit: (focusQuery?: string) => void;
  onRunFocusedQuery: (query: string, drawingIds: string[]) => void;
  onJumpToLocalFinding: (finding: LocalPdfFinding) => void;
  onJumpToAiFinding: (
    finding: {
      tag: string;
      severity: DiscrepancySeverity;
      finding: string;
      sourceEvidence: string;
      recommendation: string;
    },
    drawingIds: string[]
  ) => void;
}

export const ParallelAiVerifier: React.FC<ParallelAiVerifierProps> = ({
  result,
  isRunning,
  error,
  customAttachments,
  initialFocusQuery = '',
  selectedModel,
  onChangeModel,
  onRunParallelAudit,
  onRunFocusedQuery,
  onJumpToLocalFinding,
  onJumpToAiFinding,
}) => {
  const [focusQuery, setFocusQuery] = useState(initialFocusQuery);
  const [selectedDrawings, setSelectedDrawings] = useState<string[]>([
    'PR-200-PID-0001',
    'CI-000-DIA-0002',
  ]);
  const [expandedThoughts, setExpandedThoughts] = useState<Record<string, boolean>>({});

  // 100% API-key-free browser-side vector audit state
  const [localAuditResult, setLocalAuditResult] = useState<LocalPdfAuditResponse | null>(null);
  const [isLocalScanning, setIsLocalScanning] = useState(false);
  const [localScanError, setLocalScanError] = useState<string | null>(null);

  React.useEffect(() => {
    if (initialFocusQuery) {
      setFocusQuery(initialFocusQuery);
    }
  }, [initialFocusQuery]);

  const toggleDrawing = (id: string) => {
    setSelectedDrawings((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const toggleThought = (trackId: string) => {
    setExpandedThoughts((prev) => ({ ...prev, [trackId]: !prev[trackId] }));
  };

  const handleRunLocalVectorScan = async () => {
    setIsLocalScanning(true);
    setLocalScanError(null);
    try {
      const scanRes = await runLocalPdfVectorAudit();
      setLocalAuditResult(scanRes);
    } catch (err) {
      setLocalScanError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLocalScanning(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Control Panel: Zero-API Local Vector Audit + Free-Tier Gemini Parallel Audit */}
      <section className="rounded border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-4">
          <div className="min-w-0 flex-1 max-w-3xl">
            <div className="flex items-center gap-2">
              <Cpu className="h-4 w-4 text-sky-700" />
              <h2 className="text-sm font-semibold text-slate-900">
                병렬 도면 검증 엔진 (무료 로컬 PDF 벡터 스캔 · Gemini 무료 티어 지원)
              </h2>
            </div>
            <p className="mt-1 text-xs text-slate-600">
              API 키가 없는 환경에서는 브라우저 내{' '}
              <span className="font-mono font-medium text-slate-800">로컬 PDF 벡터 텍스트 스캔</span>
              으로 즉시 좌표를 추출하고 도면에 자동 노트를 삽입할 수 있습니다.{' '}
              <span className="font-mono text-slate-500">GEMINI_API_KEY</span>가 설정된 경우 무료 티어 모델로 멀티모달 병렬 추론을 수행합니다.
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <label htmlFor="gemini-free-model" className="text-[11px] font-medium text-slate-600">
              Gemini 무료 티어 모델 선택
            </label>
            <select
              id="gemini-free-model"
              aria-label="Gemini 무료 티어 모델 선택"
              value={selectedModel}
              onChange={(e) => onChangeModel(e.target.value as FreeGeminiModel)}
              className="h-8 rounded border border-slate-300 bg-white px-2.5 font-mono text-[11px] text-slate-800 focus:border-sky-600 focus:outline-none"
            >
              <option value="gemini-3.1-flash-lite">gemini-3.1-flash-lite (초경량 · 무료 한도 최대)</option>
              <option value="gemini-4-hydrogen">gemini-4-hydrogen (표준 · High Thinking 무료)</option>
            </select>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-12">
          <div className="space-y-3 lg:col-span-7">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label htmlFor="ai-focus-query" className="block text-xs font-semibold text-slate-800">
                집중 검증 질의 (선택 사항 — 단일 집중 검증 시 필수)
              </label>
              <div className="flex flex-wrap items-center gap-1.5">
                {[
                  {
                    label: '200-SDY-101 유닛충돌',
                    q: 'DIA-0002 H-06 및 Sheet 15에서 200-SDY-101/102와 100-ZSO/ZSC-101/102의 유닛 코드 불일치 및 JB 오기(100-NISJB vs 200-NISJB)를 정밀 검증해줘.',
                  },
                  {
                    label: 'Mark B 누락케이블',
                    q: 'PD-100-GAR-0001에서 SEASTAR Mark B(CABLE MISSING)로 표기된 SDV-254A, SDV-202A, SDV-201A의 P&ID 및 PSDS 결선표 누락 여부를 대조해줘.',
                  },
                  {
                    label: '블록도 복사오류',
                    q: 'DIA-0001 R-06/E-01/E-02 및 DIA-0002 R-01/H-05/H-09의 블록 다이어그램과 결선 테이블 간 태그·케이블 번호 불일치를 모두 찾아줘.',
                  },
                ].map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => setFocusQuery(preset.q)}
                    className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] text-slate-700 hover:border-sky-500 hover:bg-sky-50 hover:text-sky-800"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>
            <textarea
              id="ai-focus-query"
              rows={3}
              value={focusQuery}
              onChange={(e) => setFocusQuery(e.target.value)}
              placeholder="예: 200-SDY-101과 100-ZSO/ZSC-101의 유닛코드 불일치 및 H-06~H-08 JB 명칭 오류를 결선표 시트 기준으로 교차 검증해줘."
              className="w-full rounded border border-slate-300 bg-white p-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-sky-600 focus:outline-none"
            />
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={isLocalScanning}
                onClick={() => void handleRunLocalVectorScan()}
                className="inline-flex h-8 items-center gap-1.5 rounded border border-emerald-700 bg-emerald-700 px-3.5 text-xs font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isLocalScanning ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <ScanSearch className="h-3.5 w-3.5" />
                )}
                <span>API 키 없이 로컬 PDF 벡터 즉시 스캔 (무료)</span>
              </button>

              <button
                type="button"
                disabled={isRunning}
                onClick={() => onRunParallelAudit(focusQuery)}
                className="inline-flex h-8 items-center gap-1.5 rounded bg-sky-700 px-3.5 text-xs font-semibold text-white hover:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isRunning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                <span>Gemini 3-트랙 병렬 검증 실행</span>
              </button>

              <button
                type="button"
                disabled={isRunning || !focusQuery.trim() || selectedDrawings.length === 0}
                onClick={() => onRunFocusedQuery(focusQuery, selectedDrawings)}
                className="inline-flex h-8 items-center gap-1.5 rounded border border-slate-300 bg-white px-3 text-xs font-medium text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span>선택 도면({selectedDrawings.length}종) 단일 집중 검증</span>
              </button>
            </div>
          </div>

          <div className="space-y-2 lg:col-span-5">
            <div className="text-xs font-semibold text-slate-800">
              단일 집중 검증용 대상 도면 선택 ({selectedDrawings.length}종)
            </div>
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {H042_DRAWINGS.map((d) => {
                const checked = selectedDrawings.includes(d.id);
                return (
                  <label
                    key={d.id}
                    className={`flex cursor-pointer items-center gap-2 rounded border px-2.5 py-1.5 text-[11px] ${
                      checked
                        ? 'border-sky-600 bg-sky-50 text-sky-900'
                        : 'border-slate-200 bg-slate-50 text-slate-700'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleDrawing(d.id)}
                      className="h-3.5 w-3.5 accent-sky-700"
                    />
                    <span className="truncate font-mono">{d.id}</span>
                  </label>
                );
              })}
            </div>
            {customAttachments.length > 0 && (
              <div className="text-[11px] text-sky-800">
                사용자 업로드 PDF {customAttachments.length}건이 자동으로 함께 분석됩니다.
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Free Gemini Setup & Zero-API Guidance Callout (No API Key Form UI) */}
      <section className="rounded border border-slate-200 bg-slate-50/70 px-4 py-3 text-xs text-slate-700">
        <div className="flex flex-wrap items-center gap-2 font-semibold text-slate-900">
          <Sparkles className="h-3.5 w-3.5 text-sky-700" />
          <span>Gemini API 무료 사용 방법 vs API 키 없는 무료 분석</span>
        </div>
        <ul className="mt-1.5 list-disc space-y-1 pl-5 text-[11px] leading-relaxed text-slate-700">
          <li>
            <strong>무료 티어 Gemini API</strong>: Google AI Studio(aistudio.google.com)에서 무료 API 키를 발급받은 뒤 우측 상단{' '}
            <span className="font-mono font-semibold text-slate-900">Settings &gt; Secrets</span> 패널에{' '}
            <span className="font-mono font-semibold text-slate-900">GEMINI_API_KEY</span>로 등록하면 무료 할당량(Free Tier)으로 동작합니다. 대용량 PDF 6종을 매번 올릴 때는 위 모델 선택에서{' '}
            <span className="font-mono font-semibold text-sky-800">gemini-3.1-flash-lite</span>를 선택하면 무료 분당 토큰/요청 한도(TPM/RPM)를 가장 효율적으로 사용할 수 있습니다.
          </li>
          <li>
            <strong>API 키 없이 무료 사용</strong>: 위{' '}
            <span className="font-semibold text-emerald-800">&ldquo;API 키 없이 로컬 PDF 벡터 즉시 스캔 (무료)&rdquo;</span>
            는 외부 API 호출 없이 실제 PDF 내부 벡터 텍스트 좌표를 <span className="font-mono">Promise.all</span>로 병렬 추출하며, 결과 행을 클릭하면 해당 PDF 페이지 위치로 바로 이동하고 핀 노트를 자동 삽입합니다.
          </li>
        </ul>
      </section>

      {/* Error State (Real Server Error Propagation) */}
      {error && (
        <section
          role="alert"
          className="flex items-start gap-2.5 rounded border border-red-300 bg-red-50 p-4 text-xs text-red-900"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-700" />
          <div className="space-y-1">
            <div className="font-semibold">AI 검증 요청 실패</div>
            <p>{error}</p>
            {error.includes('GEMINI_API_KEY') && (
              <p className="text-[11px] text-red-800">
                API 키 없이 바로 도면 좌표와 불일치를 스캔하려면 위의{' '}
                <strong>&ldquo;API 키 없이 로컬 PDF 벡터 즉시 스캔 (무료)&rdquo;</strong> 버튼을 클릭하세요.
              </p>
            )}
          </div>
        </section>
      )}

      {localScanError && (
        <section
          role="alert"
          className="flex items-start gap-2.5 rounded border border-red-300 bg-red-50 p-4 text-xs text-red-900"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-700" />
          <div>
            <div className="font-semibold">로컬 PDF 벡터 스캔 실패</div>
            <p className="mt-0.5">{localScanError}</p>
          </div>
        </section>
      )}

      {/* Local Vector Audit Results (Zero-API) */}
      {localAuditResult && !isLocalScanning && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded border border-emerald-300 bg-emerald-50/70 px-4 py-2.5 text-xs">
            <div className="flex items-center gap-2 font-semibold text-emerald-950">
              <CheckCircle2 className="h-4 w-4 text-emerald-700" />
              <span>
                로컬 PDF 벡터 병렬 스캔 완료 · API 키 미사용 ({localAuditResult.totalPagesScanned}개 시트 실측 좌표 추출)
              </span>
            </div>
            <div className="font-mono text-emerald-900 tabular-nums">
              소요 {(localAuditResult.totalDurationMs / 1000).toFixed(2)}s · 3-Track Promise.all
            </div>
          </div>

          {localAuditResult.tracks.map((track) => (
            <section key={track.trackId} className="rounded border border-slate-200 bg-white">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-5 py-3">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">{track.trackName}</h3>
                  <div className="mt-0.5 font-mono text-[11px] text-slate-500">
                    스캔 페이지 {track.scannedPages}p · 검출 항목 {track.findings.length}건
                  </div>
                </div>
                <span className="font-mono text-xs text-emerald-700 tabular-nums">
                  {(track.durationMs / 1000).toFixed(2)}s · LOCAL VECTOR OK
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600">
                      <th className="px-3 py-2">심각도</th>
                      <th className="px-3 py-2">기준 태그</th>
                      <th className="px-3 py-2">검출 내용 (실측 좌표 기반)</th>
                      <th className="px-3 py-2">도면 · 좌표</th>
                      <th className="px-3 py-2 text-right">PDF 이동 · 자동 노트</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {track.findings.map((f) => (
                      <tr
                        key={f.id}
                        onClick={() => onJumpToLocalFinding(f)}
                        className="cursor-pointer align-top transition-colors hover:bg-sky-50/50"
                      >
                        <td className="px-3 py-2.5">
                          <span
                            className={`inline-block rounded border px-1.5 py-0.5 font-mono text-[10px] font-semibold ${
                              f.severity === 'CRITICAL'
                                ? 'border-red-200 bg-red-50 text-red-800'
                                : f.severity === 'WARNING'
                                  ? 'border-amber-200 bg-amber-50 text-amber-800'
                                  : 'border-sky-200 bg-sky-50 text-sky-800'
                            }`}
                          >
                            {f.severity}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 font-mono font-semibold text-slate-900">
                          {f.tag}
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="text-slate-800">{f.finding}</div>
                          <div className="mt-0.5 text-[11px] text-emerald-800">
                            권고: {f.recommendation}
                          </div>
                        </td>
                        <td className="px-3 py-2.5 font-mono text-[11px] text-slate-600 tabular-nums">
                          {f.sourceEvidence}
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onJumpToLocalFinding(f);
                            }}
                            className="inline-flex h-7 items-center gap-1 whitespace-nowrap rounded bg-sky-700 px-2.5 text-[11px] font-semibold text-white hover:bg-sky-800"
                          >
                            <MapPinPlus className="h-3 w-3" />
                            <span>PDF 위치·자동 노트</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </div>
      )}

      {/* Running State: 3 Concurrent Track Cards */}
      {isRunning && (
        <section className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {[
            '트랙 1: Regastainer(100) 병렬 감사',
            '트랙 2: HP Pump Skid(200) 병렬 감사',
            '트랙 3: 크로스 모듈 · 케이블 정합성 감사',
          ].map((label) => (
            <div key={label} className="rounded border border-sky-200 bg-white p-4">
              <div className="flex items-center gap-2 text-xs font-semibold text-sky-800">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>{label}</span>
              </div>
              <div className="mt-3 space-y-2">
                <div className="h-3 w-3/4 animate-pulse rounded bg-slate-100" />
                <div className="h-3 w-full animate-pulse rounded bg-slate-100" />
                <div className="h-3 w-5/6 animate-pulse rounded bg-slate-100" />
              </div>
            </div>
          ))}
        </section>
      )}

      {/* Gemini Results Display */}
      {result && !isRunning && (
        <div className="space-y-4">
          <div className="flex items-center justify-between rounded border border-slate-200 bg-white px-4 py-2.5 text-xs">
            <div className="flex items-center gap-2 font-semibold text-slate-900">
              <CheckCircle2 className="h-4 w-4 text-emerald-700" />
              <span>Gemini 병렬 검증 완료 · {result.tracks.length}개 트랙 동시 처리</span>
            </div>
            <div className="font-mono text-slate-600 tabular-nums">
              총 소요시간 {(result.totalDurationMs / 1000).toFixed(2)}s · {result.model} ({result.thinkingLevel})
            </div>
          </div>

          {result.tracks.map((track) => {
            const thoughtOpen = !!expandedThoughts[track.trackId];
            return (
              <section key={track.trackId} className="rounded border border-slate-200 bg-white">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-5 py-3">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">{track.trackName}</h3>
                    <div className="mt-0.5 font-mono text-[11px] text-slate-500">
                      대상 도면: {track.drawingIds.join(', ')}
                    </div>
                  </div>
                  <div className="font-mono text-xs text-slate-600 tabular-nums">
                    {(track.durationMs / 1000).toFixed(2)}s ·{' '}
                    <span className={track.status === 'COMPLETED' ? 'text-emerald-700' : 'text-red-700'}>
                      {track.status}
                    </span>
                  </div>
                </div>

                {track.status === 'ERROR' ? (
                  <div className="p-5 text-xs text-red-800">{track.error}</div>
                ) : (
                  <div className="space-y-4 p-5">
                    <p className="text-xs leading-relaxed text-slate-800">{track.summaryKo}</p>

                    {track.thoughtSummary && (
                      <div className="rounded border border-slate-200 bg-slate-50">
                        <button
                          type="button"
                          onClick={() => toggleThought(track.trackId)}
                          className="flex w-full items-center justify-between px-3 py-2 text-left text-xs font-medium text-slate-700 hover:bg-slate-100"
                        >
                          <span>Thinking 추론 요약 보기</span>
                          {thoughtOpen ? (
                            <ChevronDown className="h-3.5 w-3.5" />
                          ) : (
                            <ChevronRight className="h-3.5 w-3.5" />
                          )}
                        </button>
                        {thoughtOpen && (
                          <pre className="max-h-56 overflow-y-auto border-t border-slate-200 p-3 text-[11px] leading-relaxed whitespace-pre-wrap text-slate-700">
                            {track.thoughtSummary}
                          </pre>
                        )}
                      </div>
                    )}

                    {track.findings && track.findings.length > 0 && (
                      <div className="overflow-x-auto rounded border border-slate-200">
                        <table className="w-full border-collapse text-left text-xs">
                          <thead>
                            <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600">
                              <th className="px-3 py-2">심각도</th>
                              <th className="px-3 py-2">태그</th>
                              <th className="px-3 py-2">검출 내용</th>
                              <th className="px-3 py-2">도면 근거</th>
                              <th className="px-3 py-2">권고 조치</th>
                              <th className="px-3 py-2 text-right">PDF 이동</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200">
                            {track.findings.map((f, idx) => (
                              <tr key={idx} className="align-top">
                                <td className="px-3 py-2.5">
                                  <span
                                    className={`inline-block rounded border px-1.5 py-0.5 font-mono text-[10px] font-semibold ${
                                      f.severity === 'CRITICAL'
                                        ? 'border-red-200 bg-red-50 text-red-800'
                                        : f.severity === 'WARNING'
                                          ? 'border-amber-200 bg-amber-50 text-amber-800'
                                          : 'border-sky-200 bg-sky-50 text-sky-800'
                                    }`}
                                  >
                                    {f.severity}
                                  </span>
                                </td>
                                <td className="px-3 py-2.5 font-mono font-semibold text-slate-900">
                                  {f.tag}
                                </td>
                                <td className="px-3 py-2.5 text-slate-800">{f.finding}</td>
                                <td className="px-3 py-2.5 font-mono text-[11px] text-slate-600">
                                  {f.sourceEvidence}
                                </td>
                                <td className="px-3 py-2.5 text-slate-700">{f.recommendation}</td>
                                <td className="px-3 py-2.5 text-right">
                                  <button
                                    type="button"
                                    onClick={() => onJumpToAiFinding(f, track.drawingIds)}
                                    className="inline-flex h-7 items-center gap-1 whitespace-nowrap rounded border border-sky-600 bg-sky-700 px-2 text-[11px] font-semibold text-white hover:bg-sky-800"
                                  >
                                    <MapPinPlus className="h-3 w-3" />
                                    <span>PDF 위치·노트</span>
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
};
