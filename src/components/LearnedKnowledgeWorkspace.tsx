import React, { useState } from 'react';
import {
  BookOpenCheck,
  FileSpreadsheet,
  Plus,
  RotateCcw,
  Sparkles,
  Trash2,
} from 'lucide-react';
import {
  DiscrepancySeverity,
  LearnedEngineeringRule,
  LearnedRuleCategory,
} from '../types/diagram';
import { LEARNED_CATEGORY_LABELS } from '../utils/learnedKnowledgeEngine';

interface LearnedKnowledgeWorkspaceProps {
  learnedRules: LearnedEngineeringRule[];
  onToggleRule: (id: string) => void;
  onAddRule: (payload: {
    category: LearnedRuleCategory;
    titleKo: string;
    patternOrCondition: string;
    learnedLessonKo: string;
    posRequirementClause: string;
    severity: DiscrepancySeverity;
    tCodeOrigin: string;
  }) => void;
  onDeleteRule: (id: string) => void;
  onAutoLearnFromSession: () => number;
  onResetSeedRules: () => void;
  onProceedToPos: () => void;
}

export const LearnedKnowledgeWorkspace: React.FC<LearnedKnowledgeWorkspaceProps> = ({
  learnedRules,
  onToggleRule,
  onAddRule,
  onDeleteRule,
  onAutoLearnFromSession,
  onResetSeedRules,
  onProceedToPos,
}) => {
  const [category, setCategory] = useState<LearnedRuleCategory>('CABLE_SPEC');
  const [titleKo, setTitleKo] = useState('');
  const [patternOrCondition, setPatternOrCondition] = useState('');
  const [learnedLessonKo, setLearnedLessonKo] = useState('');
  const [posRequirementClause, setPosRequirementClause] = useState('');
  const [severity, setSeverity] = useState<DiscrepancySeverity>('CRITICAL');
  const [feedback, setFeedback] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!titleKo.trim() || !learnedLessonKo.trim()) return;
    onAddRule({
      category,
      titleKo,
      patternOrCondition: patternOrCondition || titleKo,
      learnedLessonKo,
      posRequirementClause: posRequirementClause || learnedLessonKo,
      severity,
      tCodeOrigin: 'ZP01 · USER',
    });
    setFeedback(`"${titleKo}" 규칙이 학습 지식베이스에 등록되어 스펙 검토(CL03) 및 POS 생성(ME21N)에 즉시 반영됩니다.`);
    setTitleKo('');
    setPatternOrCondition('');
    setLearnedLessonKo('');
    setPosRequirementClause('');
  };

  const activeCount = learnedRules.filter((r) => r.enabled).length;

  return (
    <div className="space-y-4">
      <section className="rounded border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span className="font-mono font-semibold text-[#005CC8]">SAP T-Code ZP01</span>
              <span aria-hidden="true">·</span>
              <span>도면·메이커·스펙 검증 학습 지식베이스 (활성 {activeCount}/{learnedRules.length}건)</span>
            </div>
            <h1 className="mt-1 text-lg font-bold tracking-tight text-slate-900">
              학습된 엔지니어링 설계 기준 및 POS 자동 반영 지식
            </h1>
            <p className="mt-0.5 text-xs text-slate-600">
              과거 H042 도면 감사·메이커 인터페이스·스펙 검토에서 학습된 규칙을 관리합니다. 활성화된 모든 규칙은 스펙 검토(CL03), 룰 검증(ZRL1), POS 발주사양서(ME21N) 필수 조항에 자동 반영됩니다.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                const added = onAutoLearnFromSession();
                setFeedback(
                  added > 0
                    ? `현재 분석 세션(메이커 도면·룰 위반)에서 신규 설계 기준 ${added}건을 자동 학습했습니다.`
                    : '현재 세션에서 이미 모든 주요 패턴이 학습되어 있습니다.'
                );
              }}
              className="inline-flex h-9 items-center gap-1.5 rounded border border-slate-300 bg-white px-3 text-xs font-medium whitespace-nowrap text-slate-700 hover:bg-slate-50"
            >
              <Sparkles className="h-3.5 w-3.5 text-[#0070F2]" />
              <span>현재 분석에서 자동 학습 추출</span>
            </button>

            <button
              type="button"
              onClick={onResetSeedRules}
              className="inline-flex h-9 items-center gap-1.5 rounded border border-slate-300 bg-white px-3 text-xs font-medium whitespace-nowrap text-slate-700 hover:bg-slate-50"
            >
              <RotateCcw className="h-3.5 w-3.5 text-slate-500" />
              <span>기본 지식 초기화</span>
            </button>

            <button
              type="button"
              onClick={onProceedToPos}
              className="inline-flex h-9 items-center gap-1.5 rounded bg-[#0070F2] px-4 text-xs font-semibold whitespace-nowrap text-white hover:bg-[#005CC8]"
            >
              <FileSpreadsheet className="h-3.5 w-3.5" />
              <span>학습 반영해 POS 생성(ME21N)</span>
            </button>
          </div>
        </div>

        {feedback && (
          <div className="mt-3 rounded border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900">
            {feedback}
          </div>
        )}
      </section>

      {/* Add New Learned Rule Form */}
      <section className="rounded border border-slate-200 bg-white p-5">
        <h2 className="flex items-center gap-1.5 text-sm font-bold text-slate-900">
          <BookOpenCheck className="h-4 w-4 text-[#0070F2]" />
          <span>새 엔지니어링 교훈·발주 기준 학습 등록</span>
        </h2>

        <form onSubmit={handleSubmit} className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <label className="block text-[11px] font-semibold text-slate-700">
              학습 분야
            </label>
            <select
              aria-label="학습 분야 선택"
              value={category}
              onChange={(e) => setCategory(e.target.value as LearnedRuleCategory)}
              className="mt-1 h-8 w-full rounded border border-slate-300 bg-white px-2.5 text-xs text-slate-800"
            >
              {(Object.keys(LEARNED_CATEGORY_LABELS) as LearnedRuleCategory[]).map((cat) => (
                <option key={cat} value={cat}>
                  {LEARNED_CATEGORY_LABELS[cat]}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[11px] font-semibold text-slate-700">
                탐지 패턴 (태그/키워드)
              </label>
              <input
                type="text"
                value={patternOrCondition}
                onChange={(e) => setPatternOrCondition(e.target.value)}
                placeholder="예: 6.6kV|CJPF 또는 SDV|ZSO"
                className="mt-1 h-8 w-full rounded border border-slate-300 px-2.5 font-mono text-xs text-slate-900"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-700">
                심각도
              </label>
              <select
                aria-label="학습 규칙 심각도"
                value={severity}
                onChange={(e) => setSeverity(e.target.value as DiscrepancySeverity)}
                className="mt-1 h-8 w-full rounded border border-slate-300 bg-white px-2.5 text-xs text-slate-800"
              >
                <option value="CRITICAL">CRITICAL (발주 필수)</option>
                <option value="WARNING">WARNING (주의 확인)</option>
                <option value="INFO">INFO (참고 기준)</option>
              </select>
            </div>
          </div>

          <div className="md:col-span-2">
            <label className="block text-[11px] font-semibold text-slate-700">
              학습 규칙 제목 *
            </label>
            <input
              type="text"
              required
              value={titleKo}
              onChange={(e) => setTitleKo(e.target.value)}
              placeholder="예: 극저온 펌프 스키드 Vendor JB GLAND M25 SUS316L 필수 포함 기준"
              className="mt-1 h-8 w-full rounded border border-slate-300 px-2.5 text-xs text-slate-900"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-700">
              도면/스펙 검증에서 학습된 원인 및 교훈 *
            </label>
            <textarea
              required
              rows={2}
              value={learnedLessonKo}
              onChange={(e) => setLearnedLessonKo(e.target.value)}
              placeholder="과거 누락 사례 및 재발 방지 검증 내용을 입력하세요..."
              className="mt-1 w-full rounded border border-slate-300 p-2 text-xs text-slate-900"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-700">
              POS 발주사양서(ME21N) 자동 삽입 조항
            </label>
            <textarea
              rows={2}
              value={posRequirementClause}
              onChange={(e) => setPosRequirementClause(e.target.value)}
              placeholder="POS 사양서에 자동으로 포함될 발주 요구 문구 (미입력 시 교훈 내용 반영)"
              className="mt-1 w-full rounded border border-slate-300 p-2 text-xs text-slate-900"
            />
          </div>

          <div className="flex justify-end md:col-span-2">
            <button
              type="submit"
              className="inline-flex h-8 items-center gap-1.5 rounded bg-slate-900 px-3.5 text-xs font-semibold text-white hover:bg-slate-800"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>지식베이스에 학습 저장</span>
            </button>
          </div>
        </form>
      </section>

      {/* Learned Rules Table */}
      <section className="overflow-hidden rounded border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-700">
                <th className="px-3.5 py-2.5 whitespace-nowrap">적용</th>
                <th className="px-3.5 py-2.5 whitespace-nowrap">코드 · 출처</th>
                <th className="px-3.5 py-2.5">학습 규칙 및 도면 교훈</th>
                <th className="px-3.5 py-2.5">POS 자동 반영 사양 문구</th>
                <th className="px-3.5 py-2.5 text-right whitespace-nowrap">관리</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {learnedRules.map((lr) => (
                <tr
                  key={lr.id}
                  className={lr.enabled ? 'hover:bg-slate-50/70' : 'bg-slate-50/60 opacity-60'}
                >
                  <td className="px-3.5 py-2.5 align-top">
                    <input
                      type="checkbox"
                      aria-label={`${lr.code} 학습 규칙 적용 토글`}
                      checked={lr.enabled}
                      onChange={() => onToggleRule(lr.id)}
                      className="mt-1 h-4 w-4 accent-[#0070F2]"
                    />
                  </td>
                  <td className="px-3.5 py-2.5 whitespace-nowrap align-top">
                    <div className="font-mono font-bold text-[#005CC8]">{lr.code}</div>
                    <div className="text-[11px] text-slate-500">{lr.categoryLabelKo}</div>
                    <div className="mt-0.5 font-mono text-[10px] text-slate-500">
                      {lr.tCodeOrigin} · {lr.severity}
                    </div>
                  </td>
                  <td className="max-w-[340px] px-3.5 py-2.5 align-top">
                    <div className="font-semibold text-slate-900">{lr.titleKo}</div>
                    <div className="mt-0.5 text-[11.5px] leading-relaxed text-slate-600">
                      {lr.learnedLessonKo}
                    </div>
                    <div className="mt-1 font-mono text-[10.5px] text-slate-500">
                      패턴: {lr.patternOrCondition}
                    </div>
                  </td>
                  <td className="max-w-[320px] px-3.5 py-2.5 text-[11.5px] leading-relaxed text-slate-800 align-top">
                    {lr.posRequirementClause}
                  </td>
                  <td className="px-3.5 py-2.5 text-right whitespace-nowrap align-top">
                    {lr.source === 'USER_LEARNED' ? (
                      <button
                        type="button"
                        onClick={() => onDeleteRule(lr.id)}
                        aria-label={`${lr.code} 삭제`}
                        className="inline-flex h-7 w-7 items-center justify-center rounded border border-slate-300 bg-white text-slate-500 hover:border-red-300 hover:text-red-700"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    ) : (
                      <span className="font-mono text-[10.5px] text-slate-400">CORE</span>
                    )}
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
