import React, { useState } from 'react';
import {
  Layers,
  GitCompare,
  GitBranch,
  FileText,
  Cpu,
  Play,
  ScanText,
  ShieldCheck,
  ClipboardCheck,
  Factory,
  Scale,
  BookOpenCheck,
  FileSpreadsheet,
  PanelLeft,
  ArrowRight,
} from 'lucide-react';

export type WorkbenchTab =
  | 'matrix'
  | 'diff'
  | 'drawing-ocr'
  | 'maker'
  | 'spec'
  | 'rules'
  | 'knowledge'
  | 'pos'
  | 'comments'
  | 'trace'
  | 'pdf'
  | 'ai';

export interface SapTCodeMeta {
  id: WorkbenchTab;
  tCode: string;
  label: string;
  group: 'ANALYSIS' | 'VERIFICATION' | 'PROCUREMENT';
  groupLabelKo: string;
  pipelineStep?: 1 | 2 | 3 | 4 | 5;
  icon: React.ComponentType<{ className?: string }>;
}

export const SAP_TCODE_META: SapTCodeMeta[] = [
  {
    id: 'drawing-ocr',
    tCode: 'CV03N',
    label: '도면·OCR 분석',
    group: 'ANALYSIS',
    groupLabelKo: '01. 도면 · 메이커 분석',
    pipelineStep: 1,
    icon: ScanText,
  },
  {
    id: 'maker',
    tCode: 'CS15',
    label: '메이커 도면·I/O 분석',
    group: 'ANALYSIS',
    groupLabelKo: '01. 도면 · 메이커 분석',
    pipelineStep: 2,
    icon: Factory,
  },
  {
    id: 'matrix',
    tCode: 'MD04',
    label: '3-Way 교차 매칭',
    group: 'ANALYSIS',
    groupLabelKo: '01. 도면 · 메이커 분석',
    icon: Layers,
  },
  {
    id: 'diff',
    tCode: 'CC03',
    label: '변경·리비전 비교',
    group: 'ANALYSIS',
    groupLabelKo: '01. 도면 · 메이커 분석',
    icon: GitCompare,
  },
  {
    id: 'spec',
    tCode: 'CL03',
    label: '스펙(Spec) 검토',
    group: 'VERIFICATION',
    groupLabelKo: '02. 스펙 · 룰 · 학습 검증',
    pipelineStep: 3,
    icon: Scale,
  },
  {
    id: 'rules',
    tCode: 'ZRL1',
    label: '엔지니어링 룰 검토',
    group: 'VERIFICATION',
    groupLabelKo: '02. 스펙 · 룰 · 학습 검증',
    icon: ShieldCheck,
  },
  {
    id: 'knowledge',
    tCode: 'ZP01',
    label: '학습된 지식베이스',
    group: 'VERIFICATION',
    groupLabelKo: '02. 스펙 · 룰 · 학습 검증',
    pipelineStep: 4,
    icon: BookOpenCheck,
  },
  {
    id: 'pos',
    tCode: 'ME21N',
    label: 'POS 발주사양서 생성',
    group: 'PROCUREMENT',
    groupLabelKo: '03. POS 발주 · 코멘트 · 증빙',
    pipelineStep: 5,
    icon: FileSpreadsheet,
  },
  {
    id: 'comments',
    tCode: 'QM02',
    label: '문제점 보고서(첨부양식)',
    group: 'PROCUREMENT',
    groupLabelKo: '03. POS 발주 · 코멘트 · 증빙',
    icon: ClipboardCheck,
  },
  {
    id: 'trace',
    tCode: 'VA03',
    label: '시그널 루프 추적',
    group: 'PROCUREMENT',
    groupLabelKo: '03. POS 발주 · 코멘트 · 증빙',
    icon: GitBranch,
  },
  {
    id: 'pdf',
    tCode: 'CV04N',
    label: '분할 PDF 도면 뷰어',
    group: 'PROCUREMENT',
    groupLabelKo: '03. POS 발주 · 코멘트 · 증빙',
    icon: FileText,
  },
  {
    id: 'ai',
    tCode: 'ZAI1',
    label: '병렬 AI 정밀 감사',
    group: 'PROCUREMENT',
    groupLabelKo: '03. POS 발주 · 코멘트 · 증빙',
    icon: Cpu,
  },
];

interface TopBarProps {
  activeTab: WorkbenchTab;
  onSelectTab: (tab: WorkbenchTab) => void;
  onToggleSidebar: () => void;
  onRunParallelAi: () => void;
  isAiRunning: boolean;
}

export const TopBar: React.FC<TopBarProps> = ({
  activeTab,
  onSelectTab,
  onToggleSidebar,
  onRunParallelAi,
  isAiRunning,
}) => {
  const [tCodeInput, setTCodeInput] = useState('');
  const [tCodeError, setTCodeError] = useState(false);

  const currentMeta =
    SAP_TCODE_META.find((m) => m.id === activeTab) || SAP_TCODE_META[0];

  const handleTCodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = tCodeInput.trim().toUpperCase();
    if (!q) return;
    const match = SAP_TCODE_META.find(
      (m) =>
        m.tCode.toUpperCase() === q ||
        m.tCode.toUpperCase().startsWith(q) ||
        m.label.includes(tCodeInput.trim())
    );
    if (match) {
      setTCodeError(false);
      setTCodeInput('');
      onSelectTab(match.id);
    } else {
      setTCodeError(true);
    }
  };

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-[#1B2A3A] text-white print:hidden">
      <div className="flex h-13 items-center justify-between gap-6 px-4">
        {/* Zone 1: Brand & Active T-Code Breadcrumb */}
        <div className="flex min-w-0 flex-1 items-center gap-2.5 md:flex-initial md:shrink-0">
          <button
            type="button"
            onClick={onToggleSidebar}
            aria-label="SAP 메뉴 트리 열기/닫기"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded border border-slate-600 bg-slate-800/70 text-slate-200 hover:bg-slate-700"
          >
            <PanelLeft className="h-4 w-4" />
          </button>

          <div className="flex min-w-0 items-center gap-1.5 whitespace-nowrap">
            <span className="shrink-0 font-mono text-xs font-bold tracking-wider text-sky-300">
              SAP · H042
            </span>
            <span className="shrink-0 text-slate-500" aria-hidden="true">
              /
            </span>
            <span className="truncate text-sm font-semibold tracking-tight text-white">
              {currentMeta.tCode} · {currentMeta.label}
            </span>
          </div>
        </div>

        {/* Zone 2: SAP T-Code Quick Command Box */}
        <form
          onSubmit={handleTCodeSubmit}
          className="hidden max-w-md flex-1 items-center gap-1.5 md:flex"
        >
          <div className="relative flex-1">
            <input
              type="text"
              aria-label="SAP T-Code 실행 입력"
              value={tCodeInput}
              onChange={(e) => {
                setTCodeInput(e.target.value);
                if (tCodeError) setTCodeError(false);
              }}
              placeholder="T-Code 실행 (CV03N, CS15, CL03, ZP01, ME21N, QM02...)"
              className={`h-8 w-full rounded border bg-slate-900/80 px-3 font-mono text-xs text-white placeholder:text-slate-400 focus:outline-none ${
                tCodeError
                  ? 'border-red-400 focus:border-red-400'
                  : 'border-slate-600 focus:border-sky-400'
              }`}
            />
          </div>
          <button
            type="submit"
            className="inline-flex h-8 shrink-0 items-center gap-1 rounded border border-slate-600 bg-slate-800 px-2.5 text-xs font-medium whitespace-nowrap text-slate-100 hover:bg-slate-700"
          >
            <span>실행</span>
            <ArrowRight className="h-3 w-3" />
          </button>
        </form>

        {/* Zone 3: 1 Primary Action */}
        <div className="flex shrink-0 items-center">
          <button
            type="button"
            onClick={onRunParallelAi}
            disabled={isAiRunning}
            className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded bg-[#0070F2] px-3.5 text-xs font-semibold whitespace-nowrap text-white transition-colors hover:bg-[#005CC8] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Play className="h-3.5 w-3.5" />
            <span>{isAiRunning ? 'AI 감사 중...' : 'AI 병렬 감사'}</span>
          </button>
        </div>
      </div>
    </header>
  );
};
