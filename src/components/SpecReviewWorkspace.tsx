import React, { useMemo, useState } from 'react';
import {
  BookOpenCheck,
  CheckCircle2,
  ExternalLink,
  FileSpreadsheet,
  Search,
} from 'lucide-react';
import {
  DiscrepancySeverity,
  SpecCheckItem,
  SpecComplianceStatus,
  SpecDiscipline,
  SpecReviewReport,
} from '../types/diagram';
import { SPEC_DISCIPLINE_LABELS } from '../utils/specReviewEngine';

interface SpecReviewWorkspaceProps {
  specReport: SpecReviewReport;
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
  onLearnFromSpecCheck: (check: SpecCheckItem) => void;
  onProceedToPos: (check?: SpecCheckItem) => void;
}

const STATUS_LABELS: Record<SpecComplianceStatus, string> = {
  PASS: '적합 (PASS)',
  NON_COMPLIANT: '스펙 불일치',
  HOLD_REQUIRED: 'HOLD 선결 필요',
};

export const SpecReviewWorkspace: React.FC<SpecReviewWorkspaceProps> = ({
  specReport,
  onJumpToDrawingPage,
  onLearnFromSpecCheck,
  onProceedToPos,
}) => {
  const [disciplineFilter, setDisciplineFilter] = useState<'ALL' | SpecDiscipline>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | SpecComplianceStatus>('ALL');
  const [query, setQuery] = useState('');
  const [learnedNotice, setLearnedNotice] = useState<string | null>(null);

  const filteredChecks = useMemo(() => {
    const q = query.trim().toLowerCase();
    return specReport.checks.filter((c) => {
      if (disciplineFilter !== 'ALL' && c.discipline !== disciplineFilter) return false;
      if (statusFilter !== 'ALL' && c.status !== statusFilter) return false;
      if (!q) return true;
      const hay = `${c.specCode} ${c.titleKo} ${c.standardRequired} ${c.observedDrawingState} ${c.affectedTags.join(' ')}`.toLowerCase();
      return hay.includes(q);
    });
  }, [specReport.checks, disciplineFilter, statusFilter, query]);

  return (
    <div className="space-y-4">
      <section className="rounded border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span className="font-mono font-semibold text-[#005CC8]">SAP T-Code CL03</span>
              <span aria-hidden="true">·</span>
              <span>선급·전장·계장·메이커 스펙 적합성 검토</span>
            </div>
            <h1 className="mt-1 text-lg font-bold tracking-tight text-slate-900">
              도면·메이커 기반 엔지니어링 스펙(Spec) 적합성 검토
            </h1>
            <p className="mt-0.5 text-xs text-slate-600">
              P&ID, GAR, iCAMS/PSDS, Power(6.6kV), 메이커 도면에서 추출된 사양을 설계 기준과 대조하고, 학습된 지식베이스(ZP01) 및 POS 발주사양서(ME21N)로 즉시 연동합니다.
            </p>
          </div>

          <button
            type="button"
            onClick={() => onProceedToPos()}
            className="inline-flex h-9 items-center gap-1.5 rounded bg-[#0070F2] px-4 text-xs font-semibold whitespace-nowrap text-white hover:bg-[#005CC8]"
          >
            <FileSpreadsheet className="h-3.5 w-3.5" />
            <span>검토 결과 기반 POS 생성(ME21N)</span>
          </button>
        </div>

        {learnedNotice && (
          <div className="mt-3 flex items-center gap-2 rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-700" />
            <span>{learnedNotice}</span>
          </div>
        )}

        {/* KPI Cards */}
        <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="rounded border border-slate-200 bg-slate-50/70 px-4 py-3">
            <div className="text-[11px] font-medium text-slate-600">전체 스펙 점검</div>
            <div className="mt-1 font-mono text-2xl font-bold text-slate-900 tabular-nums">
              {specReport.summary.total}건
            </div>
          </div>
          <div className="rounded border border-slate-200 bg-slate-50/70 px-4 py-3">
            <div className="text-[11px] font-medium text-slate-600">적합 (PASS)</div>
            <div className="mt-1 font-mono text-2xl font-bold text-emerald-700 tabular-nums">
              {specReport.summary.passed}건 ({specReport.summary.complianceRatePct}%)
            </div>
          </div>
          <div className="rounded border border-slate-200 bg-slate-50/70 px-4 py-3">
            <div className="text-[11px] font-medium text-slate-600">스펙 불일치 (수정요구)</div>
            <div className="mt-1 font-mono text-2xl font-bold text-red-700 tabular-nums">
              {specReport.summary.nonCompliant}건
            </div>
          </div>
          <div className="rounded border border-slate-200 bg-slate-50/70 px-4 py-3">
            <div className="text-[11px] font-medium text-slate-600">HOLD 선결 필요</div>
            <div className="mt-1 font-mono text-2xl font-bold text-amber-700 tabular-nums">
              {specReport.summary.holdRequired}건
            </div>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setDisciplineFilter('ALL')}
              className={`rounded px-2.5 py-1 text-xs font-medium whitespace-nowrap ${
                disciplineFilter === 'ALL'
                  ? 'bg-[#0070F2] text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              전체 분야
            </button>
            {(Object.keys(SPEC_DISCIPLINE_LABELS) as SpecDiscipline[]).map((disc) => (
              <button
                key={disc}
                type="button"
                onClick={() => setDisciplineFilter(disc)}
                className={`rounded px-2.5 py-1 text-xs font-medium whitespace-nowrap ${
                  disciplineFilter === disc
                    ? 'bg-[#0070F2] text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {SPEC_DISCIPLINE_LABELS[disc]}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="스펙 판정 상태 필터"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as 'ALL' | SpecComplianceStatus)}
              className="h-8 rounded border border-slate-300 bg-white px-2.5 text-xs text-slate-700"
            >
              <option value="ALL">전체 상태</option>
              <option value="NON_COMPLIANT">스펙 불일치만</option>
              <option value="HOLD_REQUIRED">HOLD 선결만</option>
              <option value="PASS">적합(PASS)만</option>
            </select>

            <div className="relative w-56">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                aria-label="스펙 항목 검색"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="스펙 코드·태그 검색..."
                className="h-8 w-full rounded border border-slate-300 bg-white pr-3 pl-8 text-xs text-slate-900 placeholder:text-slate-400 focus:border-[#0070F2] focus:outline-none"
              />
            </div>
          </div>
        </div>
      </section>

      {/* ALV Spec Table */}
      <section className="overflow-hidden rounded border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-700">
                <th className="px-3.5 py-2.5 whitespace-nowrap">스펙 코드 · 분야</th>
                <th className="px-3.5 py-2.5">검토 항목</th>
                <th className="px-3.5 py-2.5">설계 요구 규격 (Standard)</th>
                <th className="px-3.5 py-2.5">도면 실측 상태 (Observed)</th>
                <th className="px-3.5 py-2.5 whitespace-nowrap">판정 · 학습 연계</th>
                <th className="px-3.5 py-2.5 text-right whitespace-nowrap">조치</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredChecks.map((item) => (
                <tr key={item.id} className="hover:bg-slate-50/70">
                  <td className="px-3.5 py-2.5 whitespace-nowrap align-top">
                    <div className="font-mono font-bold text-[#005CC8]">{item.specCode}</div>
                    <div className="text-[11px] text-slate-500">{item.disciplineLabelKo}</div>
                  </td>
                  <td className="max-w-[230px] px-3.5 py-2.5 align-top">
                    <div className="font-semibold text-slate-900">{item.titleKo}</div>
                    <div className="mt-0.5 font-mono text-[10.5px] text-slate-500">
                      {item.affectedTags.join(', ')}
                    </div>
                  </td>
                  <td className="max-w-[240px] px-3.5 py-2.5 text-[11.5px] text-slate-700 align-top">
                    {item.standardRequired}
                  </td>
                  <td className="max-w-[250px] px-3.5 py-2.5 text-[11.5px] text-slate-800 align-top">
                    <div>{item.observedDrawingState}</div>
                    <div className="mt-1 text-[11px] text-[#005CC8]">
                      조치: {item.recommendationKo}
                    </div>
                  </td>
                  <td className="px-3.5 py-2.5 whitespace-nowrap align-top">
                    <div
                      className={`text-[11px] font-bold ${
                        item.status === 'PASS'
                          ? 'text-emerald-700'
                          : item.status === 'HOLD_REQUIRED'
                            ? 'text-amber-700'
                            : 'text-red-700'
                      }`}
                    >
                      {STATUS_LABELS[item.status]}
                    </div>
                    <div className="mt-0.5 font-mono text-[10.5px] text-slate-500">
                      학습 매핑:{' '}
                      {item.matchedLearnedRuleIds.length > 0
                        ? item.matchedLearnedRuleIds.join(', ')
                        : '미연결'}
                    </div>
                  </td>
                  <td className="px-3.5 py-2.5 text-right whitespace-nowrap align-top">
                    <div className="flex flex-col items-end gap-1">
                      <button
                        type="button"
                        onClick={() =>
                          onJumpToDrawingPage(item.drawingId, item.pageNum, {
                            tagRef: item.affectedTags[0] || item.specCode,
                            content: `${item.titleKo} — ${item.recommendationKo}`,
                            severity: item.severity,
                            searchTerms: item.affectedTags,
                            autoInsert: true,
                          })
                        }
                        className="inline-flex h-7 items-center gap-1 rounded border border-slate-300 bg-white px-2 text-[11px] text-slate-700 hover:border-sky-600 hover:text-sky-800"
                      >
                        <ExternalLink className="h-3 w-3" />
                        <span>{item.evidenceRef}</span>
                      </button>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            onLearnFromSpecCheck(item);
                            setLearnedNotice(
                              `${item.specCode} 스펙 검증 기준을 ZP01 학습 지식베이스에 등록했습니다.`
                            );
                          }}
                          className="inline-flex h-7 items-center gap-1 rounded border border-slate-300 bg-white px-2 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                        >
                          <BookOpenCheck className="h-3 w-3 text-[#0070F2]" />
                          <span>학습 저장</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => onProceedToPos(item)}
                          className="inline-flex h-7 items-center rounded bg-slate-900 px-2 text-[11px] font-medium text-white hover:bg-slate-700"
                        >
                          POS 반영
                        </button>
                      </div>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
