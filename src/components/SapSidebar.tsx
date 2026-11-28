import React from 'react';
import { SAP_TCODE_META, WorkbenchTab } from './TopBar';
import { X } from 'lucide-react';

interface SapSidebarProps {
  activeTab: WorkbenchTab;
  onSelectTab: (tab: WorkbenchTab) => void;
  isOpen: boolean;
  onCloseMobile: () => void;
  counts: {
    totalLoops: number;
    issueCount: number;
    makerCount: number;
    specHoldOrFailCount: number;
    learnedRuleCount: number;
    ruleViolationCount: number;
    commentSheetCount: number;
    openNoteCount: number;
  };
}

const PIPELINE_STEPS: Array<{
  step: number;
  tCode: string;
  titleKo: string;
  tab: WorkbenchTab;
}> = [
  { step: 1, tCode: 'CV03N', titleKo: '도면 분석', tab: 'drawing-ocr' },
  { step: 2, tCode: 'CS15', titleKo: '메이커 분석', tab: 'maker' },
  { step: 3, tCode: 'CL03', titleKo: '스펙 검토', tab: 'spec' },
  { step: 4, tCode: 'ZP01', titleKo: '지식 학습', tab: 'knowledge' },
  { step: 5, tCode: 'ME21N', titleKo: 'POS 생성', tab: 'pos' },
];

export const SapSidebar: React.FC<SapSidebarProps> = ({
  activeTab,
  onSelectTab,
  isOpen,
  onCloseMobile,
  counts,
}) => {
  if (!isOpen) return null;

  const getBadgeText = (tab: WorkbenchTab): string | null => {
    switch (tab) {
      case 'matrix':
        return `${counts.totalLoops}`;
      case 'maker':
        return `${counts.makerCount}`;
      case 'spec':
        return counts.specHoldOrFailCount > 0 ? `${counts.specHoldOrFailCount}건` : 'OK';
      case 'rules':
        return `${counts.ruleViolationCount}`;
      case 'knowledge':
        return `${counts.learnedRuleCount}`;
      case 'comments':
        return `${counts.commentSheetCount}장`;
      case 'pdf':
        return `${counts.openNoteCount}`;
      case 'checklist':
        return '99';
      default:
        return null;
    }
  };

  const groups: Array<'ANALYSIS' | 'VERIFICATION' | 'PROCUREMENT'> = [
    'ANALYSIS',
    'VERIFICATION',
    'PROCUREMENT',
  ];

  return (
    <>
      {/* Mobile Backdrop (below sticky 52px header) */}
      <div
        className="fixed inset-x-0 top-13 bottom-0 z-20 bg-slate-900/40 lg:hidden print:hidden"
        onClick={onCloseMobile}
        aria-hidden="true"
      />

      <aside
        aria-label="SAP 엔지니어링 모듈 탐색기"
        className="fixed top-13 bottom-0 left-0 z-30 flex w-[252px] shrink-0 flex-col border-r border-slate-200 bg-white lg:static lg:inset-auto lg:z-auto print:hidden"
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-3.5 py-2.5 lg:hidden">
          <span className="font-mono text-xs font-bold text-slate-900">SAP Easy Access</span>
          <button
            type="button"
            onClick={onCloseMobile}
            aria-label="메뉴 닫기"
            className="rounded p-1 text-slate-500 hover:bg-slate-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* End-to-End 5-Stage Engineering-to-POS Flow */}
        <div className="border-b border-slate-200 bg-slate-50/70 px-3 py-3">
          <div className="mb-2 text-[11px] font-bold tracking-tight text-slate-700">
            설계 → 스펙 → 학습 → POS 워크플로우
          </div>
          <div className="space-y-1">
            {PIPELINE_STEPS.map((st) => {
              const active = activeTab === st.tab;
              return (
                <button
                  key={st.tCode}
                  type="button"
                  onClick={() => {
                    onSelectTab(st.tab);
                    onCloseMobile();
                  }}
                  className={`flex w-full items-center justify-between rounded px-2 py-1 text-left text-[11.5px] transition-colors ${
                    active
                      ? 'bg-[#0070F2] font-semibold text-white'
                      : 'text-slate-700 hover:bg-slate-200/60'
                  }`}
                >
                  <span className="truncate">
                    {st.step}. {st.titleKo}
                  </span>
                  <span
                    className={`font-mono text-[10px] tabular-nums ${
                      active ? 'text-sky-100' : 'text-slate-500'
                    }`}
                  >
                    {st.tCode}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* SAP Easy Access Tree */}
        <nav className="flex-1 space-y-4 overflow-y-auto px-2.5 py-3">
          {groups.map((grp) => {
            const items = SAP_TCODE_META.filter((m) => m.group === grp);
            const groupLabel = items[0]?.groupLabelKo || grp;
            return (
              <div key={grp}>
                <div className="px-2 pb-1 text-[11px] font-bold text-slate-500">
                  {groupLabel}
                </div>
                <div className="space-y-0.5">
                  {items.map((item) => {
                    const Icon = item.icon;
                    const active = activeTab === item.id;
                    const metricText = getBadgeText(item.id);
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          onSelectTab(item.id);
                          onCloseMobile();
                        }}
                        className={`flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-xs transition-colors ${
                          active
                            ? 'bg-sky-50 font-semibold text-[#005CC8]'
                            : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                        }`}
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <Icon
                            className={`h-3.5 w-3.5 shrink-0 ${
                              active ? 'text-[#0070F2]' : 'text-slate-500'
                            }`}
                          />
                          <span className="truncate">{item.label}</span>
                        </span>
                        <span className="flex shrink-0 items-center gap-1.5 font-mono text-[10px] tabular-nums text-slate-500">
                          {metricText && <span>{metricText}</span>}
                          <span className={active ? 'font-bold text-[#005CC8]' : ''}>
                            {item.tCode}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </nav>

        {/* Quiet Project Footer */}
        <div className="border-t border-slate-200 px-3.5 py-2.5 text-[11px] text-slate-500 tabular-nums">
          <div>H042 · 루프 {counts.totalLoops} · 이슈 {counts.issueCount}</div>
        </div>
      </aside>
    </>
  );
};
