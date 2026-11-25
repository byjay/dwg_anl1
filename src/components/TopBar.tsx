import React from 'react';
import {
  Layers,
  GitCompare,
  GitBranch,
  FileText,
  Cpu,
  Upload,
  Play,
  ScanText,
  ShieldCheck,
} from 'lucide-react';

export type WorkbenchTab =
  | 'matrix'
  | 'diff'
  | 'drawing-ocr'
  | 'rules'
  | 'trace'
  | 'pdf'
  | 'ai';

interface TopBarProps {
  activeTab: WorkbenchTab;
  onSelectTab: (tab: WorkbenchTab) => void;
  onOpenUploadPdf: () => void;
  onRunParallelAi: () => void;
  isAiRunning: boolean;
  totalLoops: number;
  issueCount: number;
  openNoteCount: number;
  ruleViolationCount?: number;
}

const NAV_ITEMS: Array<{
  id: WorkbenchTab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'matrix', label: '교차 매칭', icon: Layers },
  { id: 'diff', label: '변경·비교', icon: GitCompare },
  { id: 'drawing-ocr', label: '도면·OCR 분석', icon: ScanText },
  { id: 'rules', label: '룰 검토', icon: ShieldCheck },
  { id: 'trace', label: '루프 추적', icon: GitBranch },
  { id: 'pdf', label: '도면 뷰어·노트', icon: FileText },
  { id: 'ai', label: 'AI 검증', icon: Cpu },
];

export const TopBar: React.FC<TopBarProps> = ({
  activeTab,
  onSelectTab,
  onOpenUploadPdf,
  onRunParallelAi,
  isAiRunning,
  totalLoops,
  issueCount,
  openNoteCount,
  ruleViolationCount = 0,
}) => {
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white">
      <div className="mx-auto flex h-14 max-w-[1440px] items-center justify-between gap-4 px-5">
        {/* Zone 1: Brand & Breadcrumb */}
        <div className="flex min-w-0 shrink-0 items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded border border-slate-900 bg-slate-900 text-xs font-semibold tracking-tight text-white">
            H42
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[13px] font-semibold tracking-tight whitespace-nowrap text-slate-900">
              <span>선박 배관·전장 다이어그램 분석기</span>
            </div>
            <div className="flex items-center gap-1.5 text-[11px] whitespace-nowrap text-slate-500 tabular-nums">
              <span>H042</span>
              <span>·</span>
              <span>루프 {totalLoops}</span>
              <span>·</span>
              <span className={issueCount > 0 ? 'font-medium text-amber-700' : 'text-emerald-700'}>
                이슈 {issueCount}
              </span>
              <span>·</span>
              <span>룰 {ruleViolationCount}</span>
              <span>·</span>
              <span>노트 {openNoteCount}</span>
            </div>
          </div>
        </div>

        {/* Zone 2: Primary Navigation */}
        <nav aria-label="주요 워크벤치 뷰" className="flex h-full min-w-0 items-center gap-0.5 overflow-x-auto">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectTab(item.id)}
                className={`relative flex h-full shrink-0 items-center gap-1.5 px-2.5 text-[12.5px] font-medium whitespace-nowrap transition-colors ${
                  active
                    ? 'text-sky-700'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" />
                <span>{item.label}</span>
                {active && (
                  <span className="absolute right-1.5 bottom-0 left-1.5 h-0.5 bg-sky-600" />
                )}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: Action Controls */}
        <div className="flex shrink-0 items-center gap-2 whitespace-nowrap">
          <button
            type="button"
            onClick={onOpenUploadPdf}
            className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded border border-slate-300 bg-white px-2.5 text-xs font-medium whitespace-nowrap text-slate-700 transition-colors hover:bg-slate-50 hover:text-slate-900"
          >
            <Upload className="h-3.5 w-3.5" />
            <span>도면 업로드</span>
          </button>
          <button
            type="button"
            onClick={onRunParallelAi}
            disabled={isAiRunning}
            className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded bg-sky-700 px-2.5 text-xs font-semibold whitespace-nowrap text-white transition-colors hover:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Play className="h-3.5 w-3.5" />
            <span>{isAiRunning ? '검증 중...' : 'AI 검증'}</span>
          </button>
        </div>
      </div>
    </header>
  );
};
