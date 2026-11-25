import React from 'react';
import {
  AlertOctagon,
  AlertTriangle,
  ArrowRight,
  Cable,
  CheckCircle2,
  Cpu,
  Crosshair,
  FileText,
  Gauge,
  Info,
  LayoutGrid,
  MapPinPlus,
  Zap,
} from 'lucide-react';
import { DiscrepancyItem, EvaluatedLoopMatch } from '../types/diagram';
import { deriveExpectedElectricalTags } from '../utils/diagramMatcher';

interface LoopTraceInspectorProps {
  loops: EvaluatedLoopMatch[];
  selectedLoopId: string;
  onSelectLoop: (id: string) => void;
  onOpenLayerInPdf: (loop: EvaluatedLoopMatch, layer: 'PID' | 'GAR' | 'DIA') => void;
  onCompareLoopInPdf: (loop: EvaluatedLoopMatch, autoInsert?: boolean) => void;
  onJumpToDiscrepancyPdf: (loop: EvaluatedLoopMatch, disc: DiscrepancyItem) => void;
  onAskAiForLoop: (loop: EvaluatedLoopMatch) => void;
}

export const LoopTraceInspector: React.FC<LoopTraceInspectorProps> = ({
  loops,
  selectedLoopId,
  onSelectLoop,
  onOpenLayerInPdf,
  onCompareLoopInPdf,
  onJumpToDiscrepancyPdf,
  onAskAiForLoop,
}) => {
  const selected = loops.find((l) => l.id === selectedLoopId) || loops[0];

  if (!selected) {
    return (
      <div className="rounded border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
        추적할 루프 데이터가 없습니다.
      </div>
    );
  }

  const derivedTags = deriveExpectedElectricalTags(selected.pid.rawTag, selected.unitCode);

  const handleCardKeyDown = (
    e: React.KeyboardEvent<HTMLDivElement>,
    layer: 'PID' | 'GAR' | 'DIA'
  ) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onOpenLayerInPdf(selected, layer);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
      {/* Left Rail: Loop Selector */}
      <aside className="rounded border border-slate-200 bg-white lg:col-span-4 xl:col-span-3">
        <div className="border-b border-slate-200 px-3.5 py-2.5">
          <div className="text-xs font-semibold text-slate-900">시그널 루프 목록</div>
          <div className="text-[11px] text-slate-500 tabular-nums">
            총 {loops.length}개 루프 · 클릭하여 3단 매칭 경로 확인
          </div>
        </div>
        <div className="max-h-[680px] divide-y divide-slate-100 overflow-y-auto">
          {loops.map((loop) => {
            const active = loop.id === selected.id;
            const hasIssues = loop.discrepancies.length > 0;
            return (
              <button
                key={loop.id}
                type="button"
                onClick={() => onSelectLoop(loop.id)}
                className={`flex w-full items-start justify-between gap-2 px-3.5 py-2.5 text-left transition-colors ${
                  active ? 'bg-sky-50' : 'hover:bg-slate-50'
                }`}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-xs font-semibold text-slate-900">
                      {loop.canonicalTag}
                    </span>
                    <span className="font-mono text-[10px] text-slate-400">
                      ({loop.unitCode})
                    </span>
                  </div>
                  <div className="truncate text-[11px] text-slate-500">{loop.serviceName}</div>
                </div>
                <span
                  className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-medium ${
                    hasIssues
                      ? 'border-red-200 bg-red-50 text-red-700'
                      : 'border-emerald-200 bg-emerald-50 text-emerald-700'
                  }`}
                >
                  {hasIssues ? `이슈 ${loop.discrepancies.length}` : '정상'}
                </span>
              </button>
            );
          })}
        </div>
      </aside>

      {/* Right Workspace: 3-Layer Signal Path Trace & Discrepancies */}
      <div className="space-y-4 lg:col-span-8 xl:col-span-9">
        {/* Selected Loop Header */}
        <section className="flex flex-wrap items-center justify-between gap-3 rounded border border-slate-200 bg-white px-5 py-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-mono text-lg font-semibold text-slate-900">
                {selected.canonicalTag}
              </h2>
              <span className="text-xs text-slate-400">·</span>
              <span className="text-sm font-medium text-slate-700">{selected.moduleName}</span>
              <span className="text-xs text-slate-400">·</span>
              <span
                className={`rounded border px-2 py-0.5 text-xs font-medium ${
                  selected.status === 'MATCHED'
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                    : 'border-red-200 bg-red-50 text-red-800'
                }`}
              >
                {selected.statusLabelKo}
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-600">{selected.serviceName}</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => onCompareLoopInPdf(selected, true)}
              className="inline-flex h-8 items-center gap-1.5 rounded border border-slate-300 bg-white px-3 text-xs font-medium text-slate-800 hover:border-sky-600 hover:bg-sky-50 hover:text-sky-900"
            >
              <FileText className="h-3.5 w-3.5" />
              <span>PDF 양측 위치·자동 노트</span>
            </button>
            <button
              type="button"
              onClick={() => onAskAiForLoop(selected)}
              className="inline-flex h-8 items-center gap-1.5 rounded bg-sky-700 px-3 text-xs font-semibold text-white hover:bg-sky-800"
            >
              <Cpu className="h-3.5 w-3.5" />
              <span>이 루프 AI 정밀 검증</span>
            </button>
          </div>
        </section>

        {/* Concise Icon + Cable Signal Continuity Schematic */}
        <section
          aria-label="시그널 루프 케이블 연결 요약"
          className="rounded border border-slate-200 bg-white px-5 py-3"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => onOpenLayerInPdf(selected, 'PID')}
              className="flex min-w-[140px] flex-1 items-center gap-2 rounded border border-slate-200 bg-slate-50/70 px-3 py-2 text-left hover:border-sky-500"
            >
              <Gauge className="h-4 w-4 shrink-0 text-sky-700" />
              <div className="min-w-0">
                <div className="text-[10px] font-semibold text-slate-500">P&amp;ID</div>
                <div className="truncate font-mono text-xs font-semibold text-slate-900">
                  {selected.pid.rawTag}
                </div>
              </div>
            </button>

            <div className="hidden items-center text-slate-400 sm:flex">
              <span className="h-0.5 w-5 bg-emerald-500" />
              <ArrowRight className="h-3.5 w-3.5 text-emerald-600" />
            </div>

            <button
              type="button"
              onClick={() => onOpenLayerInPdf(selected, 'GAR')}
              className="flex min-w-[130px] flex-1 items-center gap-2 rounded border border-slate-200 bg-slate-50/70 px-3 py-2 text-left hover:border-sky-500"
            >
              <LayoutGrid
                className={`h-4 w-4 shrink-0 ${selected.gar ? 'text-slate-700' : 'text-amber-600'}`}
              />
              <div className="min-w-0">
                <div className="text-[10px] font-semibold text-slate-500">GAR 배치</div>
                <div className="truncate font-mono text-xs font-semibold text-slate-900">
                  {selected.gar ? `Mark ${selected.gar.markupCode}` : '미표기'}
                </div>
              </div>
            </button>

            <div className="hidden items-center sm:flex">
              <span
                className={`h-0.5 w-5 ${
                  selected.status === 'MATCHED'
                    ? 'bg-emerald-500'
                    : selected.status === 'CABLE_MISSING' || selected.status === 'PID_ONLY'
                      ? 'border-t-2 border-dashed border-red-500'
                      : 'bg-amber-500'
                }`}
              />
            </div>

            <div
              className={`flex min-w-[150px] flex-1 items-center gap-2 rounded border px-3 py-2 ${
                selected.status === 'MATCHED'
                  ? 'border-emerald-200 bg-emerald-50/50'
                  : selected.status === 'CABLE_MISSING' || selected.status === 'PID_ONLY'
                    ? 'border-red-200 bg-red-50/50'
                    : 'border-amber-200 bg-amber-50/50'
              }`}
            >
              <Cable
                className={`h-4 w-4 shrink-0 ${
                  selected.status === 'MATCHED'
                    ? 'text-emerald-700'
                    : selected.status === 'CABLE_MISSING' || selected.status === 'PID_ONLY'
                      ? 'text-red-700'
                      : 'text-amber-700'
                }`}
              />
              <div className="min-w-0">
                <div className="text-[10px] font-semibold text-slate-500">케이블 · JB</div>
                <div className="truncate font-mono text-xs font-semibold text-slate-900">
                  {selected.primaryCableNo.split(/\s+/)[0]} · {selected.primaryJunctionBox}
                </div>
              </div>
            </div>

            <div className="hidden items-center text-slate-400 sm:flex">
              <ArrowRight className="h-3.5 w-3.5 text-slate-500" />
            </div>

            <button
              type="button"
              onClick={() => onOpenLayerInPdf(selected, 'DIA')}
              className="flex min-w-[140px] flex-1 items-center gap-2 rounded border border-slate-200 bg-slate-50/70 px-3 py-2 text-left hover:border-sky-500"
            >
              <Zap className="h-4 w-4 shrink-0 text-sky-700" />
              <div className="min-w-0">
                <div className="text-[10px] font-semibold text-slate-500">전장 DIA</div>
                <div className="truncate font-mono text-xs font-semibold text-slate-900">
                  {selected.primarySystem}
                </div>
              </div>
            </button>
          </div>
        </section>

        {/* 3-Layer Engineering Trace Chain (Clickable Layout Cards -> Locate in PDF + Auto Note) */}
        <section aria-label="3계층 도면 레이아웃 카드 (클릭 시 PDF 위치 이동 및 자동 노트)" className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {/* Layer 1: P&ID */}
          <div
            role="button"
            tabIndex={0}
            onClick={() => onOpenLayerInPdf(selected, 'PID')}
            onKeyDown={(e) => handleCardKeyDown(e, 'PID')}
            className="group flex cursor-pointer flex-col justify-between rounded border border-slate-200 bg-white p-4 transition-colors hover:border-sky-500 hover:bg-sky-50/20 focus:border-sky-600 focus:outline-none"
          >
            <div>
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <span className="text-[11px] font-semibold tracking-wide text-sky-800">
                  1. 공정 배관계장도 (P&ID)
                </span>
                <span className="font-mono text-[11px] text-slate-500 tabular-nums">
                  Sheet {selected.pid.sheet}
                </span>
              </div>
              <dl className="mt-3 space-y-2 text-xs">
                <div>
                  <dt className="text-[11px] text-slate-500">P&ID 표기 태그</dt>
                  <dd className="font-mono font-semibold text-slate-900">{selected.pid.rawTag}</dd>
                </div>
                <div>
                  <dt className="text-[11px] text-slate-500">연결 장비 / 라인번호</dt>
                  <dd className="font-mono text-slate-800">
                    {selected.equipmentTag}
                    {selected.pid.lineNo ? ` · ${selected.pid.lineNo}` : ''}
                  </dd>
                </div>
                <div>
                  <dt className="text-[11px] text-slate-500">표준 파생 전장 태그 규칙</dt>
                  <dd className="mt-0.5 flex flex-wrap gap-1 font-mono text-[11px] text-slate-700">
                    {derivedTags.map((dt) => (
                      <span key={dt} className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5">
                        {dt}
                      </span>
                    ))}
                  </dd>
                </div>
                {selected.pid.pidRevisionNote && (
                  <div className="rounded border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-900">
                    {selected.pid.pidRevisionNote}
                  </div>
                )}
              </dl>
            </div>
            <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2 text-[11px] font-semibold text-sky-700 group-hover:text-sky-900">
              <span className="inline-flex items-center gap-1">
                <Crosshair className="h-3 w-3" />
                <span>클릭: P&ID 위치 찾아 자동 노트 삽입</span>
              </span>
              <ArrowRight className="h-3 w-3" />
            </div>
          </div>

          {/* Layer 2: GAR */}
          <div
            role="button"
            tabIndex={0}
            onClick={() => onOpenLayerInPdf(selected, 'GAR')}
            onKeyDown={(e) => handleCardKeyDown(e, 'GAR')}
            className="group flex cursor-pointer flex-col justify-between rounded border border-slate-200 bg-white p-4 transition-colors hover:border-sky-500 hover:bg-sky-50/20 focus:border-sky-600 focus:outline-none"
          >
            <div>
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <span className="text-[11px] font-semibold tracking-wide text-slate-800">
                  2. 배관배치도 (GAR · SEASTAR)
                </span>
                <span className="font-mono text-[11px] text-slate-500 tabular-nums">
                  {selected.gar ? `Sheet ${selected.gar.sheet}` : 'N/A'}
                </span>
              </div>
              {selected.gar ? (
                <dl className="mt-3 space-y-2 text-xs">
                  <div>
                    <dt className="text-[11px] text-slate-500">SEASTAR 마크업 분류</dt>
                    <dd className="font-mono font-semibold text-slate-900">
                      Mark {selected.gar.markupCode} · {selected.gar.markupLabel}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[11px] text-slate-500">설치 위치 (Deck / Skid)</dt>
                    <dd className="text-slate-800">{selected.gar.deckLocation}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] text-slate-500">도면 마킹 케이블</dt>
                    <dd className="font-mono text-slate-800">
                      {selected.gar.annotatedCableNo || '미기재'}{' '}
                      {selected.gar.annotatedCableType ? `(${selected.gar.annotatedCableType})` : ''}
                    </dd>
                  </div>
                  {selected.gar.equipmentLabelOnGar && (
                    <div className="rounded border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-900">
                      GAR 콜아웃: {selected.gar.equipmentLabelOnGar}
                    </div>
                  )}
                </dl>
              ) : (
                <div className="mt-4 text-xs text-slate-500">
                  해당 태그는 GAR(배관배치도) 마크업 목록에서 확인되지 않거나 전장/외부 모듈 전용 신호입니다.
                </div>
              )}
            </div>
            <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2 text-[11px] font-semibold text-sky-700 group-hover:text-sky-900">
              <span className="inline-flex items-center gap-1">
                <Crosshair className="h-3 w-3" />
                <span>클릭: GAR 위치 찾아 자동 노트 삽입</span>
              </span>
              <ArrowRight className="h-3 w-3" />
            </div>
          </div>

          {/* Layer 3: Electrical DIA-0001 / DIA-0002 */}
          <div
            role="button"
            tabIndex={0}
            onClick={() => onOpenLayerInPdf(selected, 'DIA')}
            onKeyDown={(e) => handleCardKeyDown(e, 'DIA')}
            className="group flex cursor-pointer flex-col justify-between rounded border border-slate-200 bg-white p-4 transition-colors hover:border-sky-500 hover:bg-sky-50/20 focus:border-sky-600 focus:outline-none"
          >
            <div>
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <span className="text-[11px] font-semibold tracking-wide text-slate-800">
                  3. 전장 케이블 결선도 (DIA)
                </span>
                <span className="font-mono text-[11px] text-slate-500 tabular-nums">
                  {selected.electricalPaths[0]
                    ? `${selected.electricalPaths[0].blockSheet} / ${selected.electricalPaths[0].connectionSheet}`
                    : '미연결'}
                </span>
              </div>
              {selected.electricalPaths.length > 0 ? (
                <div className="mt-3 space-y-3">
                  {selected.electricalPaths.map((ep, idx) => (
                    <dl key={idx} className="space-y-2 text-xs">
                      <div>
                        <dt className="text-[11px] text-slate-500">전장 태그 ({ep.system})</dt>
                        <dd className="font-mono font-semibold text-slate-900">{ep.electricalTag}</dd>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5 rounded border border-slate-200 bg-slate-50 p-2 font-mono text-[11px] text-slate-800">
                        <span>{ep.fieldCableNo}</span>
                        <ArrowRight className="h-3 w-3 shrink-0 text-slate-400" />
                        <span>{ep.junctionBox}</span>
                        <ArrowRight className="h-3 w-3 shrink-0 text-slate-400" />
                        <span>{ep.rackRoomCabinet}</span>
                      </div>
                      <div>
                        <dt className="text-[11px] text-slate-500">Trunk Cable & 단자대</dt>
                        <dd className="font-mono text-slate-700">
                          {ep.trunkCableNo}
                          {ep.jbTerminal ? ` · ${ep.jbTerminal}` : ''}
                        </dd>
                      </div>
                      {(ep.blockDiagramTagNote || ep.blockDiagramJbNote || ep.blockDiagramCableNote) && (
                        <div className="rounded border border-red-200 bg-red-50 p-2 text-[11px] text-red-900">
                          {ep.blockDiagramTagNote || ep.blockDiagramJbNote || ep.blockDiagramCableNote}
                        </div>
                      )}
                    </dl>
                  ))}
                </div>
              ) : (
                <div className="mt-4 text-xs text-slate-500">
                  iCAMS(DIA-0001) 또는 PSDS(DIA-0002) 결선 테이블에 연결된 케이블 경로가 없습니다.
                </div>
              )}
            </div>
            <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2 text-[11px] font-semibold text-sky-700 group-hover:text-sky-900">
              <span className="inline-flex items-center gap-1">
                <Crosshair className="h-3 w-3" />
                <span>클릭: 전장 DIA 위치 찾아 자동 노트 삽입</span>
              </span>
              <ArrowRight className="h-3 w-3" />
            </div>
          </div>
        </section>

        {/* Discrepancy & Action Report */}
        <section className="rounded border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-5 py-3">
            <h3 className="text-sm font-semibold text-slate-900">
              검출된 불일치 및 설계 권고 사항 ({selected.discrepancies.length}건)
            </h3>
          </div>
          {selected.discrepancies.length === 0 ? (
            <div className="flex items-center gap-2.5 px-5 py-6 text-xs text-emerald-800">
              <CheckCircle2 className="h-4 w-4 text-emerald-700" />
              <span>
                P&ID, GAR 마크업, 전장 블록도 및 결선 테이블 간 태그·유닛·케이블 정합성이 모두 일치합니다.
              </span>
            </div>
          ) : (
            <div className="divide-y divide-slate-200">
              {selected.discrepancies.map((disc) => (
                <div key={disc.id} className="space-y-2 px-5 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      {disc.severity === 'CRITICAL' ? (
                        <AlertOctagon className="h-4 w-4 text-red-600" />
                      ) : disc.severity === 'WARNING' ? (
                        <AlertTriangle className="h-4 w-4 text-amber-600" />
                      ) : (
                        <Info className="h-4 w-4 text-sky-600" />
                      )}
                      <span className="text-xs font-semibold text-slate-900">{disc.title}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-[11px] text-slate-500">
                        {disc.affectedDrawings.join(' · ')}
                      </span>
                      <button
                        type="button"
                        onClick={() => onJumpToDiscrepancyPdf(selected, disc)}
                        className="inline-flex h-7 items-center gap-1 rounded border border-sky-600 bg-sky-700 px-2.5 text-[11px] font-semibold text-white hover:bg-sky-800"
                      >
                        <MapPinPlus className="h-3 w-3" />
                        <span>PDF 위치 찾아 자동 노트 삽입</span>
                      </button>
                    </div>
                  </div>
                  <p className="text-xs leading-relaxed text-slate-700">{disc.description}</p>
                  <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-800">
                    <span className="font-semibold text-sky-800">권고 조치: </span>
                    {disc.recommendedAction}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
