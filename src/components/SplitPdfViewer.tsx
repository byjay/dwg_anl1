import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import {
  Upload,
  ExternalLink,
  FileCheck2,
  Trash2,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Loader2,
  MapPinPlus,
  StickyNote,
  Check,
  Download,
  RotateCcw,
  X,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronUp,
  ListChecks,
  ArrowRightLeft,
  Crosshair,
  Users,
  Radio,
  Copy,
  Navigation,
  Pause,
  Play,
} from 'lucide-react';
import { H042_DRAWINGS } from '../data/h042Dataset';
import {
  CustomPdfAttachment,
  DiscrepancySeverity,
  DrawingPinNote,
  EvaluatedLoopMatch,
  NoteStatus,
  UnitCode,
} from '../types/diagram';
import {
  exportNotesToCsv,
  normalizeNoteCoordinates,
  resolveLoopPdfTargets,
} from '../utils/diffEngine';
import {
  buildSearchTermsForLoop,
  locateTermsOnPdfPage,
  PdfLocateMatch,
} from '../utils/pdfLocator';
import {
  advanceSimulatedPeers,
  applySharedSessionEvent,
  buildBroadcastMessage,
  createInitialSimulatedPeers,
  filterVisiblePointersForPane,
  parseBroadcastMessage,
  SharedPointerState,
  SharedSessionEvent,
  SharedSessionPresetMode,
  VisiblePanePointer,
} from '../utils/sharedSessionSync';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

interface UploadedPreviewItem {
  id: string;
  name: string;
  role: 'PIPING' | 'ELECTRICAL';
  objectUrl: string;
  base64Data: string;
  sizeLabel: string;
}

export interface PendingNotePrefill {
  drawingId: string;
  pageNum: number;
  tagRef: string;
  severity: DiscrepancySeverity;
  content: string;
}

export interface PdfFocusTarget {
  drawingId: string;
  pageNum: number;
  key: number;
  searchTerms?: string[];
  autoInsertNote?: {
    tagRef: string;
    severity: DiscrepancySeverity;
    content: string;
  };
  scrollToCoord?: { xPct: number; yPct: number };
}

interface SplitPdfViewerProps {
  leftFocus: PdfFocusTarget;
  rightFocus: PdfFocusTarget;
  evaluatedLoops: EvaluatedLoopMatch[];
  activeIssueLoopId: string | null;
  onSelectIssueLoop: (loop: EvaluatedLoopMatch, autoInsert?: boolean) => void;
  onLocateAndAutoInsertOnPane: (
    side: 'LEFT' | 'RIGHT',
    target: {
      drawingId: string;
      pageNum: number;
      searchTerms: string[];
      tagRef: string;
      severity: DiscrepancySeverity;
      content: string;
    }
  ) => void;
  onAutoInsertNote: (candidate: Omit<DrawingPinNote, 'id' | 'createdAt'>) => DrawingPinNote;
  uploadedPdfs: UploadedPreviewItem[];
  pinNotes: DrawingPinNote[];
  pendingNotePrefill: PendingNotePrefill | null;
  onClearPendingPrefill: () => void;
  onAddPinNote: (note: DrawingPinNote) => void;
  onUpdatePinNote: (id: string, patch: Partial<DrawingPinNote>) => void;
  onDeletePinNote: (id: string) => void;
  onResetSeedNotes: () => void;
  onUploadPdf: (item: UploadedPreviewItem) => void;
  onRemoveUploadedPdf: (id: string) => void;
  onRunAiWithCustomPdfs: (attachments: CustomPdfAttachment[]) => void;
}

const SHEET_QUICK_JUMPS: Record<string, Array<{ label: string; page: number }>> = {
  'PR-100-PID-0001': [
    { label: '이력(Rev.C)', page: 1 },
    { label: '10/17 (E-201A)', page: 13 },
    { label: '16/17 (E-202A)', page: 19 },
  ],
  'PR-200-PID-0001': [
    { label: '10/15 (Main)', page: 13 },
    { label: '13/15 (TI 131B 오기)', page: 16 },
    { label: '15/15 (FCV/PDIT-111E)', page: 18 },
  ],
  'PR-300-PID-0001': [
    { label: '10/10 (300-V-001 마크업)', page: 1 },
  ],
  'PD-100-GAR-0001': [
    { label: '03/07 (SDV Mark B)', page: 5 },
    { label: '06/07 (E-201A 오기)', page: 8 },
  ],
  'PD-200-GAR-0001': [
    { label: '04/07 (110-P 오기)', page: 6 },
    { label: '06/07 (2F Plan)', page: 8 },
  ],
  'CI-000-DIA-0001': [
    { label: 'R-03 (RC03208)', page: 12 },
    { label: 'R-06 (RC04xx 복사)', page: 15 },
    { label: 'Sheet 12/22 (PEIT)', page: 35 },
  ],
  'CI-000-DIA-0002': [
    { label: 'R-01 (중복태그)', page: 10 },
    { label: 'H-05 (ISJB-004)', page: 24 },
    { label: 'H-06 (100-ZSO)', page: 25 },
    { label: 'Sheet 15/23', page: 43 },
  ],
};

interface PdfCanvasPaneProps {
  paneSide: 'LEFT' | 'RIGHT';
  drawingId: string;
  url: string;
  title: string;
  externalPageRequest: PdfFocusTarget;
  quickJumps?: Array<{ label: string; page: number }>;
  notesForDrawing: DrawingPinNote[];
  selectedNoteId: string | null;
  pendingPrefill: PendingNotePrefill | null;
  onClearPendingPrefill: () => void;
  onSelectNote: (note: DrawingPinNote | null) => void;
  onAddNote: (note: DrawingPinNote) => void;
  onAutoInsertNote: (candidate: Omit<DrawingPinNote, 'id' | 'createdAt'>) => DrawingPinNote;
  onUpdateNote: (id: string, patch: Partial<DrawingPinNote>) => void;
  onDeleteNote: (id: string) => void;
  sharedSessionEnabled?: boolean;
  sharedPointers?: VisiblePanePointer[];
  localPointerCoord?: { xPct: number; yPct: number } | null;
  onPageChange?: (paneSide: 'LEFT' | 'RIGHT', drawingId: string, pageNum: number) => void;
  onLocalPointerMove?: (payload: {
    paneSide: 'LEFT' | 'RIGHT';
    drawingId: string;
    pageNum: number;
    xPct: number;
    yPct: number;
  }) => void;
  onLocalPointerLeave?: (paneSide: 'LEFT' | 'RIGHT') => void;
  onLocalPointerPing?: (payload: {
    paneSide: 'LEFT' | 'RIGHT';
    drawingId: string;
    pageNum: number;
    xPct: number;
    yPct: number;
  }) => void;
}

const PdfCanvasPane: React.FC<PdfCanvasPaneProps> = ({
  paneSide,
  drawingId,
  url,
  title,
  externalPageRequest,
  quickJumps,
  notesForDrawing,
  selectedNoteId,
  pendingPrefill,
  onClearPendingPrefill,
  onSelectNote,
  onAddNote,
  onAutoInsertNote,
  onUpdateNote,
  onDeleteNote,
  sharedSessionEnabled = false,
  sharedPointers = [],
  localPointerCoord = null,
  onPageChange,
  onLocalPointerMove,
  onLocalPointerLeave,
  onLocalPointerPing,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const handledAutoKeyRef = useRef<number>(0);
  const lastPointerSentAtRef = useRef<number>(0);
  const onAutoInsertNoteRef = useRef(onAutoInsertNote);
  const onSelectNoteRef = useRef(onSelectNote);
  const onPageChangeRef = useRef(onPageChange);
  onAutoInsertNoteRef.current = onAutoInsertNote;
  onSelectNoteRef.current = onSelectNote;
  onPageChangeRef.current = onPageChange;
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [pageNum, setPageNum] = useState(externalPageRequest.pageNum || 1);
  const [numPages, setNumPages] = useState(0);
  const [zoom, setZoom] = useState(1.1);
  const [loading, setLoading] = useState(true);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [locatedMatch, setLocatedMatch] = useState<PdfLocateMatch | null>(null);
  const [autoStatusMsg, setAutoStatusMsg] = useState<string | null>(null);

  // Pin note placement state
  const [notePlacementArmed, setNotePlacementArmed] = useState(false);
  const [draftCoord, setDraftCoord] = useState<{ xPct: number; yPct: number } | null>(null);
  const [draftTagRef, setDraftTagRef] = useState('');
  const [draftSeverity, setDraftSeverity] = useState<DiscrepancySeverity>('WARNING');
  const [draftContent, setDraftContent] = useState('');

  // Report current drawingId + pageNum to parent shared session coordinator
  useEffect(() => {
    onPageChangeRef.current?.(paneSide, drawingId, pageNum);
  }, [paneSide, drawingId, pageNum]);

  // Respond to external jump (e.g. from List, Layout Card, DiffCheck, or Note List)
  useEffect(() => {
    if (externalPageRequest.pageNum >= 1) {
      setPageNum(externalPageRequest.pageNum);
    }
    if (!externalPageRequest.searchTerms?.length && !externalPageRequest.scrollToCoord) {
      setLocatedMatch(null);
      setAutoStatusMsg(null);
    }
  }, [
    externalPageRequest.pageNum,
    externalPageRequest.key,
    externalPageRequest.searchTerms,
    externalPageRequest.scrollToCoord,
  ]);

  // Arm note placement automatically if manual prefill requested
  useEffect(() => {
    if (pendingPrefill && pendingPrefill.drawingId === drawingId) {
      setPageNum(pendingPrefill.pageNum);
      setNotePlacementArmed(true);
      setDraftTagRef(pendingPrefill.tagRef);
      setDraftSeverity(pendingPrefill.severity);
      setDraftContent(pendingPrefill.content);
    }
  }, [pendingPrefill, drawingId]);

  useEffect(() => {
    let cancelled = false;
    let loadedTask: pdfjsLib.PDFDocumentLoadingTask | null = null;
    setLoading(true);
    setRenderError(null);

    loadedTask = pdfjsLib.getDocument({ url });
    loadedTask.promise
      .then((doc) => {
        if (cancelled) return;
        setPdfDoc(doc);
        setNumPages(doc.numPages);
        setPageNum((prev) => Math.max(1, Math.min(prev, doc.numPages)));
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setRenderError(err instanceof Error ? err.message : 'PDF를 불러오지 못했습니다.');
        setLoading(false);
      });

    return () => {
      cancelled = true;
      if (loadedTask) {
        void loadedTask.destroy();
      }
    };
  }, [url]);

  useEffect(() => {
    if (!pdfDoc || !canvasRef.current) return;
    let cancelled = false;
    let renderTask: pdfjsLib.RenderTask | null = null;

    const safePage = Math.max(1, Math.min(pageNum, pdfDoc.numPages));
    pdfDoc.getPage(safePage).then((page) => {
      if (cancelled || !canvasRef.current) return;
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');
      if (!context) return;

      const containerWidth = containerRef.current?.clientWidth || 620;
      const unscaledViewport = page.getViewport({ scale: 1 });
      const fitScale = (containerWidth - 32) / unscaledViewport.width;
      const effectiveScale = Math.max(0.35, fitScale * zoom);
      const viewport = page.getViewport({ scale: effectiveScale });
      const dpr = Math.min(window.devicePixelRatio || 1, 2);

      canvas.width = Math.floor(viewport.width * dpr);
      canvas.height = Math.floor(viewport.height * dpr);
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;

      context.setTransform(dpr, 0, 0, dpr, 0, 0);

      renderTask = page.render({
        canvasContext: context,
        viewport,
        canvas,
      });

      renderTask.promise
        .then(async () => {
          if (cancelled) return;
          const scrollViewportTo = (xPct: number, yPct: number) => {
            if (!containerRef.current || !canvasRef.current) return;
            const cw = parseFloat(canvasRef.current.style.width || '0') || canvasRef.current.clientWidth;
            const ch = parseFloat(canvasRef.current.style.height || '0') || canvasRef.current.clientHeight;
            const scrollX = Math.max(0, (cw * xPct) / 100 - containerRef.current.clientWidth / 2);
            const scrollY = Math.max(0, (ch * yPct) / 100 - containerRef.current.clientHeight / 2);
            containerRef.current.scrollTo({ left: scrollX, top: scrollY, behavior: 'smooth' });
          };

          const matchesRequestTarget =
            externalPageRequest.drawingId === drawingId &&
            externalPageRequest.pageNum === safePage &&
            handledAutoKeyRef.current !== externalPageRequest.key;

          if (matchesRequestTarget && externalPageRequest.scrollToCoord) {
            handledAutoKeyRef.current = externalPageRequest.key;
            const { xPct, yPct } = externalPageRequest.scrollToCoord;
            setLocatedMatch({
              matchedTerm: 'PIN',
              str: '등록된 핀 위치',
              xPct,
              yPct,
              leftPct: Math.max(0, xPct - 3),
              topPct: Math.max(0, yPct - 2),
              widthPct: 6,
              heightPct: 4,
              exact: true,
            });
            setAutoStatusMsg(`핀 위치 포커스 (p.${safePage} · X:${xPct}% Y:${yPct}%)`);
            scrollViewportTo(xPct, yPct);
            return;
          }

          if (
            matchesRequestTarget &&
            externalPageRequest.searchTerms &&
            externalPageRequest.searchTerms.length > 0
          ) {
            handledAutoKeyRef.current = externalPageRequest.key;
            const hit = await locateTermsOnPdfPage(page, externalPageRequest.searchTerms);
            if (cancelled) return;

            const targetX = hit?.xPct ?? 50;
            const targetY = hit?.yPct ?? 45;

            if (hit) {
              setLocatedMatch(hit);
            } else {
              setLocatedMatch(null);
            }

            scrollViewportTo(targetX, targetY);

            if (externalPageRequest.autoInsertNote) {
              const createdOrExisting = onAutoInsertNoteRef.current({
                drawingId,
                pageNum: safePage,
                xPct: targetX,
                yPct: targetY,
                tagRef: externalPageRequest.autoInsertNote.tagRef,
                severity: externalPageRequest.autoInsertNote.severity,
                status: 'OPEN',
                author: 'Auto Locate',
                content: externalPageRequest.autoInsertNote.content,
                source: 'AUTO_LOCATE',
              });
              onSelectNoteRef.current(createdOrExisting);
              setAutoStatusMsg(
                hit
                  ? `위치 포착("${hit.str}") + 자동 노트 삽입 (p.${safePage} · X:${targetX}% Y:${targetY}%)`
                  : `페이지 이동 + 자동 노트 삽입 (p.${safePage})`
              );
            } else if (hit) {
              setAutoStatusMsg(
                `도면 텍스트 포착: "${hit.str}" (X:${hit.xPct}% Y:${hit.yPct}%)`
              );
            }
          }
        })
        .catch((err) => {
          if (!cancelled && err?.name !== 'RenderingCancelledException') {
            setRenderError(err instanceof Error ? err.message : '페이지 렌더링 오류');
          }
        });
    });

    return () => {
      cancelled = true;
      if (renderTask) {
        renderTask.cancel();
      }
    };
  }, [pdfDoc, pageNum, zoom, drawingId, externalPageRequest]);

  const pageNotes = useMemo(
    () => notesForDrawing.filter((n) => n.pageNum === pageNum),
    [notesForDrawing, pageNum]
  );

  const selectedNote = useMemo(
    () => pageNotes.find((n) => n.id === selectedNoteId) || null,
    [pageNotes, selectedNoteId]
  );

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const coords = normalizeNoteCoordinates(
      e.clientX - rect.left,
      e.clientY - rect.top,
      rect.width,
      rect.height
    );
    if (e.shiftKey && sharedSessionEnabled && !notePlacementArmed) {
      onLocalPointerPing?.({
        paneSide,
        drawingId,
        pageNum,
        xPct: coords.xPct,
        yPct: coords.yPct,
      });
      return;
    }
    if (!notePlacementArmed) return;
    setDraftCoord(coords);
    onSelectNote(null);
  };

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!sharedSessionEnabled || !canvasRef.current || !onLocalPointerMove) return;
    const now = performance.now();
    if (now - lastPointerSentAtRef.current < 45) return;
    lastPointerSentAtRef.current = now;
    const rect = canvasRef.current.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const coords = normalizeNoteCoordinates(
      e.clientX - rect.left,
      e.clientY - rect.top,
      rect.width,
      rect.height
    );
    onLocalPointerMove({
      paneSide,
      drawingId,
      pageNum,
      xPct: coords.xPct,
      yPct: coords.yPct,
    });
  };

  const handleCanvasMouseLeave = () => {
    if (!sharedSessionEnabled) return;
    onLocalPointerLeave?.(paneSide);
  };

  const handleSaveDraft = (e: React.FormEvent) => {
    e.preventDefault();
    if (!draftCoord || !draftContent.trim()) return;
    const created: DrawingPinNote = {
      id: `NOTE-${Date.now()}`,
      drawingId,
      pageNum,
      xPct: draftCoord.xPct,
      yPct: draftCoord.yPct,
      tagRef: draftTagRef.trim().toUpperCase() || 'GENERAL',
      severity: draftSeverity,
      status: 'OPEN',
      author: 'Engineer',
      content: draftContent.trim(),
      createdAt: new Date().toISOString(),
      source: 'USER',
    };
    onAddNote(created);
    onSelectNote(created);
    setDraftCoord(null);
    setDraftTagRef('');
    setDraftContent('');
    setNotePlacementArmed(false);
    if (pendingPrefill && pendingPrefill.drawingId === drawingId) {
      onClearPendingPrefill();
    }
  };

  return (
    <div className="flex flex-col">
      {/* Page, Zoom & On-Drawing Note Mode Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-white px-3 py-2 text-xs">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            disabled={pageNum <= 1 || loading}
            onClick={() => setPageNum((p) => Math.max(1, p - 1))}
            aria-label={`${title} 이전 페이지`}
            className="inline-flex h-7 w-7 items-center justify-center rounded border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-40"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <span className="min-w-[64px] text-center font-mono text-[11px] text-slate-700 tabular-nums">
            {numPages > 0 ? `${pageNum} / ${numPages}` : '- / -'}
          </span>
          <button
            type="button"
            disabled={pageNum >= numPages || loading}
            onClick={() => setPageNum((p) => Math.min(numPages, p + 1))}
            aria-label={`${title} 다음 페이지`}
            className="inline-flex h-7 w-7 items-center justify-center rounded border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-40"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>

          <button
            type="button"
            onClick={() => {
              setNotePlacementArmed((v) => !v);
              setDraftCoord(null);
            }}
            aria-pressed={notePlacementArmed}
            aria-label={`${paneSide === 'LEFT' ? '좌측' : '우측'} 도면에 바로 노트 찍기`}
            className={`ml-1 inline-flex h-7 items-center gap-1 rounded border px-2 text-[11px] font-medium transition-colors ${
              notePlacementArmed
                ? 'border-sky-600 bg-sky-600 text-white'
                : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            <MapPinPlus className="h-3 w-3" />
            <span>{notePlacementArmed ? '도면 클릭하여 위치 지정' : '도면 노트 추가'}</span>
          </button>
        </div>

        <div className="flex items-center gap-1.5">
          {sharedSessionEnabled && (
            <span
              className="hidden items-center gap-1 rounded border border-sky-200 bg-sky-50 px-1.5 py-0.5 font-mono text-[10px] text-sky-800 tabular-nums sm:inline-flex"
              title="현재 동일 도면 페이지에서 동기화 중인 포인터"
            >
              공유 {sharedPointers.length}명
              {localPointerCoord
                ? ` · 내 위치 ${localPointerCoord.xPct.toFixed(1)}%,${localPointerCoord.yPct.toFixed(1)}%`
                : ''}
            </span>
          )}
          <span className="mr-1 font-mono text-[11px] text-slate-500 tabular-nums">
            핀 {pageNotes.length}
          </span>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(0.6, +(z - 0.2).toFixed(1)))}
            aria-label="축소"
            className="inline-flex h-7 w-7 items-center justify-center rounded border border-slate-200 text-slate-700 hover:bg-slate-50"
          >
            <ZoomOut className="h-3.5 w-3.5" />
          </button>
          <span className="min-w-[42px] text-center font-mono text-[11px] text-slate-600 tabular-nums">
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(2.4, +(z + 0.2).toFixed(1)))}
            aria-label="확대"
            className="inline-flex h-7 w-7 items-center justify-center rounded border border-slate-200 text-slate-700 hover:bg-slate-50"
          >
            <ZoomIn className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Quick Discrepancy Sheet Jump Buttons */}
      {quickJumps && quickJumps.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-100 bg-slate-50 px-3 py-1.5 text-[11px]">
          <span className="font-medium text-slate-500">주요 시트:</span>
          {quickJumps.map((jmp) => {
            const noteCnt = notesForDrawing.filter((n) => n.pageNum === jmp.page).length;
            return (
              <button
                key={jmp.label}
                type="button"
                onClick={() => setPageNum(Math.min(numPages || jmp.page, jmp.page))}
                className={`rounded border px-2 py-0.5 font-mono transition-colors ${
                  pageNum === jmp.page
                    ? 'border-sky-600 bg-sky-50 text-sky-800'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                }`}
              >
                {jmp.label}
                {noteCnt > 0 ? ` · 핀${noteCnt}` : ''}
              </button>
            );
          })}
        </div>
      )}

      {/* High-DPI Canvas Viewport + Interactive Pin Overlay */}
      <div
        ref={containerRef}
        className="relative flex h-[520px] w-full items-start justify-center overflow-auto bg-slate-100 p-4"
      >
        {loading && (
          <div className="flex h-full items-center gap-2 text-xs text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin text-sky-700" />
            <span>PDF 도면 렌더링 중...</span>
          </div>
        )}
        {renderError && (
          <div className="rounded border border-red-200 bg-red-50 p-4 text-xs text-red-800">
            {renderError}
          </div>
        )}
        {!loading && !renderError && (
          <div className="relative inline-block">
            <canvas
              ref={canvasRef}
              onClick={handleCanvasClick}
              onMouseMove={handleCanvasMouseMove}
              onMouseLeave={handleCanvasMouseLeave}
              aria-label={title}
              className={`border border-slate-300 bg-white shadow-sm ${
                notePlacementArmed ? 'cursor-crosshair ring-2 ring-sky-500/40' : ''
              }`}
            />

            {/* Auto-Locate Vector Text Reticle Highlight */}
            {locatedMatch && (
              <div
                style={{
                  left: `${locatedMatch.leftPct}%`,
                  top: `${locatedMatch.topPct}%`,
                  width: `${Math.max(4, locatedMatch.widthPct)}%`,
                  height: `${Math.max(2.6, locatedMatch.heightPct)}%`,
                }}
                className="pointer-events-none absolute z-15 rounded border-2 border-sky-600 bg-sky-500/15 ring-2 ring-sky-400/50"
              >
                <span className="absolute -top-5 left-0 whitespace-nowrap rounded bg-sky-700 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-white shadow">
                  포착: {locatedMatch.str}
                </span>
              </div>
            )}

            {/* Existing Pin Markers on Current Page */}
            {pageNotes.map((note, idx) => {
              const isSelected = note.id === selectedNoteId;
              const pinStyle =
                note.status === 'RESOLVED'
                  ? 'border-emerald-700 bg-emerald-600 text-white'
                  : note.severity === 'CRITICAL'
                    ? 'border-red-800 bg-red-600 text-white'
                    : note.severity === 'WARNING'
                      ? 'border-amber-700 bg-amber-500 text-white'
                      : 'border-sky-800 bg-sky-600 text-white';

              return (
                <button
                  key={note.id}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectNote(isSelected ? null : note);
                  }}
                  style={{ left: `${note.xPct}%`, top: `${note.yPct}%` }}
                  aria-label={`노트 핀 ${idx + 1}: ${note.tagRef}`}
                  className={`absolute flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded border font-mono text-[11px] font-bold shadow-md transition-transform ${pinStyle} ${
                    isSelected ? 'z-20 scale-125 ring-2 ring-slate-900' : 'z-10 hover:scale-110'
                  }`}
                >
                  {idx + 1}
                </button>
              );
            })}

            {/* Draft Pin Marker while composing */}
            {draftCoord && (
              <div
                style={{ left: `${draftCoord.xPct}%`, top: `${draftCoord.yPct}%` }}
                className="pointer-events-none absolute z-20 flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded border border-sky-900 bg-sky-600 font-mono text-[11px] font-bold text-white ring-2 ring-white"
              >
                +
              </div>
            )}

            {/* Synchronized Remote / Simulated Collaborator Pointers on Same Drawing & Page */}
            {sharedSessionEnabled &&
              sharedPointers.map((ptr) => (
                <div
                  key={ptr.participantId}
                  data-testid={`shared-pointer-${paneSide.toLowerCase()}-${ptr.participantId}`}
                  style={{ left: `${ptr.xPct}%`, top: `${ptr.yPct}%` }}
                  className={`pointer-events-none absolute z-30 ${
                    ptr.kind === 'SIMULATED_PEER'
                      ? 'transition-[left,top] duration-500 ease-out'
                      : 'transition-[left,top] duration-75 ease-linear'
                  }`}
                >
                  {ptr.isPingActive && (
                    <span
                      style={{ borderColor: ptr.color }}
                      className="absolute -left-3 -top-3 h-6 w-6 animate-ping rounded-full border-2 opacity-75"
                    />
                  )}
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 18 18"
                    fill="none"
                    aria-hidden="true"
                    className="-translate-x-[2px] -translate-y-[2px] drop-shadow-sm"
                  >
                    <path
                      d="M2 2L7.2 15.5L9.5 9.8L15.2 7.5L2 2Z"
                      fill={ptr.color}
                      stroke="#FFFFFF"
                      strokeWidth="1.5"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <div
                    style={{ borderColor: ptr.color, backgroundColor: '#FFFFFF' }}
                    className="ml-3.5 -mt-1 flex items-center gap-1.5 whitespace-nowrap rounded border px-1.5 py-0.5 text-[10px] shadow-sm"
                  >
                    <span
                      style={{ backgroundColor: ptr.color }}
                      className="h-2 w-2 shrink-0 rounded-sm"
                    />
                    <span className="font-semibold text-slate-900">{ptr.name}</span>
                    <span className="font-mono text-[9px] text-slate-500 tabular-nums">
                      {ptr.xPct}%,{ptr.yPct}%
                    </span>
                  </div>
                </div>
              ))}
          </div>
        )}
      </div>

      {/* Auto-Locate & Auto-Note Insertion Feedback Strip */}
      {autoStatusMsg && (
        <div className="flex items-center justify-between gap-2 border-t border-sky-200 bg-sky-50 px-3 py-1.5 text-[11px] text-sky-900">
          <div className="flex items-center gap-1.5 truncate">
            <Crosshair className="h-3.5 w-3.5 shrink-0 text-sky-700" />
            <span className="truncate font-medium">{autoStatusMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setAutoStatusMsg(null)}
            aria-label="위치 포착 알림 닫기"
            className="text-sky-700 hover:text-sky-950"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      {/* Inline Draft Note Composer (when canvas was clicked in Note Mode) */}
      {draftCoord && (
        <form
          onSubmit={handleSaveDraft}
          className="space-y-2 border-t border-sky-200 bg-sky-50/70 p-3 text-xs"
        >
          <div className="flex items-center justify-between">
            <span className="font-semibold text-sky-900">
              새 도면 핀 노트 (Page {pageNum} · X {draftCoord.xPct}% / Y {draftCoord.yPct}%)
            </span>
            <button
              type="button"
              onClick={() => setDraftCoord(null)}
              className="rounded p-0.5 text-slate-500 hover:bg-white hover:text-slate-800"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <input
              type="text"
              aria-label="노트 연결 태그"
              value={draftTagRef}
              onChange={(e) => setDraftTagRef(e.target.value)}
              placeholder="관련 태그 (예: 200-SDY-101)"
              className="h-7 rounded border border-slate-300 bg-white px-2 font-mono text-[11px]"
            />
            <select
              aria-label="노트 심각도"
              value={draftSeverity}
              onChange={(e) => setDraftSeverity(e.target.value as DiscrepancySeverity)}
              className="h-7 rounded border border-slate-300 bg-white px-2 text-[11px]"
            >
              <option value="CRITICAL">CRITICAL (수정 요청)</option>
              <option value="WARNING">WARNING (확인 필요)</option>
              <option value="INFO">INFO (검토 메모)</option>
            </select>
          </div>

          <textarea
            rows={2}
            aria-label="도면 노트 내용"
            value={draftContent}
            onChange={(e) => setDraftContent(e.target.value)}
            placeholder="도면 해당 위치에 남길 수정 요청이나 디프 메모를 입력하세요..."
            className="w-full rounded border border-slate-300 bg-white p-2 text-xs"
          />

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setDraftCoord(null)}
              className="h-7 rounded border border-slate-300 bg-white px-2.5 text-[11px] font-medium text-slate-700"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={!draftContent.trim()}
              className="h-7 rounded bg-sky-700 px-3 text-[11px] font-semibold text-white hover:bg-sky-800 disabled:opacity-50"
            >
              도면에 핀 저장
            </button>
          </div>
        </form>
      )}

      {/* Selected Pin Inspector Strip */}
      {selectedNote && !draftCoord && (
        <div className="space-y-2 border-t border-slate-200 bg-slate-50 p-3 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <StickyNote className="h-3.5 w-3.5 text-sky-700" />
              <span className="font-mono font-semibold text-slate-900">{selectedNote.tagRef}</span>
              <span className="font-mono text-[10px] text-slate-500">
                p.{selectedNote.pageNum} ({selectedNote.xPct}%, {selectedNote.yPct}%)
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <select
                aria-label="선택된 노트 상태 변경"
                value={selectedNote.status}
                onChange={(e) =>
                  onUpdateNote(selectedNote.id, { status: e.target.value as NoteStatus })
                }
                className="h-7 rounded border border-slate-300 bg-white px-2 text-[11px]"
              >
                <option value="OPEN">미해결 (OPEN)</option>
                <option value="IN_REVIEW">검토중 (IN_REVIEW)</option>
                <option value="RESOLVED">해결됨 (RESOLVED)</option>
              </select>
              <button
                type="button"
                onClick={() => onDeleteNote(selectedNote.id)}
                aria-label="노트 삭제"
                className="inline-flex h-7 w-7 items-center justify-center rounded border border-slate-300 bg-white text-slate-500 hover:border-red-300 hover:text-red-700"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => onSelectNote(null)}
                aria-label="선택 닫기"
                className="inline-flex h-7 w-7 items-center justify-center rounded border border-slate-300 bg-white text-slate-500 hover:text-slate-800"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
          <p className="text-xs leading-relaxed text-slate-800">{selectedNote.content}</p>
        </div>
      )}
    </div>
  );
};

export const SplitPdfViewer: React.FC<SplitPdfViewerProps> = ({
  leftFocus,
  rightFocus,
  evaluatedLoops,
  activeIssueLoopId,
  onSelectIssueLoop,
  onLocateAndAutoInsertOnPane,
  onAutoInsertNote,
  uploadedPdfs,
  pinNotes,
  pendingNotePrefill,
  onClearPendingPrefill,
  onAddPinNote,
  onUpdatePinNote,
  onDeletePinNote,
  onResetSeedNotes,
  onUploadPdf,
  onRemoveUploadedPdf,
  onRunAiWithCustomPdfs,
}) => {
  const [leftId, setLeftId] = useState(leftFocus.drawingId);
  const [rightId, setRightId] = useState(rightFocus.drawingId);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [noteStatusFilter, setNoteStatusFilter] = useState<'ALL' | NoteStatus>('ALL');
  const [uploadRole, setUploadRole] = useState<'PIPING' | 'ELECTRICAL'>('PIPING');
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Issue-to-PDF list state
  const [issueListMode, setIssueListMode] = useState<'ISSUES' | 'ALL'>('ISSUES');
  const [issueUnitFilter, setIssueUnitFilter] = useState<'ALL' | UnitCode>('ALL');
  const [issueSearchQuery, setIssueSearchQuery] = useState('');
  const [issueListExpanded, setIssueListExpanded] = useState(true);
  const [autoInsertOnSelect, setAutoInsertOnSelect] = useState(true);

  const issueLoops = useMemo(
    () => evaluatedLoops.filter((l) => l.discrepancies.length > 0 || l.status !== 'MATCHED'),
    [evaluatedLoops]
  );

  const displayedChecklistLoops = useMemo(() => {
    const base = issueListMode === 'ISSUES' ? issueLoops : evaluatedLoops;
    const q = issueSearchQuery.trim().toLowerCase();
    return base.filter((l) => {
      if (issueUnitFilter !== 'ALL' && l.unitCode !== issueUnitFilter) return false;
      if (!q) return true;
      return (
        l.canonicalTag.toLowerCase().includes(q) ||
        l.serviceName.toLowerCase().includes(q) ||
        l.equipmentTag.toLowerCase().includes(q) ||
        l.discrepancies.some(
          (d) =>
            d.title.toLowerCase().includes(q) || d.description.toLowerCase().includes(q)
        )
      );
    });
  }, [evaluatedLoops, issueLoops, issueListMode, issueUnitFilter, issueSearchQuery]);

  const activeIssueLoop = useMemo(
    () =>
      evaluatedLoops.find((l) => l.id === activeIssueLoopId) ||
      issueLoops[0] ||
      evaluatedLoops[0] ||
      null,
    [evaluatedLoops, issueLoops, activeIssueLoopId]
  );

  const activeLoopPdfTargets = useMemo(
    () => (activeIssueLoop ? resolveLoopPdfTargets(activeIssueLoop) : null),
    [activeIssueLoop]
  );

  useEffect(() => {
    setLeftId(leftFocus.drawingId);
  }, [leftFocus.drawingId, leftFocus.key]);

  useEffect(() => {
    setRightId(rightFocus.drawingId);
  }, [rightFocus.drawingId, rightFocus.key]);

  const pipingDocs = H042_DRAWINGS.filter((d) => d.discipline === 'PID' || d.discipline === 'GAR');
  const elecDocs = H042_DRAWINGS.filter((d) => d.discipline === 'ICAMS' || d.discipline === 'PSDS');

  const resolveDoc = (id: string) => {
    const custom = uploadedPdfs.find((u) => u.id === id);
    if (custom) {
      return {
        id: custom.id,
        title: custom.name,
        subtitle: `사용자 업로드 (${custom.role === 'PIPING' ? '배관 도면' : '전장 도면'}) · ${custom.sizeLabel}`,
        url: custom.objectUrl,
        highlights: ['사용자가 직접 업로드한 PDF 도면입니다.'],
        quickJumps: undefined,
      };
    }
    if (id === 'REQ-REV1-261118') {
      return {
        id: 'REQ-REV1-261118',
        title: 'H042 전기 생산 설계관련 요청건 (Rev1_261118)',
        subtitle: '첨부 보고서 양식 원본 PDF · 18p · EL/CI/GAR 요청사항 정리',
        url: '/assets/aistudio/H042________________Rev1_261118_38b7d0ac.pdf',
        highlights: [
          'p.1~4: RL0113 중복, PB 오기, EL-100-GAR 누락, 200-EDJB-001 80P/40P, 6.6kV Spec',
          'p.6~18: iCAMS E-01/E-02/R-06/H-01, PSDS R-01/R-09/H-05~09/R76, 6600V 출도 및 재요청',
        ],
        quickJumps: undefined,
      };
    }
    const base = H042_DRAWINGS.find((d) => d.id === id) || H042_DRAWINGS[0];
    return {
      id: base.id,
      title: `${base.drawingNo} (${base.revision})`,
      subtitle: `${base.titleKo} · ${base.pageCount}p · ${base.fileSizeLabel}`,
      url: base.pdfUrl,
      highlights: base.keyHighlights,
      quickJumps: SHEET_QUICK_JUMPS[base.id],
    };
  };

  const leftDoc = resolveDoc(leftId);
  const rightDoc = resolveDoc(rightId);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setUploadError(null);
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      setUploadError('PDF 파일(.pdf)만 업로드할 수 있습니다.');
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      setUploadError('파일 크기는 15MB 이하로 업로드해 주세요.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const base64Data = typeof reader.result === 'string' ? reader.result : '';
      const objectUrl = URL.createObjectURL(file);
      const id = `CUSTOM-${Date.now()}`;
      onUploadPdf({
        id,
        name: file.name,
        role: uploadRole,
        objectUrl,
        base64Data,
        sizeLabel: `${(file.size / (1024 * 1024)).toFixed(2)} MB`,
      });
      if (uploadRole === 'PIPING') {
        setLeftId(id);
      } else {
        setRightId(id);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const [leftPageJump, setLeftPageJump] = useState<PdfFocusTarget>(leftFocus);
  const [rightPageJump, setRightPageJump] = useState<PdfFocusTarget>(rightFocus);

  // Real-time Shared Session State (simulated multi-user + BroadcastChannel cross-tab sync)
  const [sessionId] = useState('H042-SYNC-01');
  const localParticipantIdRef = useRef(
    `local-${Math.random().toString(36).slice(2, 8)}`
  );
  const [sharedSessionEnabled, setSharedSessionEnabled] = useState(true);
  const [simulationRunning, setSimulationRunning] = useState(true);
  const [sessionPresetMode, setSessionPresetMode] =
    useState<SharedSessionPresetMode>('SPLIT_PANES');
  const [copiedSessionId, setCopiedSessionId] = useState(false);

  const [leftCurrentPage, setLeftCurrentPage] = useState(leftFocus.pageNum || 1);
  const [rightCurrentPage, setRightCurrentPage] = useState(rightFocus.pageNum || 1);
  const [localPointer, setLocalPointer] = useState<{
    paneSide: 'LEFT' | 'RIGHT';
    drawingId: string;
    pageNum: number;
    xPct: number;
    yPct: number;
    updatedAt: number;
    pingedAt?: number;
  } | null>(null);

  const [nowTickMs, setNowTickMs] = useState(() => Date.now());
  const simTickRef = useRef(0);
  const broadcastChannelRef = useRef<BroadcastChannel | null>(null);

  const [participantsMap, setParticipantsMap] = useState<Record<string, SharedPointerState>>(
    () => {
      const initial = createInitialSimulatedPeers(
        { drawingId: leftFocus.drawingId, pageNum: leftFocus.pageNum || 1 },
        { drawingId: rightFocus.drawingId, pageNum: rightFocus.pageNum || 1 },
        Date.now(),
        'SPLIT_PANES'
      );
      return Object.fromEntries(initial.map((p) => [p.participantId, p]));
    }
  );

  // Sync simulated peers immediately when preset mode or viewed drawing/page changes
  useEffect(() => {
    if (!sharedSessionEnabled) return;
    const now = Date.now();
    setNowTickMs(now);
    setParticipantsMap((prev) =>
      advanceSimulatedPeers(
        prev,
        { drawingId: leftId, pageNum: leftCurrentPage },
        { drawingId: rightId, pageNum: rightCurrentPage },
        simTickRef.current,
        now,
        sessionPresetMode
      )
    );
  }, [
    sharedSessionEnabled,
    leftId,
    leftCurrentPage,
    rightId,
    rightCurrentPage,
    sessionPresetMode,
  ]);

  // Smooth periodic simulation tick for collaborator pointer exploration on same drawings
  useEffect(() => {
    if (!sharedSessionEnabled || !simulationRunning) return;
    const interval = window.setInterval(() => {
      simTickRef.current += 1;
      const now = Date.now();
      setNowTickMs(now);
      setParticipantsMap((prev) =>
        advanceSimulatedPeers(
          prev,
          { drawingId: leftId, pageNum: leftCurrentPage },
          { drawingId: rightId, pageNum: rightCurrentPage },
          simTickRef.current,
          now,
          sessionPresetMode
        )
      );
    }, 1400);
    return () => window.clearInterval(interval);
  }, [
    sharedSessionEnabled,
    simulationRunning,
    leftId,
    leftCurrentPage,
    rightId,
    rightCurrentPage,
    sessionPresetMode,
  ]);

  // Real BroadcastChannel connection for live multi-tab browser pointer synchronization
  useEffect(() => {
    if (!sharedSessionEnabled || typeof BroadcastChannel === 'undefined') {
      broadcastChannelRef.current?.close();
      broadcastChannelRef.current = null;
      return;
    }

    const channel = new BroadcastChannel(`h042-pdf-shared-${sessionId}`);
    broadcastChannelRef.current = channel;
    const selfId = localParticipantIdRef.current;

    const handleMessage = (ev: MessageEvent) => {
      const event = parseBroadcastMessage(ev.data, sessionId, selfId);
      if (!event) return;
      setNowTickMs(Date.now());
      setParticipantsMap((prev) => applySharedSessionEvent(prev, event));
    };

    channel.addEventListener('message', handleMessage);
    channel.postMessage(
      buildBroadcastMessage(sessionId, selfId, {
        type: 'session:join',
        participant: {
          participantId: selfId,
          kind: 'REMOTE_TAB',
          name: '동료 탭',
          roleLabel: '실시간 탭',
          color: '#D97706',
          drawingId: leftId,
          pageNum: leftCurrentPage,
          paneSide: 'LEFT',
          xPct: 50,
          yPct: 50,
          updatedAt: Date.now(),
          statusMessage: '동일 세션 접속',
        },
      })
    );

    return () => {
      channel.postMessage(
        buildBroadcastMessage(sessionId, selfId, {
          type: 'session:leave',
          participantId: selfId,
          updatedAt: Date.now(),
        })
      );
      channel.removeEventListener('message', handleMessage);
      channel.close();
      broadcastChannelRef.current = null;
    };
  }, [sharedSessionEnabled, sessionId]);

  const emitBroadcastEvent = (event: SharedSessionEvent) => {
    if (!sharedSessionEnabled || !broadcastChannelRef.current) return;
    broadcastChannelRef.current.postMessage(
      buildBroadcastMessage(sessionId, localParticipantIdRef.current, event)
    );
  };

  const handlePanePageChange = (
    paneSide: 'LEFT' | 'RIGHT',
    _drawingId: string,
    nextPageNum: number
  ) => {
    if (paneSide === 'LEFT') {
      setLeftCurrentPage(nextPageNum);
    } else {
      setRightCurrentPage(nextPageNum);
    }
  };

  const handleLocalPointerMove = (payload: {
    paneSide: 'LEFT' | 'RIGHT';
    drawingId: string;
    pageNum: number;
    xPct: number;
    yPct: number;
  }) => {
    const now = Date.now();
    setNowTickMs(now);
    setLocalPointer((prev) => ({
      ...payload,
      updatedAt: now,
      pingedAt: prev?.pingedAt,
    }));
    emitBroadcastEvent({
      type: 'cursor:move',
      participantId: localParticipantIdRef.current,
      kind: 'REMOTE_TAB',
      name: '동료 탭',
      roleLabel: '실시간 탭',
      color: '#D97706',
      drawingId: payload.drawingId,
      pageNum: payload.pageNum,
      paneSide: payload.paneSide,
      xPct: payload.xPct,
      yPct: payload.yPct,
      updatedAt: now,
      statusMessage: '실시간 도면 검토 중',
    });
  };

  const handleLocalPointerLeave = (paneSide: 'LEFT' | 'RIGHT') => {
    setLocalPointer((prev) => (prev?.paneSide === paneSide ? null : prev));
  };

  const handleTriggerPointerPing = (overrideTarget?: {
    paneSide: 'LEFT' | 'RIGHT';
    drawingId: string;
    pageNum: number;
    xPct: number;
    yPct: number;
  }) => {
    const now = Date.now();
    setNowTickMs(now);
    const target =
      overrideTarget ||
      localPointer || {
        paneSide: 'LEFT' as const,
        drawingId: leftId,
        pageNum: leftCurrentPage,
        xPct: 50,
        yPct: 45,
      };
    setLocalPointer({
      ...target,
      updatedAt: now,
      pingedAt: now,
    });
    emitBroadcastEvent({
      type: 'cursor:ping',
      participantId: localParticipantIdRef.current,
      drawingId: target.drawingId,
      pageNum: target.pageNum,
      paneSide: target.paneSide,
      xPct: target.xPct,
      yPct: target.yPct,
      pingedAt: now,
      updatedAt: now,
      statusMessage: '위치 확인 요청 (Ping)',
    });

    // Also make simulated peers briefly acknowledge/ping on the left/right pane for visual feedback
    setParticipantsMap((prev) => {
      const firstSim = Object.values(prev).find((p) => p.kind === 'SIMULATED_PEER');
      if (!firstSim) return prev;
      return applySharedSessionEvent(prev, {
        type: 'cursor:ping',
        participantId: firstSim.participantId,
        drawingId: target.drawingId,
        pageNum: target.pageNum,
        paneSide: target.paneSide,
        xPct: Math.max(8, Math.min(92, +(target.xPct + 14).toFixed(1))),
        yPct: Math.max(8, Math.min(92, +(target.yPct - 8).toFixed(1))),
        pingedAt: now,
        updatedAt: now,
        statusMessage: '호출 위치 응답 확인',
      });
    });
  };

  const handleFollowPeer = (peer: SharedPointerState) => {
    const isElec =
      peer.drawingId.startsWith('CI-') ||
      uploadedPdfs.some((u) => u.id === peer.drawingId && u.role === 'ELECTRICAL');
    const jumpTarget: PdfFocusTarget = {
      drawingId: peer.drawingId,
      pageNum: peer.pageNum,
      key: Date.now(),
      scrollToCoord: { xPct: peer.xPct, yPct: peer.yPct },
    };
    if (isElec && peer.paneSide !== 'LEFT') {
      setRightId(peer.drawingId);
      setRightPageJump(jumpTarget);
    } else {
      setLeftId(peer.drawingId);
      setLeftPageJump(jumpTarget);
    }
  };

  const handleCopySessionId = () => {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(sessionId);
    }
    setCopiedSessionId(true);
    window.setTimeout(() => setCopiedSessionId(false), 1800);
  };

  const visibleLeftPointers = useMemo(
    () =>
      sharedSessionEnabled
        ? filterVisiblePointersForPane(
            participantsMap,
            localParticipantIdRef.current,
            leftId,
            leftCurrentPage,
            nowTickMs
          )
        : [],
    [sharedSessionEnabled, participantsMap, leftId, leftCurrentPage, nowTickMs]
  );

  const visibleRightPointers = useMemo(
    () =>
      sharedSessionEnabled
        ? filterVisiblePointersForPane(
            participantsMap,
            localParticipantIdRef.current,
            rightId,
            rightCurrentPage,
            nowTickMs
          )
        : [],
    [sharedSessionEnabled, participantsMap, rightId, rightCurrentPage, nowTickMs]
  );

  const activeParticipantsList = useMemo(
    () => Object.values(participantsMap),
    [participantsMap]
  );

  useEffect(() => {
    setLeftPageJump(leftFocus);
  }, [leftFocus]);

  useEffect(() => {
    setRightPageJump(rightFocus);
  }, [rightFocus]);

  const handleJumpToNote = (note: DrawingPinNote) => {
    setSelectedNoteId(note.id);
    const isElec =
      note.drawingId.startsWith('CI-') ||
      uploadedPdfs.some((u) => u.id === note.drawingId && u.role === 'ELECTRICAL');
    const jumpTarget: PdfFocusTarget = {
      drawingId: note.drawingId,
      pageNum: note.pageNum,
      key: Date.now(),
      scrollToCoord: { xPct: note.xPct, yPct: note.yPct },
    };
    if (isElec) {
      setRightId(note.drawingId);
      setRightPageJump(jumpTarget);
    } else {
      setLeftId(note.drawingId);
      setLeftPageJump(jumpTarget);
    }
  };

  const filteredNotes = useMemo(
    () =>
      pinNotes.filter((n) =>
        noteStatusFilter === 'ALL' ? true : n.status === noteStatusFilter
      ),
    [pinNotes, noteStatusFilter]
  );

  const handleExportNotes = () => {
    const csv = exportNotesToCsv(pinNotes);
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `H042_Drawing_Pin_Notes_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      {/* Custom PDF Upload Strip */}
      <section className="flex flex-wrap items-center justify-between gap-3 rounded border border-slate-200 bg-white px-4 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs font-semibold text-slate-900">사용자 도면 PDF 추가</span>
          <select
            aria-label="업로드 도면 구분"
            value={uploadRole}
            onChange={(e) => setUploadRole(e.target.value as 'PIPING' | 'ELECTRICAL')}
            className="h-8 rounded border border-slate-300 bg-white px-2.5 text-xs text-slate-700"
          >
            <option value="PIPING">배관 도면 (P&ID / GAR)</option>
            <option value="ELECTRICAL">전장 도면 (iCAMS / PSDS / Cable)</option>
          </select>
          <label className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50">
            <Upload className="h-3.5 w-3.5" />
            <span>PDF 파일 선택</span>
            <input type="file" accept="application/pdf,.pdf" onChange={handleFileChange} className="hidden" />
          </label>
          {uploadError && <span className="text-xs text-red-700">{uploadError}</span>}
        </div>

        {uploadedPdfs.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            {uploadedPdfs.map((u) => (
              <div
                key={u.id}
                className="inline-flex items-center gap-1.5 rounded border border-sky-200 bg-sky-50 px-2 py-1 text-[11px] text-sky-900"
              >
                <FileCheck2 className="h-3 w-3" />
                <span className="max-w-[160px] truncate">{u.name}</span>
                <button
                  type="button"
                  aria-label={`${u.name} 삭제`}
                  onClick={() => onRemoveUploadedPdf(u.id)}
                  className="text-slate-500 hover:text-red-700"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() =>
                onRunAiWithCustomPdfs(
                  uploadedPdfs.map((u) => ({
                    name: u.name,
                    role: u.role,
                    base64Data: u.base64Data,
                  }))
                )
              }
              className="inline-flex h-8 items-center rounded bg-sky-700 px-3 text-xs font-semibold text-white hover:bg-sky-800"
            >
              업로드 도면 포함 AI 병렬 검증
            </button>
          </div>
        )}
      </section>

      {/* Direct Issue-to-PDF Checklist & Active Error Callout */}
      <section className="overflow-hidden rounded border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2.5">
          <div className="flex flex-wrap items-center gap-2.5">
            <ListChecks className="h-4 w-4 text-sky-700" />
            <h2 className="text-xs font-semibold text-slate-900">
              결함·이슈 리스트 → PDF 페이지 바로 확인
            </h2>
            <span className="font-mono text-[11px] text-slate-500 tabular-nums">
              이슈 {issueLoops.length}건 / 전체 {evaluatedLoops.length}건
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setAutoInsertOnSelect((v) => !v)}
              aria-pressed={autoInsertOnSelect}
              className={`inline-flex h-7 items-center gap-1 rounded border px-2 text-[11px] font-medium transition-colors ${
                autoInsertOnSelect
                  ? 'border-sky-600 bg-sky-50 text-sky-900'
                  : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              <Crosshair className="h-3 w-3" />
              <span>클릭 시 자동 위치·노트 삽입 {autoInsertOnSelect ? 'ON' : 'OFF'}</span>
            </button>

            <div className="inline-flex rounded border border-slate-200 bg-white p-0.5 text-[11px]">
              <button
                type="button"
                onClick={() => setIssueListMode('ISSUES')}
                className={`rounded px-2 py-0.5 font-medium transition-colors ${
                  issueListMode === 'ISSUES'
                    ? 'bg-sky-700 text-white'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                이슈만 보기 ({issueLoops.length})
              </button>
              <button
                type="button"
                onClick={() => setIssueListMode('ALL')}
                className={`rounded px-2 py-0.5 font-medium transition-colors ${
                  issueListMode === 'ALL'
                    ? 'bg-sky-700 text-white'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                전체 루프 ({evaluatedLoops.length})
              </button>
            </div>

            <select
              aria-label="리스트 유닛 필터"
              value={issueUnitFilter}
              onChange={(e) => setIssueUnitFilter(e.target.value as 'ALL' | UnitCode)}
              className="h-7 rounded border border-slate-300 bg-white px-2 text-[11px] text-slate-700"
            >
              <option value="ALL">전체 유닛</option>
              <option value="100">100 (Regastainer)</option>
              <option value="200">200 (HP Pump)</option>
              <option value="400">400 (Utility)</option>
            </select>

            <input
              type="text"
              aria-label="이슈 리스트 검색"
              value={issueSearchQuery}
              onChange={(e) => setIssueSearchQuery(e.target.value)}
              placeholder="태그·오류 내용 검색..."
              className="h-7 w-40 rounded border border-slate-300 bg-white px-2 text-[11px] text-slate-900 placeholder:text-slate-400 focus:border-sky-600 focus:outline-none"
            />

            <button
              type="button"
              onClick={() => setIssueListExpanded((v) => !v)}
              aria-expanded={issueListExpanded}
              className="inline-flex h-7 items-center gap-1 rounded border border-slate-300 bg-white px-2 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
            >
              {issueListExpanded ? (
                <>
                  <ChevronUp className="h-3.5 w-3.5" />
                  <span>접기</span>
                </>
              ) : (
                <>
                  <ChevronDown className="h-3.5 w-3.5" />
                  <span>펼치기</span>
                </>
              )}
            </button>
          </div>
        </div>

        {issueListExpanded && (
          <div className="max-h-[152px] divide-y divide-slate-200 overflow-y-auto">
            {displayedChecklistLoops.length === 0 ? (
              <div className="py-6 text-center text-xs text-slate-500">
                필터 조건에 맞는 항목이 없습니다.
              </div>
            ) : (
              displayedChecklistLoops.map((loop) => {
                const isSelected = activeIssueLoop?.id === loop.id;
                const targets = resolveLoopPdfTargets(loop);
                const topDisc = loop.discrepancies[0];
                const isCritical = loop.discrepancies.some((d) => d.severity === 'CRITICAL');
                return (
                  <button
                    key={loop.id}
                    type="button"
                    onClick={() => onSelectIssueLoop(loop, autoInsertOnSelect)}
                    className={`flex w-full items-center justify-between gap-3 px-4 py-2 text-left text-xs transition-colors ${
                      isSelected ? 'bg-sky-50' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-2.5">
                      <span
                        className={`inline-flex shrink-0 items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[10px] font-semibold ${
                          loop.status === 'MATCHED'
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                            : isCritical || loop.status === 'CABLE_MISSING' || loop.status === 'CONFLICT'
                              ? 'border-red-200 bg-red-50 text-red-800'
                              : 'border-amber-200 bg-amber-50 text-amber-800'
                        }`}
                      >
                        {loop.status === 'MATCHED' ? (
                          <CheckCircle2 className="h-3 w-3" />
                        ) : isCritical ? (
                          <XCircle className="h-3 w-3" />
                        ) : (
                          <AlertTriangle className="h-3 w-3" />
                        )}
                        <span>{loop.statusLabelKo}</span>
                      </span>

                      <span className="shrink-0 font-mono text-[11px] font-semibold text-slate-500 tabular-nums">
                        {loop.unitCode}
                      </span>

                      <span className="shrink-0 font-mono font-semibold text-slate-900">
                        {loop.canonicalTag}
                      </span>

                      <span className="truncate text-slate-700">
                        {topDisc ? topDisc.title : loop.serviceName}
                      </span>
                    </div>

                    <div className="flex shrink-0 items-center gap-2 font-mono text-[11px] tabular-nums">
                      <span className="rounded border border-slate-200 bg-white px-2 py-0.5 text-slate-700">
                        좌 {targets.left.drawingId} p.{targets.left.pageNum}
                      </span>
                      <ArrowRightLeft className="h-3 w-3 text-slate-400" />
                      <span className="rounded border border-slate-200 bg-white px-2 py-0.5 text-sky-800">
                        우 {targets.right.drawingId} p.{targets.right.pageNum}
                      </span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        )}

        {/* Active Discrepancy Diagnosis Callout ("What's Wrong" synchronized to open PDFs) */}
        {activeIssueLoop && activeLoopPdfTargets && (
          <div className="border-t border-slate-200 bg-slate-50/70 px-4 py-3 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded border border-slate-300 bg-white px-1.5 py-0.5 font-mono text-[10px] font-semibold text-slate-700">
                  현재 PDF 대조 루프
                </span>
                <span className="font-mono text-sm font-bold text-slate-900">
                  {activeIssueLoop.canonicalTag}
                </span>
                <span className="text-slate-600">· {activeIssueLoop.serviceName}</span>
                <span className="font-mono text-[11px] text-slate-500 tabular-nums">
                  ({activeLoopPdfTargets.left.label} p.{activeLoopPdfTargets.left.pageNum} ↔{' '}
                  {activeLoopPdfTargets.right.label} p.{activeLoopPdfTargets.right.pageNum})
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => onSelectIssueLoop(activeIssueLoop, true)}
                  className="inline-flex h-7 items-center gap-1 rounded border border-slate-300 bg-white px-2 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                >
                  <ArrowRightLeft className="h-3 w-3" />
                  <span>좌/우 위치 탐색 재실행</span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onLocateAndAutoInsertOnPane('LEFT', {
                      drawingId: activeLoopPdfTargets.left.drawingId,
                      pageNum: activeLoopPdfTargets.left.pageNum,
                      searchTerms: buildSearchTermsForLoop(activeIssueLoop, 'LEFT'),
                      tagRef: activeIssueLoop.canonicalTag,
                      severity: activeIssueLoop.discrepancies[0]?.severity || 'WARNING',
                      content:
                        activeIssueLoop.discrepancies[0]?.description ||
                        `${activeIssueLoop.canonicalTag} 배관 도면 확인 메모`,
                    })
                  }
                  className="inline-flex h-7 items-center gap-1 rounded border border-sky-300 bg-white px-2 text-[11px] font-medium text-sky-800 hover:bg-sky-50"
                >
                  <MapPinPlus className="h-3 w-3" />
                  <span>좌측 도면(p.{activeLoopPdfTargets.left.pageNum}) 위치 찾아 자동 노트 삽입</span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onLocateAndAutoInsertOnPane('RIGHT', {
                      drawingId: activeLoopPdfTargets.right.drawingId,
                      pageNum: activeLoopPdfTargets.right.pageNum,
                      searchTerms: buildSearchTermsForLoop(activeIssueLoop, 'RIGHT'),
                      tagRef: activeIssueLoop.canonicalTag,
                      severity: activeIssueLoop.discrepancies[0]?.severity || 'WARNING',
                      content:
                        activeIssueLoop.discrepancies[0]?.description ||
                        `${activeIssueLoop.canonicalTag} 전장 도면 확인 메모`,
                    })
                  }
                  className="inline-flex h-7 items-center gap-1 rounded border border-sky-600 bg-sky-700 px-2 text-[11px] font-semibold text-white hover:bg-sky-800"
                >
                  <MapPinPlus className="h-3 w-3" />
                  <span>우측 도면(p.{activeLoopPdfTargets.right.pageNum}) 위치 찾아 자동 노트 삽입</span>
                </button>
              </div>
            </div>

            {activeIssueLoop.discrepancies.length > 0 ? (
              <div className="mt-2.5 grid grid-cols-1 gap-2 lg:grid-cols-2">
                {activeIssueLoop.discrepancies.map((d) => (
                  <div
                    key={d.id}
                    className={`rounded border px-3 py-2 ${
                      d.severity === 'CRITICAL'
                        ? 'border-red-200 bg-red-50/70'
                        : d.severity === 'WARNING'
                          ? 'border-amber-200 bg-amber-50/70'
                          : 'border-sky-200 bg-sky-50/70'
                    }`}
                  >
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span
                        className={`font-mono text-[10px] font-bold ${
                          d.severity === 'CRITICAL'
                            ? 'text-red-800'
                            : d.severity === 'WARNING'
                              ? 'text-amber-800'
                              : 'text-sky-800'
                        }`}
                      >
                        [{d.severity}]
                      </span>
                      <span className="font-semibold text-slate-900">{d.title}</span>
                    </div>
                    <p className="mt-1 text-[11px] leading-relaxed text-slate-800">
                      {d.description}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                      <span className="font-medium text-emerald-800">
                        권고 조치: {d.recommendedAction}
                      </span>
                      <span className="font-mono text-[10px] text-slate-500">
                        {d.affectedDrawings.join(' · ')}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-2 rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] text-emerald-900">
                P&amp;ID({activeIssueLoop.pid.sheet}), GAR({activeIssueLoop.gar?.sheet || '-'}), 전장 결선({activeIssueLoop.primarySystem} · {activeIssueLoop.primaryCableNo} · {activeIssueLoop.primaryJunctionBox}) 정합성이 정상 일치합니다.
              </div>
            )}
          </div>
        )}
      </section>

      {/* Real-Time Shared Review Session Bar */}
      <section
        aria-label="실시간 도면 공유 세션"
        className="overflow-hidden rounded border border-slate-200 bg-white"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2.5">
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex items-center gap-1.5">
              <Users className="h-4 w-4 text-sky-700" />
              <h2 className="text-xs font-semibold text-slate-900">
                실시간 도면 포인터 공유 세션
              </h2>
            </div>
            <span className="font-mono text-[11px] text-slate-500">
              세션 {sessionId}
            </span>
            <button
              type="button"
              onClick={handleCopySessionId}
              className="inline-flex h-6 items-center gap-1 rounded border border-slate-300 bg-white px-2 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
            >
              <Copy className="h-3 w-3" />
              <span>{copiedSessionId ? '복사됨' : '코드 복사'}</span>
            </button>
            <button
              type="button"
              onClick={() => setSharedSessionEnabled((v) => !v)}
              aria-pressed={sharedSessionEnabled}
              className={`inline-flex h-6 items-center gap-1 rounded border px-2 text-[11px] font-semibold transition-colors ${
                sharedSessionEnabled
                  ? 'border-emerald-600 bg-emerald-600 text-white'
                  : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              <Radio className="h-3 w-3" />
              <span>{sharedSessionEnabled ? '세션 동기화 ON' : '세션 동기화 OFF'}</span>
            </button>
          </div>

          {sharedSessionEnabled && (
            <div className="flex flex-wrap items-center gap-1.5">
              <select
                aria-label="공유 시야 동기화 배치"
                value={sessionPresetMode}
                onChange={(e) =>
                  setSessionPresetMode(e.target.value as SharedSessionPresetMode)
                }
                className="h-7 rounded border border-slate-300 bg-white px-2 text-[11px] text-slate-700"
              >
                <option value="SPLIT_PANES">좌측 도면 2명 · 우측 도면 1명 동시 검토</option>
                <option value="SAME_LEFT">모든 참여자 → 좌측 동일 도면 동시 포인팅</option>
                <option value="SAME_RIGHT">모든 참여자 → 우측 동일 도면 동시 포인팅</option>
              </select>

              <button
                type="button"
                onClick={() => setSimulationRunning((v) => !v)}
                aria-pressed={simulationRunning}
                className="inline-flex h-7 items-center gap-1 rounded border border-slate-300 bg-white px-2 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
              >
                {simulationRunning ? (
                  <>
                    <Pause className="h-3 w-3" />
                    <span>포인터 이동 일시정지</span>
                  </>
                ) : (
                  <>
                    <Play className="h-3 w-3" />
                    <span>포인터 이동 재개</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => handleTriggerPointerPing()}
                className="inline-flex h-7 items-center gap-1 rounded border border-sky-600 bg-sky-700 px-2.5 text-[11px] font-semibold text-white hover:bg-sky-800"
              >
                <Crosshair className="h-3 w-3" />
                <span>내 위치 Ping 보내기</span>
              </button>
            </div>
          )}
        </div>

        {sharedSessionEnabled && (
          <div className="grid grid-cols-1 gap-2 px-4 py-2.5 md:grid-cols-2 xl:grid-cols-4">
            {/* Local User Tile */}
            <div className="flex flex-col justify-center rounded border border-slate-200 bg-slate-50/70 px-2.5 py-2 text-xs">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-sm bg-teal-700" />
                  <span className="font-semibold text-slate-900">나 (현재 검토자)</span>
                </div>
                <span className="shrink-0 font-mono text-[10px] font-medium text-teal-800">
                  Shift+클릭 Ping
                </span>
              </div>
              <div className="mt-0.5 truncate font-mono text-[10px] text-slate-500 tabular-nums">
                {localPointer
                  ? `${localPointer.drawingId} p.${localPointer.pageNum} · X:${localPointer.xPct.toFixed(1)}% Y:${localPointer.yPct.toFixed(1)}%`
                  : '도면 위에 마우스를 올리면 좌표가 실시간 공유됩니다'}
              </div>
            </div>

            {/* Remote / Simulated Peer Tiles */}
            {activeParticipantsList.map((peer) => {
              const syncedOnLeft =
                peer.drawingId === leftId && peer.pageNum === leftCurrentPage;
              const syncedOnRight =
                peer.drawingId === rightId && peer.pageNum === rightCurrentPage;
              const isSameVisibleSheet = syncedOnLeft || syncedOnRight;

              return (
                <div
                  key={peer.participantId}
                  className="flex items-center justify-between gap-2 rounded border border-slate-200 bg-white px-2.5 py-2 text-xs"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span
                        style={{ backgroundColor: peer.color }}
                        className="h-2.5 w-2.5 shrink-0 rounded-sm"
                      />
                      <span className="font-semibold text-slate-900">{peer.name}</span>
                      <span className="text-[11px] text-slate-500">· {peer.roleLabel}</span>
                    </div>
                    <div className="mt-0.5 truncate font-mono text-[10px] text-slate-600 tabular-nums">
                      {peer.drawingId} p.{peer.pageNum} · X:{peer.xPct}% Y:{peer.yPct}%
                    </div>
                    {peer.statusMessage && (
                      <div className="mt-0.5 truncate text-[10px] text-slate-500">
                        {isSameVisibleSheet ? '동일 시트 동기화 · ' : '다른 시트 · '}
                        {peer.statusMessage}
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleFollowPeer(peer)}
                    title={`${peer.name} 위치(${peer.drawingId} p.${peer.pageNum})로 이동`}
                    className="inline-flex h-7 shrink-0 items-center gap-1 rounded border border-slate-300 bg-white px-2 text-[10px] font-medium text-slate-700 hover:border-sky-500 hover:text-sky-800"
                  >
                    <Navigation className="h-3 w-3" />
                    <span>따라가기</span>
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Side-by-Side Split PDF Comparison with Direct Pin Notes */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Left Pane: Piping PDF */}
        <section className="flex flex-col overflow-hidden rounded border border-slate-200 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-2.5">
            <div className="min-w-0 flex-1">
              <label className="block text-[11px] font-semibold text-sky-800">
                좌측 도면: 배관 (P&ID / GAR)
              </label>
              <select
                aria-label="좌측 배관 도면 선택"
                value={leftId}
                onChange={(e) => {
                  const nextId = e.target.value;
                  setLeftId(nextId);
                  setLeftPageJump({ drawingId: nextId, pageNum: 1, key: Date.now() });
                }}
                className="mt-1 h-8 w-full rounded border border-slate-300 bg-white px-2 text-xs text-slate-900"
              >
                <optgroup label="H042 기본 배관 도면">
                  {pipingDocs.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.drawingNo} · {d.titleKo}
                    </option>
                  ))}
                </optgroup>
                {uploadedPdfs.length > 0 && (
                  <optgroup label="업로드된 도면">
                    {uploadedPdfs.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name} ({u.role})
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
            </div>
            <a
              href={leftDoc.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-8 shrink-0 items-center gap-1 rounded border border-slate-200 px-2.5 text-xs text-slate-600 hover:bg-slate-50"
            >
              <span>원본 PDF</span>
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
          <div className="border-b border-slate-100 bg-slate-50 px-4 py-1.5 text-[11px] text-slate-600">
            <div className="truncate font-medium text-slate-800">{leftDoc.subtitle}</div>
            <div className="truncate text-[10px] text-slate-500">
              {leftDoc.highlights.join(' · ')}
            </div>
          </div>
          <PdfCanvasPane
            paneSide="LEFT"
            drawingId={leftDoc.id}
            url={leftDoc.url}
            title={leftDoc.title}
            externalPageRequest={leftPageJump}
            quickJumps={leftDoc.quickJumps}
            notesForDrawing={pinNotes.filter((n) => n.drawingId === leftDoc.id)}
            selectedNoteId={selectedNoteId}
            pendingPrefill={pendingNotePrefill}
            onClearPendingPrefill={onClearPendingPrefill}
            onSelectNote={(n) => setSelectedNoteId(n ? n.id : null)}
            onAddNote={onAddPinNote}
            onAutoInsertNote={onAutoInsertNote}
            onUpdateNote={onUpdatePinNote}
            onDeleteNote={onDeletePinNote}
            sharedSessionEnabled={sharedSessionEnabled}
            sharedPointers={visibleLeftPointers}
            localPointerCoord={
              localPointer?.paneSide === 'LEFT'
                ? { xPct: localPointer.xPct, yPct: localPointer.yPct }
                : null
            }
            onPageChange={handlePanePageChange}
            onLocalPointerMove={handleLocalPointerMove}
            onLocalPointerLeave={handleLocalPointerLeave}
            onLocalPointerPing={handleTriggerPointerPing}
          />
        </section>

        {/* Right Pane: Electrical PDF */}
        <section className="flex flex-col overflow-hidden rounded border border-slate-200 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-2.5">
            <div className="min-w-0 flex-1">
              <label className="block text-[11px] font-semibold text-slate-800">
                우측 도면: 전장 (iCAMS / PSDS)
              </label>
              <select
                aria-label="우측 전장 도면 선택"
                value={rightId}
                onChange={(e) => {
                  const nextId = e.target.value;
                  setRightId(nextId);
                  setRightPageJump({ drawingId: nextId, pageNum: 1, key: Date.now() });
                }}
                className="mt-1 h-8 w-full rounded border border-slate-300 bg-white px-2 text-xs text-slate-900"
              >
                <optgroup label="H042 기본 전장 도면">
                  {elecDocs.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.drawingNo} · {d.titleKo}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="첨부 요청서 · 기준 양식">
                  <option value="REQ-REV1-261118">
                    H042 전기 생산 설계관련 요청건 (첨부 보고서 양식 · 18p)
                  </option>
                </optgroup>
                {uploadedPdfs.length > 0 && (
                  <optgroup label="업로드된 도면">
                    {uploadedPdfs.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name} ({u.role})
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
            </div>
            <a
              href={rightDoc.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-8 shrink-0 items-center gap-1 rounded border border-slate-200 px-2.5 text-xs text-slate-600 hover:bg-slate-50"
            >
              <span>원본 PDF</span>
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
          <div className="border-b border-slate-100 bg-slate-50 px-4 py-1.5 text-[11px] text-slate-600">
            <div className="truncate font-medium text-slate-800">{rightDoc.subtitle}</div>
            <div className="truncate text-[10px] text-slate-500">
              {rightDoc.highlights.join(' · ')}
            </div>
          </div>
          <PdfCanvasPane
            paneSide="RIGHT"
            drawingId={rightDoc.id}
            url={rightDoc.url}
            title={rightDoc.title}
            externalPageRequest={rightPageJump}
            quickJumps={rightDoc.quickJumps}
            notesForDrawing={pinNotes.filter((n) => n.drawingId === rightDoc.id)}
            selectedNoteId={selectedNoteId}
            pendingPrefill={pendingNotePrefill}
            onClearPendingPrefill={onClearPendingPrefill}
            onSelectNote={(n) => setSelectedNoteId(n ? n.id : null)}
            onAddNote={onAddPinNote}
            onAutoInsertNote={onAutoInsertNote}
            onUpdateNote={onUpdatePinNote}
            onDeleteNote={onDeletePinNote}
            sharedSessionEnabled={sharedSessionEnabled}
            sharedPointers={visibleRightPointers}
            localPointerCoord={
              localPointer?.paneSide === 'RIGHT'
                ? { xPct: localPointer.xPct, yPct: localPointer.yPct }
                : null
            }
            onPageChange={handlePanePageChange}
            onLocalPointerMove={handleLocalPointerMove}
            onLocalPointerLeave={handleLocalPointerLeave}
            onLocalPointerPing={handleTriggerPointerPing}
          />
        </section>
      </div>

      {/* All On-Drawing Pin Notes Ledger */}
      <section className="rounded border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
          <div className="flex items-center gap-2">
            <StickyNote className="h-4 w-4 text-sky-700" />
            <h2 className="text-sm font-semibold text-slate-900">
              도면 핀 노트 목록 ({filteredNotes.length}건)
            </h2>
            <span className="text-xs text-slate-500">
              클릭하면 해당 도면 페이지로 이동하여 핀 위치를 표시합니다
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="노트 상태 필터"
              value={noteStatusFilter}
              onChange={(e) => setNoteStatusFilter(e.target.value as 'ALL' | NoteStatus)}
              className="h-8 rounded border border-slate-300 bg-white px-2.5 text-xs text-slate-700"
            >
              <option value="ALL">전체 상태 ({pinNotes.length})</option>
              <option value="OPEN">미해결 (OPEN)</option>
              <option value="IN_REVIEW">검토중 (IN_REVIEW)</option>
              <option value="RESOLVED">해결됨 (RESOLVED)</option>
            </select>

            <button
              type="button"
              onClick={handleExportNotes}
              className="inline-flex h-8 items-center gap-1.5 rounded border border-slate-300 bg-white px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              <Download className="h-3.5 w-3.5" />
              <span>노트 CSV</span>
            </button>

            <button
              type="button"
              onClick={onResetSeedNotes}
              className="inline-flex h-8 items-center gap-1.5 rounded border border-slate-300 bg-white px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>기본 노트 복원</span>
            </button>
          </div>
        </div>

        <div className="divide-y divide-slate-200">
          {filteredNotes.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-500">
              표시할 도면 노트가 없습니다. 위 도면 툴바의 &ldquo;도면 노트 추가&rdquo;를 눌러 원하는 위치에 노트를 찍어 보세요.
            </div>
          ) : (
            filteredNotes.map((note) => {
              const isSelected = note.id === selectedNoteId;
              return (
                <div
                  key={note.id}
                  onClick={() => handleJumpToNote(note)}
                  className={`flex cursor-pointer flex-wrap items-center justify-between gap-3 px-4 py-2.5 text-xs transition-colors ${
                    isSelected ? 'bg-sky-50' : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded border px-1.5 py-0.5 font-mono text-[10px] font-semibold ${
                          note.status === 'RESOLVED'
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                            : note.severity === 'CRITICAL'
                              ? 'border-red-200 bg-red-50 text-red-800'
                              : 'border-amber-200 bg-amber-50 text-amber-800'
                        }`}
                      >
                        {note.status}
                      </span>
                      <span className="font-mono font-semibold text-slate-900">{note.tagRef}</span>
                      <span className="text-slate-300">·</span>
                      <span className="font-mono text-[11px] text-sky-800">
                        {note.drawingId} (p.{note.pageNum})
                      </span>
                      <span className="font-mono text-[10px] text-slate-400 tabular-nums">
                        X:{note.xPct}% Y:{note.yPct}%
                      </span>
                    </div>
                    <p className="truncate text-slate-700">{note.content}</p>
                  </div>

                  <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                    {note.status !== 'RESOLVED' && (
                      <button
                        type="button"
                        onClick={() => onUpdatePinNote(note.id, { status: 'RESOLVED' })}
                        className="inline-flex h-7 items-center gap-1 rounded border border-emerald-300 bg-white px-2 text-[11px] font-medium text-emerald-800 hover:bg-emerald-50"
                      >
                        <Check className="h-3 w-3" />
                        <span>해결</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => onDeletePinNote(note.id)}
                      aria-label={`${note.tagRef} 노트 삭제`}
                      className="inline-flex h-7 w-7 items-center justify-center rounded border border-slate-200 text-slate-400 hover:border-red-300 hover:text-red-700"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
};
