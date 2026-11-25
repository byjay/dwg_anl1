import React, { useMemo, useState } from 'react';
import {
  ShieldCheck,
  MapPinPlus,
  Plus,
  Trash2,
  Search,
  AlertOctagon,
  AlertTriangle,
  Info,
} from 'lucide-react';
import {
  DiscrepancySeverity,
  RuleViolationHit,
  VerificationRule,
} from '../types/diagram';

interface RuleReviewWorkspaceProps {
  rules: VerificationRule[];
  onToggleRule: (ruleId: string) => void;
  onChangeRuleSeverity: (ruleId: string, severity: DiscrepancySeverity) => void;
  onAddCustomRule: (rule: VerificationRule) => void;
  onDeleteCustomRule: (ruleId: string) => void;
  violations: RuleViolationHit[];
  extractedEntityCount: number;
  onOpenDeepAnalyzer: () => void;
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

const SOURCE_LABELS: Record<RuleViolationHit['source'], string> = {
  MODEL: '교차 루프 모델',
  VECTOR_PDF: 'PDF 벡터 추출',
  OCR: '이미지 OCR',
};

export const RuleReviewWorkspace: React.FC<RuleReviewWorkspaceProps> = ({
  rules,
  onToggleRule,
  onChangeRuleSeverity,
  onAddCustomRule,
  onDeleteCustomRule,
  violations,
  extractedEntityCount,
  onOpenDeepAnalyzer,
  onJumpToDrawingPage,
}) => {
  const [ruleFilter, setRuleFilter] = useState<string>('ALL');
  const [severityFilter, setSeverityFilter] = useState<'ALL' | DiscrepancySeverity>('ALL');
  const [sourceFilter, setSourceFilter] = useState<'ALL' | RuleViolationHit['source']>('ALL');
  const [query, setQuery] = useState('');

  // Custom rule builder
  const [customName, setCustomName] = useState('');
  const [customRegex, setCustomRegex] = useState('');
  const [customSeverity, setCustomSeverity] = useState<DiscrepancySeverity>('WARNING');
  const [customError, setCustomError] = useState<string | null>(null);

  const hitCountByRule = useMemo(() => {
    const map = new Map<string, number>();
    for (const v of violations) {
      map.set(v.ruleId, (map.get(v.ruleId) || 0) + 1);
    }
    return map;
  }, [violations]);

  const filteredViolations = useMemo(() => {
    const q = query.trim().toLowerCase();
    return violations.filter((v) => {
      if (ruleFilter !== 'ALL' && v.ruleId !== ruleFilter) return false;
      if (severityFilter !== 'ALL' && v.severity !== severityFilter) return false;
      if (sourceFilter !== 'ALL' && v.source !== sourceFilter) return false;
      if (!q) return true;
      return (
        v.tagOrTarget.toLowerCase().includes(q) ||
        v.evidence.toLowerCase().includes(q) ||
        v.ruleNameKo.toLowerCase().includes(q) ||
        (v.drawingId || '').toLowerCase().includes(q)
      );
    });
  }, [violations, ruleFilter, severityFilter, sourceFilter, query]);

  const activeRuleCount = rules.filter((r) => r.enabled).length;
  const criticalCount = violations.filter((v) => v.severity === 'CRITICAL').length;
  const warningCount = violations.filter((v) => v.severity === 'WARNING').length;
  const pdfOrOcrCount = violations.filter((v) => v.source !== 'MODEL').length;

  const handleCreateCustomRule = (e: React.FormEvent) => {
    e.preventDefault();
    const name = customName.trim();
    const regex = customRegex.trim();
    if (!name || !regex) {
      setCustomError('룰 이름과 정규식 패턴을 모두 입력해 주세요.');
      return;
    }
    try {
      new RegExp(regex, 'i');
    } catch {
      setCustomError('유효한 JavaScript 정규식 문법이 아닙니다.');
      return;
    }

    setCustomError(null);
    const customCount = rules.filter((r) => r.isCustom).length + 1;
    onAddCustomRule({
      id: `CUSTOM-${Date.now()}`,
      code: `RULE-C${String(customCount).padStart(2, '0')}`,
      nameKo: name,
      category: 'CUSTOM_REGEX',
      descriptionKo: `사용자 정규식 패턴 /${regex}/i 매칭 검사`,
      checkScope: 'PDF_CONTENT_SCAN',
      defaultSeverity: customSeverity,
      enabled: true,
      isCustom: true,
      customRegex: regex,
    });
    setCustomName('');
    setCustomRegex('');
  };

  return (
    <div className="space-y-4">
      {/* KPI Summary Bar */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <div className="rounded border border-slate-200 bg-white px-4 py-3">
          <div className="text-[11px] text-slate-500">활성 검증 룰</div>
          <div className="mt-0.5 font-mono text-lg font-semibold text-slate-900 tabular-nums">
            {activeRuleCount} / {rules.length}
          </div>
        </div>
        <div className="rounded border border-slate-200 bg-white px-4 py-3">
          <div className="text-[11px] text-slate-500">총 위반 검출</div>
          <div className="mt-0.5 font-mono text-lg font-semibold text-slate-900 tabular-nums">
            {violations.length}
          </div>
        </div>
        <div className="rounded border border-slate-200 bg-white px-4 py-3">
          <div className="text-[11px] text-slate-500">CRITICAL</div>
          <div className="mt-0.5 font-mono text-lg font-semibold text-red-700 tabular-nums">
            {criticalCount}
          </div>
        </div>
        <div className="rounded border border-slate-200 bg-white px-4 py-3">
          <div className="text-[11px] text-slate-500">WARNING</div>
          <div className="mt-0.5 font-mono text-lg font-semibold text-amber-700 tabular-nums">
            {warningCount}
          </div>
        </div>
        <div className="rounded border border-slate-200 bg-white px-4 py-3">
          <div className="text-[11px] text-slate-500">PDF·OCR 실물 검출</div>
          <div className="mt-0.5 font-mono text-lg font-semibold text-sky-800 tabular-nums">
            {pdfOrOcrCount}
          </div>
        </div>
      </section>

      {/* Rule Catalog + Custom Regex Builder */}
      <section className="rounded border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div>
            <h1 className="text-sm font-semibold text-slate-900">
              엔지니어링 검증 룰 세트 검토 및 가중치 설정
            </h1>
            <p className="text-xs text-slate-500">
              각 룰의 활성 여부와 심각도를 조정하거나, 추출된 도면 텍스트(현재 {extractedEntityCount.toLocaleString()}건)를 대상으로 커스텀 정규식 룰을 추가하세요.
            </p>
          </div>
          {extractedEntityCount === 0 && (
            <button
              type="button"
              onClick={onOpenDeepAnalyzer}
              className="h-8 rounded border border-sky-300 bg-sky-50 px-3 text-xs font-semibold text-sky-800 hover:bg-sky-100"
            >
              도면·OCR 심층 추출 먼저 실행하기
            </button>
          )}
        </div>

        <div className="mt-3 overflow-x-auto rounded border border-slate-200">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600">
                <th className="w-14 px-3 py-2 text-center">활성</th>
                <th className="w-24 px-3 py-2">룰 코드</th>
                <th className="px-3 py-2">규칙명 및 검증 내용</th>
                <th className="w-32 px-3 py-2">심각도 설정</th>
                <th className="w-24 px-3 py-2 text-right">검출 건수</th>
                <th className="w-16 px-3 py-2 text-center">관리</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {rules.map((rule) => {
                const count = hitCountByRule.get(rule.id) || 0;
                return (
                  <tr
                    key={rule.id}
                    className={rule.enabled ? 'bg-white' : 'bg-slate-50 text-slate-400'}
                  >
                    <td className="px-3 py-2 text-center">
                      <input
                        type="checkbox"
                        aria-label={`${rule.code} 활성화`}
                        checked={rule.enabled}
                        onChange={() => onToggleRule(rule.id)}
                        className="h-3.5 w-3.5 accent-sky-700"
                      />
                    </td>
                    <td className="px-3 py-2 font-mono font-semibold text-slate-800">
                      {rule.code}
                    </td>
                    <td className="px-3 py-2">
                      <div className="font-medium text-slate-900">{rule.nameKo}</div>
                      <div className="text-[11px] text-slate-500">{rule.descriptionKo}</div>
                    </td>
                    <td className="px-3 py-2">
                      <select
                        aria-label={`${rule.code} 심각도`}
                        value={rule.defaultSeverity}
                        onChange={(e) =>
                          onChangeRuleSeverity(
                            rule.id,
                            e.target.value as DiscrepancySeverity
                          )
                        }
                        className="h-7 rounded border border-slate-300 bg-white px-2 text-[11px] font-medium text-slate-800"
                      >
                        <option value="CRITICAL">CRITICAL</option>
                        <option value="WARNING">WARNING</option>
                        <option value="INFO">INFO</option>
                      </select>
                    </td>
                    <td className="px-3 py-2 text-right font-mono font-semibold tabular-nums">
                      <button
                        type="button"
                        onClick={() =>
                          setRuleFilter((prev) => (prev === rule.id ? 'ALL' : rule.id))
                        }
                        className="text-sky-700 hover:underline"
                      >
                        {count}건
                      </button>
                    </td>
                    <td className="px-3 py-2 text-center">
                      {rule.isCustom ? (
                        <button
                          type="button"
                          aria-label={`${rule.code} 삭제`}
                          onClick={() => onDeleteCustomRule(rule.id)}
                          className="inline-flex h-7 w-7 items-center justify-center rounded text-slate-500 hover:bg-red-50 hover:text-red-700"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      ) : (
                        <span className="text-[11px] text-slate-400">기본</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Custom Regex Rule Builder */}
        <form
          onSubmit={handleCreateCustomRule}
          className="mt-3 flex flex-wrap items-end gap-2 rounded border border-slate-200 bg-slate-50 p-3"
        >
          <div className="min-w-[180px] flex-1">
            <label htmlFor="custom-rule-name" className="mb-1 block text-[11px] font-semibold text-slate-600">
              커스텀 검증 룰 이름
            </label>
            <input
              id="custom-rule-name"
              type="text"
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              placeholder="예: 미확정 HOLD/XXX 또는 구형 리비전 탐지"
              className="h-8 w-full rounded border border-slate-300 bg-white px-2.5 text-xs text-slate-900"
            />
          </div>
          <div className="min-w-[200px] flex-1">
            <label htmlFor="custom-rule-regex" className="mb-1 block text-[11px] font-semibold text-slate-600">
              매칭 정규식 (도면 추출·OCR 텍스트 대상)
            </label>
            <input
              id="custom-rule-regex"
              type="text"
              value={customRegex}
              onChange={(e) => setCustomRegex(e.target.value)}
              placeholder="예: HOLD|XXX|PEIT-111E|RC03208"
              className="h-8 w-full rounded border border-slate-300 bg-white px-2.5 font-mono text-xs text-slate-900"
            />
          </div>
          <div className="w-32">
            <label htmlFor="custom-rule-sev" className="mb-1 block text-[11px] font-semibold text-slate-600">
              심각도
            </label>
            <select
              id="custom-rule-sev"
              value={customSeverity}
              onChange={(e) => setCustomSeverity(e.target.value as DiscrepancySeverity)}
              className="h-8 w-full rounded border border-slate-300 bg-white px-2 text-xs text-slate-800"
            >
              <option value="CRITICAL">CRITICAL</option>
              <option value="WARNING">WARNING</option>
              <option value="INFO">INFO</option>
            </select>
          </div>
          <button
            type="submit"
            className="inline-flex h-8 items-center gap-1 rounded bg-slate-900 px-3 text-xs font-semibold text-white hover:bg-slate-800"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>커스텀 룰 추가</span>
          </button>
          {customError && (
            <div className="w-full text-xs text-red-700">{customError}</div>
          )}
        </form>
      </section>

      {/* Rule Violation Review Ledger */}
      <section className="rounded border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[220px]">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                aria-label="룰 위반 내역 검색"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="태그, 도면번호, 근거 검색..."
                className="h-8 w-full rounded border border-slate-300 bg-white pr-3 pl-8 text-xs text-slate-900"
              />
            </div>
            <select
              aria-label="룰 필터"
              value={ruleFilter}
              onChange={(e) => setRuleFilter(e.target.value)}
              className="h-8 rounded border border-slate-300 bg-white px-2.5 text-xs text-slate-700"
            >
              <option value="ALL">전체 룰 ({violations.length})</option>
              {rules.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.code} · {r.nameKo} ({hitCountByRule.get(r.id) || 0})
                </option>
              ))}
            </select>
            <select
              aria-label="출처 필터"
              value={sourceFilter}
              onChange={(e) =>
                setSourceFilter(e.target.value as 'ALL' | RuleViolationHit['source'])
              }
              className="h-8 rounded border border-slate-300 bg-white px-2.5 text-xs text-slate-700"
            >
              <option value="ALL">전체 출처</option>
              <option value="MODEL">교차 루프 모델</option>
              <option value="VECTOR_PDF">PDF 벡터 추출</option>
              <option value="OCR">이미지 OCR</option>
            </select>
            <select
              aria-label="위반 심각도 필터"
              value={severityFilter}
              onChange={(e) =>
                setSeverityFilter(e.target.value as 'ALL' | DiscrepancySeverity)
              }
              className="h-8 rounded border border-slate-300 bg-white px-2.5 text-xs text-slate-700"
            >
              <option value="ALL">전체 심각도</option>
              <option value="CRITICAL">CRITICAL</option>
              <option value="WARNING">WARNING</option>
              <option value="INFO">INFO</option>
            </select>
          </div>
          <span className="text-xs text-slate-500 tabular-nums">
            검출 {filteredViolations.length}건
          </span>
        </div>

        <div className="divide-y divide-slate-200">
          {filteredViolations.length > 0 ? (
            filteredViolations.slice(0, 150).map((hit) => (
              <div
                key={hit.id}
                className="flex flex-wrap items-start justify-between gap-3 px-4 py-3 hover:bg-slate-50/70"
              >
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span
                      className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[10px] font-semibold ${
                        hit.severity === 'CRITICAL'
                          ? 'border-red-200 bg-red-50 text-red-800'
                          : hit.severity === 'WARNING'
                            ? 'border-amber-200 bg-amber-50 text-amber-800'
                            : 'border-sky-200 bg-sky-50 text-sky-800'
                      }`}
                    >
                      {hit.severity === 'CRITICAL' ? (
                        <AlertOctagon className="h-3 w-3" />
                      ) : hit.severity === 'WARNING' ? (
                        <AlertTriangle className="h-3 w-3" />
                      ) : (
                        <Info className="h-3 w-3" />
                      )}
                      <span>{hit.severity}</span>
                    </span>
                    <span className="font-mono font-semibold text-slate-700">
                      {hit.ruleCode}
                    </span>
                    <span className="text-slate-300">·</span>
                    <span className="font-mono font-semibold text-slate-900">
                      {hit.tagOrTarget}
                    </span>
                    <span className="text-slate-300">·</span>
                    <span className="text-slate-600">{SOURCE_LABELS[hit.source]}</span>
                    {hit.drawingId && (
                      <>
                        <span className="text-slate-300">·</span>
                        <span className="font-mono text-sky-800">
                          {hit.drawingId} p.{hit.pageNum}
                        </span>
                      </>
                    )}
                  </div>
                  <p className="text-xs text-slate-800">{hit.evidence}</p>
                  <p className="text-[11px] text-slate-500">
                    <strong className="text-sky-800">권고 조치:</strong> {hit.recommendation}
                  </p>
                </div>

                {hit.drawingId && hit.pageNum && (
                  <button
                    type="button"
                    onClick={() =>
                      onJumpToDrawingPage(hit.drawingId!, hit.pageNum!, {
                        tagRef: hit.tagOrTarget,
                        severity: hit.severity,
                        content: `[${hit.ruleCode}] ${hit.evidence} — ${hit.recommendation}`,
                        searchTerms: [hit.tagOrTarget],
                        autoInsert: true,
                      })
                    }
                    className="inline-flex h-8 shrink-0 items-center gap-1 rounded bg-sky-700 px-3 text-xs font-semibold text-white hover:bg-sky-800"
                  >
                    <MapPinPlus className="h-3.5 w-3.5" />
                    <span>PDF 위치 찾아 자동 노트 삽입</span>
                  </button>
                )}
              </div>
            ))
          ) : (
            <div className="flex flex-col items-center gap-2 px-4 py-10 text-center text-xs text-slate-500">
              <ShieldCheck className="h-6 w-6 text-emerald-600" />
              <span>현재 필터 조건에 해당하는 룰 위반 항목이 없습니다.</span>
            </div>
          )}
        </div>
      </section>
    </div>
  );
};
