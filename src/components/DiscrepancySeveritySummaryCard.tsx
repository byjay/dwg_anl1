import React, { useMemo, useState } from 'react';
import {
  AlertOctagon,
  AlertTriangle,
  ArrowUpRight,
  Cable,
  ChevronDown,
  ChevronUp,
  Info,
  ShieldAlert,
} from 'lucide-react';
import { DiscrepancySeverity, EvaluatedLoopMatch } from '../types/diagram';
import { buildDiscrepancySeveritySummary } from '../utils/severitySummary';

interface DiscrepancySeveritySummaryCardProps {
  loops: EvaluatedLoopMatch[];
  onInspectLoop: (loopId: string) => void;
}

const SEVERITY_CONFIG: Record<
  DiscrepancySeverity,
  {
    titleKo: string;
    shortKo: string;
    barColor: string;
    activeBorder: string;
    activeBg: string;
    countText: string;
    iconBg: string;
  }
> = {
  CRITICAL: {
    titleKo: 'Critical · 심각',
    shortKo: '심각',
    barColor: 'bg-red-600',
    activeBorder: 'border-red-500',
    activeBg: 'bg-red-50/70',
    countText: 'text-red-700',
    iconBg: 'bg-red-50 text-red-700 border-red-200',
  },
  WARNING: {
    titleKo: 'Warning · 주의',
    shortKo: '주의',
    barColor: 'bg-amber-500',
    activeBorder: 'border-amber-500',
    activeBg: 'bg-amber-50/70',
    countText: 'text-amber-700',
    iconBg: 'bg-amber-50 text-amber-700 border-amber-200',
  },
  INFO: {
    titleKo: 'Info · 참고',
    shortKo: '참고',
    barColor: 'bg-sky-600',
    activeBorder: 'border-sky-500',
    activeBg: 'bg-sky-50/70',
    countText: 'text-sky-700',
    iconBg: 'bg-sky-50 text-sky-700 border-sky-200',
  },
};

function formatCompactCable(cableNo: string): string {
  if (!cableNo) return '미지정';
  const trimmed = cableNo.trim();
  if (trimmed === 'UNWIRED') return '미연결';
  if (trimmed === 'LOCAL (NO CABLE)') return '로컬';
  return trimmed.split(/\s+/)[0];
}

export const DiscrepancySeveritySummaryCard: React.FC<
  DiscrepancySeveritySummaryCardProps
> = ({ loops, onInspectLoop }) => {
  const [selectedSeverity, setSelectedSeverity] = useState<
    'ALL' | DiscrepancySeverity
  >('ALL');
  const [showList, setShowList] = useState(true);

  const severitySummary = useMemo(
    () => buildDiscrepancySeveritySummary(loops),
    [loops]
  );

  const visibleItems = useMemo(() => {
    if (selectedSeverity === 'ALL') {
      return [
        ...severitySummary.bySeverity.CRITICAL.items,
        ...severitySummary.bySeverity.WARNING.items,
        ...severitySummary.bySeverity.INFO.items,
      ];
    }
    return severitySummary.bySeverity[selectedSeverity].items;
  }, [severitySummary, selectedSeverity]);

  return (
    <section
      aria-label="설계 불일치 심각도별 검증 요약"
      className="rounded border border-slate-200 bg-white"
    >
      {/* Compact Header Row */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-2">
        <div className="flex flex-wrap items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-slate-700" />
          <h2 className="text-xs font-semibold tracking-tight text-slate-900">
            불일치 심각도 요약
          </h2>
          <span className="text-[11px] text-slate-500 tabular-nums">
            {severitySummary.totalDiscrepancies}건 · 루프 {severitySummary.affectedLoopsCount}개
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded border border-slate-200 bg-slate-100 p-0.5">
            <button
              type="button"
              onClick={() => setSelectedSeverity('ALL')}
              className={`h-6 whitespace-nowrap rounded px-2 text-[11px] font-medium transition-colors ${
                selectedSeverity === 'ALL'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              전체 ({severitySummary.totalDiscrepancies})
            </button>
            {severitySummary.buckets.map((bucket) => (
              <button
                key={bucket.severity}
                type="button"
                onClick={() => {
                  setSelectedSeverity((prev) =>
                    prev === bucket.severity ? 'ALL' : bucket.severity
                  );
                  setShowList(true);
                }}
                className={`h-6 whitespace-nowrap rounded px-2 text-[11px] font-medium tabular-nums transition-colors ${
                  selectedSeverity === bucket.severity
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {bucket.shortLabel} ({bucket.count})
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setShowList((v) => !v)}
            aria-expanded={showList}
            className="inline-flex h-7 items-center gap-1 whitespace-nowrap rounded border border-slate-200 bg-white px-2 text-[11px] font-medium text-slate-600 hover:bg-slate-50"
          >
            {showList ? (
              <ChevronUp className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )}
            <span>{showList ? '목록 접기' : '목록 펼치기'}</span>
          </button>
        </div>
      </div>

      <div className="space-y-2.5 px-4 py-3">
        {/* Stacked Ratio Bar + 3 Icon Metric Cards */}
        <div
          role="img"
          aria-label={`심각도 분포 막대: Critical ${severitySummary.bySeverity.CRITICAL.count}건, Warning ${severitySummary.bySeverity.WARNING.count}건, Info ${severitySummary.bySeverity.INFO.count}건`}
          className="flex h-2 w-full overflow-hidden rounded-xs bg-slate-100"
        >
          {severitySummary.totalDiscrepancies > 0 ? (
            severitySummary.buckets.map((bucket) => {
              if (bucket.count === 0) return null;
              const widthPct =
                (bucket.count / severitySummary.totalDiscrepancies) * 100;
              return (
                <button
                  key={bucket.severity}
                  type="button"
                  title={`${bucket.labelKo}: ${bucket.count}건 (${bucket.sharePercent}%)`}
                  onClick={() => {
                    setSelectedSeverity((prev) =>
                      prev === bucket.severity ? 'ALL' : bucket.severity
                    );
                    setShowList(true);
                  }}
                  style={{ width: `${widthPct}%` }}
                  className={`${SEVERITY_CONFIG[bucket.severity].barColor} h-full transition-opacity hover:opacity-85`}
                />
              );
            })
          ) : (
            <div className="h-full w-full bg-emerald-500" />
          )}
        </div>

        <div className="grid grid-cols-1 gap-2.5 md:grid-cols-3">
          {severitySummary.buckets.map((bucket) => {
            const cfg = SEVERITY_CONFIG[bucket.severity];
            const isSelected = selectedSeverity === bucket.severity;
            const firstItem = bucket.items[0];
            const SeverityIcon =
              bucket.severity === 'CRITICAL'
                ? AlertOctagon
                : bucket.severity === 'WARNING'
                  ? AlertTriangle
                  : Info;

            return (
              <div
                key={bucket.severity}
                className={`flex items-center justify-between gap-2 rounded border px-3 py-2 transition-colors ${
                  isSelected
                    ? `${cfg.activeBorder} ${cfg.activeBg}`
                    : 'border-slate-200 bg-slate-50/40'
                }`}
              >
                <button
                  type="button"
                  onClick={() => {
                    setSelectedSeverity((prev) =>
                      prev === bucket.severity ? 'ALL' : bucket.severity
                    );
                    setShowList(true);
                  }}
                  className="flex min-w-0 items-center gap-2.5 text-left focus:outline-none"
                >
                  <span
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded border ${cfg.iconBg}`}
                  >
                    <SeverityIcon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <div className="text-[11px] font-semibold text-slate-700">
                      {cfg.titleKo}
                    </div>
                    <div className="flex items-baseline gap-1.5">
                      <span
                        className={`font-mono text-lg font-bold tabular-nums ${cfg.countText}`}
                      >
                        {bucket.count}
                      </span>
                      <span className="text-[11px] text-slate-500 tabular-nums">
                        ({bucket.sharePercent}% · 루프 {bucket.uniqueLoopCount})
                      </span>
                    </div>
                  </div>
                </button>

                {firstItem && (
                  <button
                    type="button"
                    onClick={() => onInspectLoop(firstItem.loopId)}
                    aria-label={`${bucket.shortLabel} 최우선 루프 ${firstItem.canonicalTag} 검사 이동`}
                    className="inline-flex h-7 shrink-0 items-center gap-1 whitespace-nowrap rounded border border-slate-300 bg-white px-2 text-[11px] font-medium text-slate-700 hover:border-sky-600 hover:text-sky-800"
                  >
                    <span>대표 검사</span>
                    <ArrowUpRight className="h-3 w-3" />
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* Concise Icon + Cable Discrepancy Chips (Immediate Loop Inspection Jump) */}
        {showList &&
          (visibleItems.length === 0 ? (
            <div className="rounded border border-slate-200 bg-slate-50 px-3 py-3 text-center text-xs text-slate-600">
              선택된 심각도에 해당하는 설계 불일치 항목이 없습니다.
            </div>
          ) : (
            <div className="border-t border-slate-200 pt-2">
              <div className="grid max-h-[126px] grid-cols-1 gap-1.5 overflow-y-auto pr-0.5 md:grid-cols-2 lg:grid-cols-3">
                {visibleItems.map((item) => {
                  const cfg = SEVERITY_CONFIG[item.severity];
                  const ItemIcon =
                    item.severity === 'CRITICAL'
                      ? AlertOctagon
                      : item.severity === 'WARNING'
                        ? AlertTriangle
                        : Info;
                  const cableCode = formatCompactCable(item.primaryCableNo);

                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => onInspectLoop(item.loopId)}
                      aria-label={`${item.canonicalTag} ${item.severity} 불일치 루프 검사 이동`}
                      className="group flex items-center justify-between gap-2 rounded border border-slate-200 bg-white px-2.5 py-1.5 text-left transition-colors hover:border-sky-600 hover:bg-sky-50/40"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 text-[11px] tabular-nums">
                          <ItemIcon className={`h-3.5 w-3.5 shrink-0 ${cfg.countText}`} />
                          <span className="font-mono font-semibold text-slate-900">
                            {item.canonicalTag}
                          </span>
                          <span className="text-slate-300">·</span>
                          <span className="inline-flex items-center gap-0.5 font-mono text-[10.5px] text-slate-600">
                            <Cable className="h-3 w-3 text-sky-600" />
                            <span>{cableCode}</span>
                          </span>
                          <span className="text-slate-300">·</span>
                          <span className="font-mono text-[10.5px] text-slate-400">
                            U{item.unitCode}
                          </span>
                        </div>
                        <div className="mt-0.5 truncate text-[11px] text-slate-600">
                          {item.title}
                        </div>
                      </div>
                      <span className="inline-flex shrink-0 items-center gap-0.5 text-[11px] font-medium text-sky-700 group-hover:underline">
                        <span>검사</span>
                        <ArrowUpRight className="h-3 w-3" />
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
      </div>
    </section>
  );
};
