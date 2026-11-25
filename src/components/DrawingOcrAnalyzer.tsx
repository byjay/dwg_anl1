import React, { useMemo, useState } from 'react';
import {
  FileSearch,
  ScanText,
  MapPinPlus,
  Search,
  Loader2,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertTriangle,
  PlusCircle,
  Upload,
  Cpu,
  Cable,
  Factory,
  GitCompare,
  Layers,
} from 'lucide-react';
import { H042_DRAWINGS } from '../data/h042Dataset';
import {
  DiscrepancySeverity,
  DrawingContentAnalysisReport,
  EquipmentCategory,
  ExtractedEntityKind,
  ExtractedPdfEntity,
  OcrPageResult,
  OcrScanZone,
  UniversalMatchStatus,
} from '../types/diagram';
import { analyzeDrawingsContent, DrawingScanTarget } from '../utils/drawingContentAnalyzer';
import { runCanvasOcrOnPdfPage } from '../utils/ocrAnalyzer';

type HintRole = 'PID_GAR' | 'ELECTRICAL_DIA' | 'CABLE_SCHEDULE' | 'MAKER_VENDOR' | 'AUTO';

interface UploadedPdfChoice {
  id: string;
  name: string;
  objectUrl: string;
  hintRole?: HintRole;
}

interface UploadedPdfPayload {
  id: string;
  name: string;
  role: 'PIPING' | 'ELECTRICAL';
  hintRole?: HintRole;
  objectUrl: string;
  base64Data: string;
  sizeLabel: string;
}

interface DrawingOcrAnalyzerProps {
  uploadedPdfs: UploadedPdfChoice[];
  onUploadPdf?: (item: UploadedPdfPayload) => void;
  analysisReport: DrawingContentAnalysisReport | null;
  onAnalysisComplete: (report: DrawingContentAnalysisReport) => void;
  ocrResults: OcrPageResult[];
  onOcrComplete: (result: OcrPageResult) => void;
  onRegisterOcrEntitiesToRules: (entities: ExtractedPdfEntity[]) => void;
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

const KIND_LABELS: Record<ExtractedEntityKind, string> = {
  TAG: '계기·밸브 태그',
  LINE_NO: '배관 라인번호',
  CABLE: '케이블 번호',
  JUNCTION_BOX: 'Junction Box',
  EQUIPMENT: '장비 번호',
  HOLD_OR_NOTE: 'HOLD · 주석',
  REVISION: '리비전 표기',
};

const EQUIP_CAT_LABELS: Record<EquipmentCategory, string> = {
  PUMP: '펌프 (Pump)',
  HEAT_EXCHANGER: '열교환기·히터',
  VESSEL_TANK: '베셀·탱크',
  COMPRESSOR: '압축기·블로워',
  MOTOR: '전동기 (Motor)',
  PANEL_SKID: '패널·스키드·VFD',
  VALVE_ACTUATOR: '밸브·구동기',
  OTHER: '기타 장비',
};

const MATCH_STATUS_META: Record<
  UniversalMatchStatus,
  { label: string; badgeClass: string }
> = {
  VARIANT_CONFLICT: {
    label: '표기 충돌',
    badgeClass: 'border-red-200 bg-red-50 text-red-800',
  },
  UNRESOLVED_ATTENTION: {
    label: '미확정·주의',
    badgeClass: 'border-amber-200 bg-amber-50 text-amber-800',
  },
  SINGLE_DRAWING_ONLY: {
    label: '단독 출현',
    badgeClass: 'border-slate-300 bg-slate-100 text-slate-700',
  },
  CROSS_MATCHED: {
    label: '다이어그램 매칭',
    badgeClass: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  },
};

const OCR_PRESETS: Array<{
  label: string;
  drawingId: string;
  pageNum: number;
  zone: OcrScanZone;
}> = [
  { label: 'GAR 100 03/07 (SDV Mark B, p.5)', drawingId: 'PD-100-GAR-0001', pageNum: 5, zone: 'FULL_PAGE' },
  { label: 'P&ID 200 13/15 (TI 131B 오기, p.16)', drawingId: 'PR-200-PID-0001', pageNum: 16, zone: 'TOP_RIGHT' },
  { label: 'GAR 200 04/07 (110-P 오기, p.6)', drawingId: 'PD-200-GAR-0001', pageNum: 6, zone: 'FULL_PAGE' },
  { label: 'PSDS H-06 (100-ZSO 오기, p.25)', drawingId: 'CI-000-DIA-0002', pageNum: 25, zone: 'TOP_RIGHT' },
  { label: 'P&ID 100 타이틀·리비전 블록 (p.1)', drawingId: 'PR-100-PID-0001', pageNum: 1, zone: 'TITLE_BLOCK' },
];

const ZONE_LABELS: Array<{ value: OcrScanZone; label: string }> = [
  { value: 'FULL_PAGE', label: '전체 페이지' },
  { value: 'TITLE_BLOCK', label: '우하단 타이틀/리비전 블록' },
  { value: 'TOP_LEFT', label: '좌상단 영역 (고해상도 크롭)' },
  { value: 'TOP_RIGHT', label: '우상단 영역 (고해상도 크롭)' },
  { value: 'BOTTOM_LEFT', label: '좌하단 영역 (고해상도 크롭)' },
  { value: 'BOTTOM_RIGHT', label: '우하단 영역 (고해상도 크롭)' },
];

export const DrawingOcrAnalyzer: React.FC<DrawingOcrAnalyzerProps> = ({
  uploadedPdfs,
  onUploadPdf,
  analysisReport,
  onAnalysisComplete,
  ocrResults,
  onOcrComplete,
  onRegisterOcrEntitiesToRules,
  onJumpToDrawingPage,
}) => {
  const allChoices = useMemo(() => {
    const base = H042_DRAWINGS.map((d) => ({
      id: d.id,
      label: `${d.id} · ${d.titleKo}`,
      url: d.pdfUrl,
      pageCount: d.pageCount,
      hintRole: undefined as HintRole | undefined,
    }));
    const custom = uploadedPdfs.map((u) => ({
      id: u.id,
      label: `[업로드] ${u.name}`,
      url: u.objectUrl,
      pageCount: 0,
      hintRole: u.hintRole || 'AUTO',
    }));
    return [...base, ...custom];
  }, [uploadedPdfs]);

  const [selectedIds, setSelectedIds] = useState<string[]>([
    'PR-200-PID-0001',
    'PD-200-GAR-0001',
    'CI-000-DIA-0001',
    'CI-000-DIA-0002',
  ]);
  const [uploadHintRole, setUploadHintRole] = useState<HintRole>('AUTO');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractProgress, setExtractProgress] = useState<{ donePages: number; drawingId: string } | null>(null);
  const [extractError, setExtractError] = useState<string | null>(null);

  const [analysisView, setAnalysisView] = useState<
    'MATCHES' | 'EQUIPMENT' | 'CABLES' | 'MAKER' | 'INDEX'
  >('MATCHES');
  const [matchStatusFilter, setMatchStatusFilter] = useState<'ALL' | UniversalMatchStatus>('ALL');
  const [kindFilter, setKindFilter] = useState<'ALL' | ExtractedEntityKind>('ALL');
  const [attentionOnly, setAttentionOnly] = useState(false);
  const [entityQuery, setEntityQuery] = useState('');

  // Interactive Tesseract OCR State
  const [ocrDrawingId, setOcrDrawingId] = useState('PD-100-GAR-0001');
  const [ocrPageNum, setOcrPageNum] = useState(5);
  const [ocrZone, setOcrZone] = useState<OcrScanZone>('FULL_PAGE');
  const [isOcrRunning, setIsOcrRunning] = useState(false);
  const [ocrProgress, setOcrProgress] = useState<{ status: string; pct: number } | null>(null);
  const [ocrError, setOcrError] = useState<string | null>(null);
  const [showWordOverlay, setShowWordOverlay] = useState(true);
  const [ocrSyncedNotice, setOcrSyncedNotice] = useState<string | null>(null);

  const latestOcr = ocrResults[0] || null;

  const toggleDrawingSelection = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleDirectUploadFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    setUploadError(null);
    const files = Array.from(e.target.files || []);
    if (files.length === 0 || !onUploadPdf) return;

    for (const file of files) {
      if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
        setUploadError('PDF 파일(.pdf)만 업로드할 수 있습니다.');
        continue;
      }
      if (file.size > 20 * 1024 * 1024) {
        setUploadError('개별 파일 크기는 20MB 이하로 업로드해 주세요.');
        continue;
      }

      const reader = new FileReader();
      reader.onload = () => {
        const base64Data = typeof reader.result === 'string' ? reader.result : '';
        const objectUrl = URL.createObjectURL(file);
        const id = `CUSTOM-${Date.now()}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
        const mappedRole: 'PIPING' | 'ELECTRICAL' =
          uploadHintRole === 'PID_GAR' ? 'PIPING' : 'ELECTRICAL';
        onUploadPdf({
          id,
          name: file.name,
          role: mappedRole,
          hintRole: uploadHintRole,
          objectUrl,
          base64Data,
          sizeLabel: `${(file.size / (1024 * 1024)).toFixed(2)} MB`,
        });
        setSelectedIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
        setOcrDrawingId(id);
        setOcrPageNum(1);
      };
      reader.readAsDataURL(file);
    }
    e.target.value = '';
  };

  const handleRunDeepExtraction = async () => {
    const targets: DrawingScanTarget[] = allChoices
      .filter((c) => selectedIds.includes(c.id))
      .map((c) => ({
        id: c.id,
        url: c.url,
        displayName: c.label,
        hintRole: c.hintRole,
      }));
    if (targets.length === 0) return;

    setIsExtracting(true);
    setExtractError(null);
    setExtractProgress({ donePages: 0, drawingId: targets[0].id });
    try {
      const report = await analyzeDrawingsContent(targets, (info) => {
        setExtractProgress(info);
      });
      onAnalysisComplete(report);
    } catch (err) {
      setExtractError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsExtracting(false);
    }
  };

  const handleRunOcr = async () => {
    const choice = allChoices.find((c) => c.id === ocrDrawingId);
    if (!choice) return;

    setIsOcrRunning(true);
    setOcrError(null);
    setOcrSyncedNotice(null);
    setOcrProgress({ status: '준비 중...', pct: 5 });
    try {
      const res = await runCanvasOcrOnPdfPage(choice.url, choice.id, ocrPageNum, {
        zone: ocrZone,
        onProgress: (status, progress) => {
          setOcrProgress({ status, pct: Math.round(progress * 100) });
        },
      });
      onOcrComplete(res);
    } catch (err) {
      setOcrError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsOcrRunning(false);
    }
  };

  const filteredPresence = useMemo(() => {
    if (!analysisReport) return [];
    const q = entityQuery.trim().toLowerCase();
    return analysisReport.crossDrawingPresence.filter((item) => {
      if (kindFilter !== 'ALL' && item.kind !== kindFilter) return false;
      if (attentionOnly && !item.hasAttentionFlag) return false;
      if (!q) return true;
      return (
        item.normalized.toLowerCase().includes(q) ||
        item.appearances.some(
          (a) =>
            a.drawingId.toLowerCase().includes(q) ||
            a.rawText.toLowerCase().includes(q)
        )
      );
    });
  }, [analysisReport, kindFilter, attentionOnly, entityQuery]);

  const filteredUniversalMatches = useMemo(() => {
    const list = analysisReport?.universalMatches || [];
    const q = entityQuery.trim().toLowerCase();
    return list.filter((m) => {
      if (matchStatusFilter !== 'ALL' && m.matchStatus !== matchStatusFilter) return false;
      if (!q) return true;
      return (
        m.displayTag.toLowerCase().includes(q) ||
        m.coreKey.toLowerCase().includes(q) ||
        m.summaryKo.toLowerCase().includes(q) ||
        m.linkedCableNos.some((c) => c.toLowerCase().includes(q)) ||
        m.linkedEquipment.some((eq) => eq.toLowerCase().includes(q))
      );
    });
  }, [analysisReport, matchStatusFilter, entityQuery]);

  const filteredEquipment = useMemo(() => {
    const list = analysisReport?.equipmentRecords || [];
    const q = entityQuery.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (eq) =>
        eq.normalizedTag.toLowerCase().includes(q) ||
        eq.ratingSpec.toLowerCase().includes(q) ||
        eq.description.toLowerCase().includes(q) ||
        eq.drawingId.toLowerCase().includes(q)
    );
  }, [analysisReport, entityQuery]);

  const filteredCables = useMemo(() => {
    const list = analysisReport?.cableRecords || [];
    const q = entityQuery.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (c) =>
        c.normalizedCableNo.toLowerCase().includes(q) ||
        c.cableSpec.toLowerCase().includes(q) ||
        c.fromEndpoint.toLowerCase().includes(q) ||
        c.toEndpoint.toLowerCase().includes(q) ||
        c.drawingId.toLowerCase().includes(q)
    );
  }, [analysisReport, entityQuery]);

  const makerProfiles = useMemo(
    () =>
      [...(analysisReport?.makerProfiles || [])].sort(
        (a, b) => Number(b.isMakerDrawing) - Number(a.isMakerDrawing)
      ),
    [analysisReport]
  );

  return (
    <div className="space-y-5">
      {/* Section 1: Universal Drawing Content, Equipment, Cable, Maker & Diagram Match Analysis */}
      <section className="rounded border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-4">
          <div className="min-w-0 flex-1">
            <h1 className="text-base font-semibold tracking-tight text-slate-900">
              범용 도면 전수 분석 (장비·케이블·메이커 도면·다이어그램 자동 매칭)
            </h1>
            <p className="mt-1 text-xs text-slate-600">
              H042 기본 도면은 물론 외부 배관도(P&amp;ID)·전장/결선도·케이블 스케줄·메이커(Vendor) 도면을 업로드해 장비 정보, 케이블 스펙·From/To, 단자대/인터페이스 및 도면 간 자동 매칭을 실행합니다.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {uploadedPdfs.length > 0 && (
              <button
                type="button"
                onClick={() => setSelectedIds(uploadedPdfs.map((u) => u.id))}
                className="h-8 rounded border border-sky-300 bg-sky-50 px-3 text-xs font-medium text-sky-800 hover:bg-sky-100"
              >
                업로드 도면만 선택 ({uploadedPdfs.length})
              </button>
            )}
            <button
              type="button"
              onClick={() => setSelectedIds(allChoices.map((c) => c.id))}
              className="h-8 rounded border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              전체 {allChoices.length}종 선택
            </button>
            <button
              type="button"
              onClick={() => void handleRunDeepExtraction()}
              disabled={isExtracting || selectedIds.length === 0}
              className="inline-flex h-8 items-center gap-1.5 rounded bg-sky-700 px-3.5 text-xs font-semibold text-white hover:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isExtracting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <FileSearch className="h-3.5 w-3.5" />
              )}
              <span>
                {isExtracting
                  ? `페이지 추출 중 (${extractProgress?.donePages ?? 0}p)...`
                  : `선택 도면 심층 추출 (${selectedIds.length}종)`}
              </span>
            </button>
          </div>
        </div>

        {/* Direct Arbitrary / Maker PDF Upload Bar */}
        {onUploadPdf && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded border border-slate-200 bg-slate-50 px-3 py-2">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-semibold text-slate-800">외부·메이커 도면 PDF 추가:</span>
              <select
                aria-label="업로드 도면 분석 유형"
                value={uploadHintRole}
                onChange={(e) => setUploadHintRole(e.target.value as HintRole)}
                className="h-7 rounded border border-slate-300 bg-white px-2 text-xs text-slate-800"
              >
                <option value="AUTO">자동 판별 (Auto)</option>
                <option value="PID_GAR">배관·배치도 (P&amp;ID / GAR)</option>
                <option value="ELECTRICAL_DIA">전장·결선 다이어그램</option>
                <option value="CABLE_SCHEDULE">케이블 스케줄 / 리스트</option>
                <option value="MAKER_VENDOR">메이커·벤더 도면 (Vendor/LCP)</option>
              </select>
              <label className="inline-flex h-7 cursor-pointer items-center gap-1.5 rounded border border-slate-300 bg-white px-2.5 text-xs font-medium text-slate-700 hover:border-sky-500 hover:bg-sky-50 hover:text-sky-900">
                <Upload className="h-3.5 w-3.5" />
                <span>PDF 업로드 (복수 선택 가능)</span>
                <input
                  type="file"
                  accept="application/pdf,.pdf"
                  multiple
                  onChange={handleDirectUploadFiles}
                  className="hidden"
                />
              </label>
            </div>
            {uploadError && <span className="text-xs text-red-700">{uploadError}</span>}
          </div>
        )}

        {/* Drawing Selection Checkboxes */}
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {allChoices.map((c) => {
            const checked = selectedIds.includes(c.id);
            return (
              <label
                key={c.id}
                className={`flex cursor-pointer items-center justify-between gap-2 rounded border px-3 py-2 text-xs transition-colors ${
                  checked
                    ? 'border-sky-300 bg-sky-50/70 text-slate-900'
                    : 'border-slate-200 bg-slate-50/50 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleDrawingSelection(c.id)}
                    className="h-3.5 w-3.5 accent-sky-700"
                  />
                  <span className="truncate font-medium">{c.label}</span>
                </span>
                <span className="shrink-0 font-mono text-[11px] text-slate-500 tabular-nums">
                  {c.pageCount > 0 ? `${c.pageCount}p` : 'PDF'}
                </span>
              </label>
            );
          })}
        </div>

        {extractError && (
          <div className="mt-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
            도면 추출 오류: {extractError}
          </div>
        )}

        {/* Extracted Metrics, Document Profiles & 5-Subtab Universal Analysis */}
        {analysisReport ? (
          <div className="mt-4 space-y-4">
            {/* KPI Summary Row */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2">
                <div className="text-[11px] text-slate-500">다이어그램 매칭</div>
                <div className="mt-0.5 font-mono text-lg font-semibold text-sky-800 tabular-nums">
                  {(analysisReport.universalMatches || []).length.toLocaleString()}
                </div>
              </div>
              <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2">
                <div className="text-[11px] text-slate-500">장비 정보</div>
                <div className="mt-0.5 font-mono text-lg font-semibold text-slate-900 tabular-nums">
                  {(analysisReport.equipmentRecords || []).length.toLocaleString()}
                </div>
              </div>
              <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2">
                <div className="text-[11px] text-slate-500">케이블 레코드</div>
                <div className="mt-0.5 font-mono text-lg font-semibold text-slate-900 tabular-nums">
                  {(analysisReport.cableRecords || []).length.toLocaleString()}
                </div>
              </div>
              <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2">
                <div className="text-[11px] text-slate-500">계기·밸브 태그</div>
                <div className="mt-0.5 font-mono text-lg font-semibold text-slate-900 tabular-nums">
                  {analysisReport.entityCountsByKind.TAG.toLocaleString()}
                </div>
              </div>
              <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2">
                <div className="text-[11px] text-slate-500">메이커 인터페이스</div>
                <div className="mt-0.5 font-mono text-lg font-semibold text-indigo-800 tabular-nums">
                  {makerProfiles.reduce((acc, m) => acc + m.interfacePoints.length, 0).toLocaleString()}
                </div>
              </div>
              <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2">
                <div className="text-[11px] text-slate-500">HOLD · 리비전</div>
                <div className="mt-0.5 font-mono text-lg font-semibold text-amber-800 tabular-nums">
                  {(
                    analysisReport.entityCountsByKind.HOLD_OR_NOTE +
                    analysisReport.entityCountsByKind.REVISION
                  ).toLocaleString()}
                </div>
              </div>
            </div>

            {/* Auto-Classified Document Profiles Strip */}
            {analysisReport.documentProfiles && analysisReport.documentProfiles.length > 0 && (
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-3">
                {analysisReport.documentProfiles.map((prof) => (
                  <div
                    key={prof.drawingId}
                    className="flex items-center justify-between gap-2 rounded border border-slate-200 bg-white px-3 py-2 text-xs"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`rounded border px-1.5 py-0.5 font-mono text-[10px] font-semibold ${
                            prof.isMakerDrawing
                              ? 'border-indigo-200 bg-indigo-50 text-indigo-800'
                              : prof.docClass === 'CABLE_SCHEDULE' || prof.docClass === 'ELECTRICAL_DIA'
                                ? 'border-sky-200 bg-sky-50 text-sky-800'
                                : 'border-emerald-200 bg-emerald-50 text-emerald-800'
                          }`}
                        >
                          {prof.docClassLabelKo}
                        </span>
                        <span className="truncate font-semibold text-slate-900">
                          {prof.displayName.replace(/^\[업로드\]\s*/, '')}
                        </span>
                      </div>
                      <div className="mt-0.5 truncate text-[11px] text-slate-500">
                        장비 {prof.equipmentCount} · 케이블 {prof.cableCount} · 태그 {prof.tagCount} · JB {prof.jbCount}
                      </div>
                    </div>
                    <span className="shrink-0 font-mono text-[11px] text-slate-500 tabular-nums">
                      {prof.pageCount}p
                    </span>
                  </div>
                ))}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 tabular-nums">
              <span>
                스캔 완료: 도면 {analysisReport.drawingsAnalyzed}종 · 총 {analysisReport.pagesScanned}페이지 · 고유 식별자 {analysisReport.crossDrawingPresence.length}개 · 소요 {(analysisReport.totalDurationMs / 1000).toFixed(2)}s
              </span>
              {analysisReport.pages.some((p) => p.needsOcrRecommended) && (
                <span className="font-medium text-amber-700">
                  OCR 권장 페이지 {analysisReport.pages.filter((p) => p.needsOcrRecommended).length}건 (벡터 텍스트 25개 미만)
                </span>
              )}
            </div>

            {/* 5-Subtab Switcher & Search */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setAnalysisView('MATCHES')}
                  className={`inline-flex h-8 items-center gap-1.5 rounded border px-2.5 text-xs font-semibold ${
                    analysisView === 'MATCHES'
                      ? 'border-sky-600 bg-sky-50 text-sky-800'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <GitCompare className="h-3.5 w-3.5" />
                  <span>다이어그램 매칭 ({(analysisReport.universalMatches || []).length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setAnalysisView('EQUIPMENT')}
                  className={`inline-flex h-8 items-center gap-1.5 rounded border px-2.5 text-xs font-semibold ${
                    analysisView === 'EQUIPMENT'
                      ? 'border-sky-600 bg-sky-50 text-sky-800'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <Cpu className="h-3.5 w-3.5" />
                  <span>장비 정보 ({(analysisReport.equipmentRecords || []).length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setAnalysisView('CABLES')}
                  className={`inline-flex h-8 items-center gap-1.5 rounded border px-2.5 text-xs font-semibold ${
                    analysisView === 'CABLES'
                      ? 'border-sky-600 bg-sky-50 text-sky-800'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <Cable className="h-3.5 w-3.5" />
                  <span>케이블 정보 ({(analysisReport.cableRecords || []).length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setAnalysisView('MAKER')}
                  className={`inline-flex h-8 items-center gap-1.5 rounded border px-2.5 text-xs font-semibold ${
                    analysisView === 'MAKER'
                      ? 'border-sky-600 bg-sky-50 text-sky-800'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <Factory className="h-3.5 w-3.5" />
                  <span>메이커 도면 분석 ({makerProfiles.filter((m) => m.isMakerDrawing).length}/{makerProfiles.length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setAnalysisView('INDEX')}
                  className={`inline-flex h-8 items-center gap-1.5 rounded border px-2.5 text-xs font-semibold ${
                    analysisView === 'INDEX'
                      ? 'border-sky-600 bg-sky-50 text-sky-800'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <Layers className="h-3.5 w-3.5" />
                  <span>전체 인덱스 ({analysisReport.crossDrawingPresence.length})</span>
                </button>
              </div>

              <div className="relative min-w-[230px]">
                <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  aria-label="추출 결과 검색"
                  value={entityQuery}
                  onChange={(e) => setEntityQuery(e.target.value)}
                  placeholder="태그, 장비, 케이블, 스펙, 단자대 검색..."
                  className="h-8 w-full rounded border border-slate-300 bg-white pr-3 pl-8 text-xs text-slate-900 focus:border-sky-600 focus:outline-none"
                />
              </div>
            </div>

            {/* Subtab 1: Universal Diagram Auto-Match */}
            {analysisView === 'MATCHES' && (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <select
                    aria-label="매칭 상태 필터"
                    value={matchStatusFilter}
                    onChange={(e) =>
                      setMatchStatusFilter(e.target.value as 'ALL' | UniversalMatchStatus)
                    }
                    className="h-8 rounded border border-slate-300 bg-white px-2.5 text-xs text-slate-700"
                  >
                    <option value="ALL">전체 매칭 상태 ({(analysisReport.universalMatches || []).length})</option>
                    <option value="VARIANT_CONFLICT">표기 충돌 (Variant Conflict)</option>
                    <option value="UNRESOLVED_ATTENTION">미확정·주의 (Attention)</option>
                    <option value="SINGLE_DRAWING_ONLY">단독 출현 (타 도면 미반영)</option>
                    <option value="CROSS_MATCHED">다이어그램 정상 매칭</option>
                  </select>
                  <span className="text-xs text-slate-500 tabular-nums">
                    표시 {Math.min(120, filteredUniversalMatches.length)} / {filteredUniversalMatches.length}건
                  </span>
                </div>

                <div className="max-h-[400px] overflow-auto rounded border border-slate-200">
                  <table className="w-full border-collapse text-left text-xs">
                    <thead className="sticky top-0 z-10 bg-slate-50 text-[11px] font-semibold text-slate-600">
                      <tr className="border-b border-slate-200">
                        <th className="px-3 py-2">매칭 판정</th>
                        <th className="px-3 py-2">식별자 / 코어</th>
                        <th className="px-3 py-2">연결 케이블 · 장비</th>
                        <th className="px-3 py-2">도면 분포 (배관/전장/메이커)</th>
                        <th className="px-3 py-2">판정 근거</th>
                        <th className="px-3 py-2 text-right">PDF 확인</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 bg-white">
                      {filteredUniversalMatches.slice(0, 120).map((m) => {
                        const meta = MATCH_STATUS_META[m.matchStatus];
                        return (
                          <tr key={m.id} className="hover:bg-slate-50">
                            <td className="px-3 py-2 whitespace-nowrap">
                              <span
                                className={`inline-block rounded border px-1.5 py-0.5 font-mono text-[10px] font-semibold ${meta.badgeClass}`}
                              >
                                {meta.label}
                              </span>
                            </td>
                            <td className="px-3 py-2 font-mono">
                              <div className="font-semibold text-slate-900">{m.displayTag}</div>
                              <div className="text-[10px] text-slate-500">{m.entityCategory}</div>
                            </td>
                            <td className="px-3 py-2 font-mono text-[11px] text-slate-700">
                              {m.linkedCableNos.length > 0 && (
                                <div className="truncate">CBL: {m.linkedCableNos.join(', ')}</div>
                              )}
                              {m.linkedEquipment.length > 0 && (
                                <div className="truncate text-slate-500">
                                  EQ: {m.linkedEquipment.join(', ')}
                                </div>
                              )}
                              {m.linkedCableNos.length === 0 && m.linkedEquipment.length === 0 && '-'}
                            </td>
                            <td className="px-3 py-2 font-mono text-[11px] text-slate-600">
                              {m.pidOrLayoutDrawings.length > 0 && (
                                <div>배관: {m.pidOrLayoutDrawings.join(', ')}</div>
                              )}
                              {m.electricalOrCableDrawings.length > 0 && (
                                <div className="text-sky-800">
                                  전장: {m.electricalOrCableDrawings.join(', ')}
                                </div>
                              )}
                              {m.makerDrawings.length > 0 && (
                                <div className="text-indigo-700">
                                  메이커: {m.makerDrawings.join(', ')}
                                </div>
                              )}
                            </td>
                            <td className="px-3 py-2 text-slate-700">{m.summaryKo}</td>
                            <td className="px-3 py-2 text-right whitespace-nowrap">
                              <button
                                type="button"
                                onClick={() =>
                                  onJumpToDrawingPage(
                                    m.primaryJump.drawingId,
                                    m.primaryJump.pageNum,
                                    {
                                      tagRef: m.displayTag,
                                      severity: m.severity,
                                      content: `[${meta.label}] ${m.summaryKo}`,
                                      searchTerms: [m.primaryJump.rawText, m.displayTag, ...m.variantsFound],
                                      autoInsert: true,
                                    }
                                  )
                                }
                                className="inline-flex h-7 items-center gap-1 rounded bg-sky-700 px-2.5 text-[11px] font-semibold text-white hover:bg-sky-800"
                              >
                                <MapPinPlus className="h-3 w-3" />
                                <span>p.{m.primaryJump.pageNum} 노트</span>
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Subtab 2: Equipment Registry */}
            {analysisView === 'EQUIPMENT' && (
              <div className="max-h-[400px] overflow-auto rounded border border-slate-200">
                <table className="w-full border-collapse text-left text-xs">
                  <thead className="sticky top-0 z-10 bg-slate-50 text-[11px] font-semibold text-slate-600">
                    <tr className="border-b border-slate-200">
                      <th className="px-3 py-2">장비 번호</th>
                      <th className="px-3 py-2">장비 분류</th>
                      <th className="px-3 py-2">정격 · 사양 (kW/V/용량)</th>
                      <th className="px-3 py-2">주변 텍스트 · 설명</th>
                      <th className="px-3 py-2">출현 도면</th>
                      <th className="px-3 py-2 text-right">PDF 위치</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white">
                    {filteredEquipment.slice(0, 120).map((eq) => (
                      <tr key={eq.id} className="hover:bg-slate-50">
                        <td className="px-3 py-2 font-mono font-semibold text-slate-900">
                          {eq.normalizedTag}
                        </td>
                        <td className="px-3 py-2 text-slate-700">
                          {EQUIP_CAT_LABELS[eq.category]}
                        </td>
                        <td className="px-3 py-2 font-mono text-sky-800">{eq.ratingSpec}</td>
                        <td className="max-w-xs truncate px-3 py-2 text-slate-600">
                          {eq.description}
                        </td>
                        <td className="px-3 py-2 font-mono text-[11px] text-slate-600">
                          {eq.drawingId} p.{eq.pageNum}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <button
                            type="button"
                            onClick={() =>
                              onJumpToDrawingPage(eq.drawingId, eq.pageNum, {
                                tagRef: eq.normalizedTag,
                                severity: eq.normalizedTag.startsWith('110-P-') ? 'CRITICAL' : 'INFO',
                                content: `장비 추출(${EQUIP_CAT_LABELS[eq.category]}): ${eq.normalizedTag} · 사양 ${eq.ratingSpec}`,
                                searchTerms: [eq.tag, eq.normalizedTag],
                                autoInsert: true,
                              })
                            }
                            className="inline-flex h-7 items-center gap-1 rounded border border-slate-300 bg-white px-2.5 text-[11px] font-medium text-sky-800 hover:border-sky-500 hover:bg-sky-50"
                          >
                            <MapPinPlus className="h-3 w-3" />
                            <span>위치·노트</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                    {filteredEquipment.length === 0 && (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-slate-500">
                          조건에 맞는 장비 정보가 없습니다.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* Subtab 3: Cable Registry */}
            {analysisView === 'CABLES' && (
              <div className="max-h-[400px] overflow-auto rounded border border-slate-200">
                <table className="w-full border-collapse text-left text-xs">
                  <thead className="sticky top-0 z-10 bg-slate-50 text-[11px] font-semibold text-slate-600">
                    <tr className="border-b border-slate-200">
                      <th className="px-3 py-2">케이블 번호</th>
                      <th className="px-3 py-2">신호 구분</th>
                      <th className="px-3 py-2">케이블 규격 (Spec/Core)</th>
                      <th className="px-3 py-2">시점 (From)</th>
                      <th className="px-3 py-2">종단 (To)</th>
                      <th className="px-3 py-2">출현 도면</th>
                      <th className="px-3 py-2 text-right">PDF 위치</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white">
                    {filteredCables.slice(0, 120).map((c) => (
                      <tr key={c.id} className="hover:bg-slate-50">
                        <td className="px-3 py-2 font-mono font-semibold text-slate-900">
                          {c.normalizedCableNo}
                        </td>
                        <td className="px-3 py-2 font-mono text-[11px]">
                          <span
                            className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold ${
                              c.signalCategory === 'UNASSIGNED'
                                ? 'border-red-200 bg-red-50 text-red-800'
                                : c.signalCategory === 'POWER'
                                  ? 'border-amber-200 bg-amber-50 text-amber-800'
                                  : 'border-slate-200 bg-slate-50 text-slate-700'
                            }`}
                          >
                            {c.signalCategory}
                          </span>
                        </td>
                        <td className="px-3 py-2 font-mono text-sky-800">{c.cableSpec}</td>
                        <td className="px-3 py-2 font-mono text-slate-700">{c.fromEndpoint}</td>
                        <td className="px-3 py-2 font-mono text-slate-700">{c.toEndpoint}</td>
                        <td className="px-3 py-2 font-mono text-[11px] text-slate-600">
                          {c.drawingId} p.{c.pageNum}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <button
                            type="button"
                            onClick={() =>
                              onJumpToDrawingPage(c.drawingId, c.pageNum, {
                                tagRef: c.normalizedCableNo,
                                severity: c.signalCategory === 'UNASSIGNED' ? 'WARNING' : 'INFO',
                                content: `케이블 추출: ${c.normalizedCableNo} (${c.cableSpec}) · ${c.fromEndpoint} → ${c.toEndpoint}`,
                                searchTerms: [c.cableNo, c.normalizedCableNo],
                                autoInsert: true,
                              })
                            }
                            className="inline-flex h-7 items-center gap-1 rounded border border-slate-300 bg-white px-2.5 text-[11px] font-medium text-sky-800 hover:border-sky-500 hover:bg-sky-50"
                          >
                            <MapPinPlus className="h-3 w-3" />
                            <span>위치·노트</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                    {filteredCables.length === 0 && (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-slate-500">
                          조건에 맞는 케이블 정보가 없습니다.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* Subtab 4: Maker / Vendor Drawing Analysis */}
            {analysisView === 'MAKER' && (
              <div className="space-y-3">
                {makerProfiles.map((mp) => (
                  <div
                    key={mp.drawingId}
                    className="rounded border border-slate-200 bg-slate-50/50 p-3.5"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded border px-1.5 py-0.5 font-mono text-[10px] font-semibold ${
                            mp.isMakerDrawing
                              ? 'border-indigo-200 bg-indigo-50 text-indigo-800'
                              : 'border-slate-300 bg-white text-slate-600'
                          }`}
                        >
                          {mp.isMakerDrawing ? '메이커/인터페이스 감지됨' : mp.docClass}
                        </span>
                        <span className="font-mono text-xs font-semibold text-slate-900">
                          {mp.drawingId}
                        </span>
                        <span className="text-xs text-slate-600">· {mp.vendorOrPackageHint}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 font-mono text-[11px] text-slate-600">
                        <span>전원: {mp.powerSpecs.join(', ') || '-'}</span>
                        <span>·</span>
                        <span>신호: {mp.signalStandards.join(', ') || '-'}</span>
                      </div>
                    </div>

                    <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
                      {/* Yard <-> Maker Tag Mapping & Scope Notes */}
                      <div className="rounded border border-slate-200 bg-white p-2.5">
                        <div className="mb-1.5 text-[11px] font-semibold text-slate-800">
                          Yard ↔ Maker 태그 매핑 ({mp.yardToMakerMappings.length}) · 경계 주석 ({mp.scopeNotes.length})
                        </div>
                        <div className="max-h-44 space-y-1.5 overflow-y-auto text-xs">
                          {mp.yardToMakerMappings.map((ym, i) => (
                            <div
                              key={i}
                              className="flex items-center justify-between gap-2 rounded border border-slate-100 bg-slate-50 px-2 py-1"
                            >
                              <div className="min-w-0">
                                <span className="font-mono font-semibold text-sky-800">
                                  {ym.yardTag}
                                </span>
                                <span className="mx-1 text-slate-400">↔</span>
                                <span className="font-mono font-semibold text-indigo-800">
                                  {ym.makerTag}
                                </span>
                                <div className="truncate text-[10px] text-slate-500">
                                  p.{ym.pageNum} · {ym.context}
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() =>
                                  onJumpToDrawingPage(mp.drawingId, ym.pageNum, {
                                    tagRef: ym.yardTag,
                                    severity: 'INFO',
                                    content: `메이커 태그 매핑: Yard ${ym.yardTag} ↔ Maker ${ym.makerTag}`,
                                    searchTerms: [ym.yardTag, ym.makerTag],
                                    autoInsert: true,
                                  })
                                }
                                className="shrink-0 rounded border border-slate-300 bg-white px-2 py-0.5 text-[10px] font-medium text-sky-800 hover:bg-sky-50"
                              >
                                PDF 이동
                              </button>
                            </div>
                          ))}
                          {mp.scopeNotes.map((sn, i) => (
                            <div
                              key={`sn-${i}`}
                              className="flex items-center justify-between gap-2 rounded border border-amber-100 bg-amber-50/50 px-2 py-1"
                            >
                              <div className="min-w-0">
                                <span className="mr-1.5 font-mono text-[10px] font-semibold text-amber-800">
                                  [{sn.owner}]
                                </span>
                                <span className="text-[11px] text-slate-700">{sn.text}</span>
                              </div>
                              <button
                                type="button"
                                onClick={() =>
                                  onJumpToDrawingPage(mp.drawingId, sn.pageNum, {
                                    tagRef: sn.owner,
                                    severity: 'WARNING',
                                    content: `메이커 공급 경계(${sn.owner}): ${sn.text}`,
                                    searchTerms: [sn.text.slice(0, 24)],
                                    autoInsert: true,
                                  })
                                }
                                className="shrink-0 rounded border border-slate-300 bg-white px-2 py-0.5 text-[10px] font-medium text-sky-800 hover:bg-sky-50"
                              >
                                p.{sn.pageNum}
                              </button>
                            </div>
                          ))}
                          {mp.yardToMakerMappings.length === 0 && mp.scopeNotes.length === 0 && (
                            <div className="py-4 text-center text-[11px] text-slate-400">
                              태그 매핑 또는 경계 주석(BY YARD / BY MAKER)이 검출되지 않았습니다.
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Terminal & I/O Interface Points */}
                      <div className="rounded border border-slate-200 bg-white p-2.5">
                        <div className="mb-1.5 text-[11px] font-semibold text-slate-800">
                          단자대(TB) · I/O 인터페이스 접점 ({mp.interfacePoints.length})
                        </div>
                        <div className="max-h-44 space-y-1.5 overflow-y-auto text-xs">
                          {mp.interfacePoints.map((pt) => (
                            <div
                              key={pt.id}
                              className="flex items-center justify-between gap-2 rounded border border-slate-100 bg-slate-50 px-2 py-1"
                            >
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5 font-mono">
                                  <span className="font-semibold text-slate-900">
                                    {pt.terminalOrPin}
                                  </span>
                                  <span className="rounded border border-slate-200 bg-white px-1 text-[10px] text-slate-600">
                                    {pt.ioType}
                                  </span>
                                  <span className="text-[11px] text-sky-800">{pt.signalDetail}</span>
                                </div>
                                <div className="truncate text-[10px] text-slate-500">
                                  p.{pt.pageNum} · {pt.rawContext}
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() =>
                                  onJumpToDrawingPage(mp.drawingId, pt.pageNum, {
                                    tagRef: pt.terminalOrPin,
                                    severity: 'INFO',
                                    content: `메이커 단자/I/O(${pt.ioType}): ${pt.terminalOrPin} · ${pt.signalDetail}`,
                                    searchTerms: [pt.terminalOrPin, pt.yardTagRef || '', pt.makerTagRef || ''].filter(Boolean),
                                    autoInsert: true,
                                  })
                                }
                                className="shrink-0 rounded border border-slate-300 bg-white px-2 py-0.5 text-[10px] font-medium text-sky-800 hover:bg-sky-50"
                              >
                                PDF 이동
                              </button>
                            </div>
                          ))}
                          {mp.interfacePoints.length === 0 && (
                            <div className="py-4 text-center text-[11px] text-slate-400">
                              단자대(TB/X) 또는 I/O(AI/DI/DO) 접점이 검출되지 않았습니다.
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Subtab 5: Full Cross-Drawing Entity Index */}
            {analysisView === 'INDEX' && (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      aria-label="엔티티 유형 필터"
                      value={kindFilter}
                      onChange={(e) => setKindFilter(e.target.value as 'ALL' | ExtractedEntityKind)}
                      className="h-8 rounded border border-slate-300 bg-white px-2.5 text-xs text-slate-700"
                    >
                      <option value="ALL">전체 유형 ({analysisReport.crossDrawingPresence.length})</option>
                      <option value="TAG">계기·밸브 태그</option>
                      <option value="LINE_NO">배관 라인번호</option>
                      <option value="CABLE">케이블 번호</option>
                      <option value="JUNCTION_BOX">Junction Box</option>
                      <option value="EQUIPMENT">장비 번호</option>
                      <option value="HOLD_OR_NOTE">HOLD · 주석</option>
                      <option value="REVISION">리비전 표기</option>
                    </select>
                    <label className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded border border-slate-300 bg-white px-2.5 text-xs text-slate-700">
                      <input
                        type="checkbox"
                        checked={attentionOnly}
                        onChange={(e) => setAttentionOnly(e.target.checked)}
                        className="h-3.5 w-3.5 accent-amber-600"
                      />
                      <span>주의/오기/HOLD 표기만</span>
                    </label>
                  </div>
                  <span className="text-xs text-slate-500 tabular-nums">
                    표시 {Math.min(120, filteredPresence.length)} / {filteredPresence.length}건
                  </span>
                </div>

                <div className="max-h-[380px] overflow-auto rounded border border-slate-200">
                  <table className="w-full border-collapse text-left text-xs">
                    <thead className="sticky top-0 z-10 bg-slate-50 text-[11px] font-semibold text-slate-600">
                      <tr className="border-b border-slate-200">
                        <th className="px-3 py-2">유형</th>
                        <th className="px-3 py-2">추출 식별자</th>
                        <th className="px-3 py-2 text-right">도면 수</th>
                        <th className="px-3 py-2">출현 위치 및 PDF 바로가기·자동 노트</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 bg-white">
                      {filteredPresence.slice(0, 120).map((item) => (
                        <tr
                          key={`${item.kind}-${item.normalized}`}
                          className={item.hasAttentionFlag ? 'bg-amber-50/40' : 'hover:bg-slate-50'}
                        >
                          <td className="px-3 py-2 whitespace-nowrap text-slate-600">
                            {KIND_LABELS[item.kind]}
                          </td>
                          <td className="px-3 py-2 font-mono font-semibold text-slate-900">
                            <div className="flex items-center gap-1.5">
                              {item.hasAttentionFlag && (
                                <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600" />
                              )}
                              <span>{item.normalized}</span>
                            </div>
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-slate-700 tabular-nums">
                            {item.drawingCount}종 · {item.appearances.length}회
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex flex-wrap gap-1.5">
                              {item.appearances.slice(0, 6).map((app, idx) => (
                                <button
                                  key={`${app.drawingId}-${app.pageNum}-${idx}`}
                                  type="button"
                                  onClick={() =>
                                    onJumpToDrawingPage(app.drawingId, app.pageNum, {
                                      tagRef: item.normalized,
                                      severity: item.hasAttentionFlag ? 'WARNING' : 'INFO',
                                      content: `도면 심층 추출(${KIND_LABELS[item.kind]}): ${app.rawText} (${app.drawingId} p.${app.pageNum})`,
                                      searchTerms: [app.rawText, item.normalized],
                                      autoInsert: true,
                                    })
                                  }
                                  className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2 py-0.5 font-mono text-[11px] text-sky-800 hover:border-sky-500 hover:bg-sky-50"
                                >
                                  <MapPinPlus className="h-3 w-3 shrink-0" />
                                  <span>
                                    {app.drawingId} p.{app.pageNum}
                                  </span>
                                </button>
                              ))}
                              {item.appearances.length > 6 && (
                                <span className="self-center font-mono text-[11px] text-slate-500">
                                  +{item.appearances.length - 6}
                                </span>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="mt-4 rounded border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-xs text-slate-600">
            상단의 <strong>선택 도면 심층 추출</strong>을 실행하면 H042 및 업로드한 외부·메이커 도면의 <strong>장비 정보·케이블 스펙·단자대·다이어그램 자동 매칭</strong>을 실시간으로 생성합니다.
          </div>
        )}
      </section>

      {/* Section 2: Real Browser-Side Tesseract.js Canvas OCR */}
      <section className="rounded border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-4">
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold tracking-tight text-slate-900">
              도면 이미지 OCR 분석 (Tesseract.js 로컬 비전 인식)
            </h2>
            <p className="mt-1 text-xs text-slate-600">
              스캔 도면이나 이미지로 병합된 SEASTAR 마크업·타이틀 블록·손상된 벡터 구간을 고배율 Canvas로 렌더링해 OCR 텍스트와 바운딩 좌표를 직접 추출합니다.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void handleRunOcr()}
            disabled={isOcrRunning}
            className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded bg-slate-900 px-3.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isOcrRunning ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <ScanText className="h-3.5 w-3.5" />
            )}
            <span>
              {isOcrRunning
                ? `OCR 인식 중 (${ocrProgress?.pct ?? 0}%)`
                : '이미지 OCR 분석 실행'}
            </span>
          </button>
        </div>

        {/* Quick Trouble-Sheet Presets */}
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-medium text-slate-500">주요 검증 프리셋:</span>
          {OCR_PRESETS.map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => {
                setOcrDrawingId(preset.drawingId);
                setOcrPageNum(preset.pageNum);
                setOcrZone(preset.zone);
              }}
              className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] text-slate-700 hover:border-sky-400 hover:bg-sky-50 hover:text-sky-900"
            >
              {preset.label}
            </button>
          ))}
        </div>

        {/* OCR Target Selector Bar */}
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-12">
          <div className="md:col-span-5">
            <label htmlFor="ocr-drawing-select" className="mb-1 block text-[11px] font-semibold text-slate-600">
              대상 도면 PDF
            </label>
            <select
              id="ocr-drawing-select"
              value={ocrDrawingId}
              onChange={(e) => setOcrDrawingId(e.target.value)}
              className="h-8 w-full rounded border border-slate-300 bg-white px-2.5 text-xs text-slate-900"
            >
              {allChoices.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <div className="md:col-span-2">
            <label htmlFor="ocr-page-input" className="mb-1 block text-[11px] font-semibold text-slate-600">
              페이지 번호
            </label>
            <input
              id="ocr-page-input"
              type="number"
              min={1}
              max={100}
              value={ocrPageNum}
              onChange={(e) => setOcrPageNum(Math.max(1, Number(e.target.value) || 1))}
              className="h-8 w-full rounded border border-slate-300 bg-white px-2.5 font-mono text-xs text-slate-900 tabular-nums"
            />
          </div>
          <div className="md:col-span-5">
            <label htmlFor="ocr-zone-select" className="mb-1 block text-[11px] font-semibold text-slate-600">
              OCR 스캔 구역 (고해상도 크롭 배율 자동 적용)
            </label>
            <select
              id="ocr-zone-select"
              value={ocrZone}
              onChange={(e) => setOcrZone(e.target.value as OcrScanZone)}
              className="h-8 w-full rounded border border-slate-300 bg-white px-2.5 text-xs text-slate-900"
            >
              {ZONE_LABELS.map((z) => (
                <option key={z.value} value={z.value}>
                  {z.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {isOcrRunning && ocrProgress && (
          <div className="mt-3 rounded border border-sky-200 bg-sky-50 px-3 py-2">
            <div className="flex items-center justify-between text-xs text-sky-900">
              <span>{ocrProgress.status}</span>
              <span className="font-mono tabular-nums">{ocrProgress.pct}%</span>
            </div>
            <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded bg-sky-100">
              <div
                className="h-full bg-sky-600 transition-all"
                style={{ width: `${ocrProgress.pct}%` }}
              />
            </div>
          </div>
        )}

        {ocrError && (
          <div className="mt-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
            OCR 처리 오류: {ocrError}
          </div>
        )}

        {latestOcr && (
          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-12">
            {/* Left: OCR Preview Canvas + Word BBox Overlay */}
            <div className="space-y-2 lg:col-span-7">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-800">
                  {latestOcr.drawingId} · p.{latestOcr.pageNum} ({latestOcr.zone})
                </span>
                <button
                  type="button"
                  onClick={() => setShowWordOverlay((v) => !v)}
                  className="inline-flex h-7 items-center gap-1 rounded border border-slate-300 bg-white px-2.5 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                >
                  {showWordOverlay ? (
                    <EyeOff className="h-3 w-3" />
                  ) : (
                    <Eye className="h-3 w-3" />
                  )}
                  <span>{showWordOverlay ? '인식 박스 숨김' : '인식 박스 표시'}</span>
                </button>
              </div>
              <div className="relative overflow-hidden rounded border border-slate-300 bg-slate-100">
                <img
                  src={latestOcr.previewDataUrl}
                  alt={`${latestOcr.drawingId} p.${latestOcr.pageNum} OCR preview`}
                  className="block h-auto w-full"
                />
                {showWordOverlay &&
                  latestOcr.words.slice(0, 250).map((w, idx) => (
                    <div
                      key={`${w.text}-${idx}`}
                      title={`${w.text} (${w.confidence}%)`}
                      style={{
                        left: `${w.leftPct}%`,
                        top: `${w.topPct}%`,
                        width: `${w.widthPct}%`,
                        height: `${w.heightPct}%`,
                      }}
                      className={`pointer-events-none absolute border ${
                        w.confidence >= 70
                          ? 'border-emerald-500/80 bg-emerald-400/10'
                          : 'border-amber-500/80 bg-amber-400/15'
                      }`}
                    />
                  ))}
              </div>
            </div>

            {/* Right: OCR Extracted Entities + Rule Integration + Raw Text */}
            <div className="space-y-3 lg:col-span-5">
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded border border-slate-200 bg-slate-50 px-2.5 py-2">
                  <div className="text-[11px] text-slate-500">평균 신뢰도</div>
                  <div className="font-mono text-sm font-semibold text-slate-900 tabular-nums">
                    {latestOcr.averageConfidence}%
                  </div>
                </div>
                <div className="rounded border border-slate-200 bg-slate-50 px-2.5 py-2">
                  <div className="text-[11px] text-slate-500">인식 단어</div>
                  <div className="font-mono text-sm font-semibold text-slate-900 tabular-nums">
                    {latestOcr.words.length}개
                  </div>
                </div>
                <div className="rounded border border-slate-200 bg-slate-50 px-2.5 py-2">
                  <div className="text-[11px] text-slate-500">도면 엔티티</div>
                  <div className="font-mono text-sm font-semibold text-sky-800 tabular-nums">
                    {latestOcr.extractedEntities.length}건
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-semibold text-slate-800">
                  OCR 파싱 엔티티 ({latestOcr.extractedEntities.length}건)
                </span>
                <button
                  type="button"
                  disabled={latestOcr.extractedEntities.length === 0}
                  onClick={() => {
                    onRegisterOcrEntitiesToRules(latestOcr.extractedEntities);
                    setOcrSyncedNotice(
                      `${latestOcr.extractedEntities.length}건의 OCR 엔티티를 룰 검토 엔진에 반영했습니다.`
                    );
                  }}
                  className="inline-flex h-7 items-center gap-1 rounded border border-sky-300 bg-sky-50 px-2.5 text-[11px] font-semibold text-sky-800 hover:bg-sky-100 disabled:opacity-50"
                >
                  <PlusCircle className="h-3 w-3" />
                  <span>OCR 결과 룰 검토 반영</span>
                </button>
              </div>

              {ocrSyncedNotice && (
                <div className="flex items-center gap-1.5 rounded border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-[11px] text-emerald-800">
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                  <span>{ocrSyncedNotice}</span>
                </div>
              )}

              <div className="max-h-56 space-y-1.5 overflow-y-auto rounded border border-slate-200 p-2">
                {latestOcr.extractedEntities.length > 0 ? (
                  latestOcr.extractedEntities.map((ent) => (
                    <div
                      key={ent.id}
                      className="flex items-center justify-between gap-2 rounded border border-slate-100 bg-slate-50 px-2.5 py-1.5 text-xs"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] font-medium text-slate-500">
                            {KIND_LABELS[ent.kind]}
                          </span>
                          <span className="font-mono font-semibold text-slate-900">
                            {ent.normalized}
                          </span>
                        </div>
                        <div className="truncate text-[11px] text-slate-500">
                          위치 ({ent.xPct}%, {ent.yPct}%) · 신뢰도 {ent.confidence ?? latestOcr.averageConfidence}%
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          onJumpToDrawingPage(ent.drawingId, ent.pageNum, {
                            tagRef: ent.normalized,
                            severity: 'INFO',
                            content: `OCR 추출(${KIND_LABELS[ent.kind]}): "${ent.text}" · 신뢰도 ${ent.confidence ?? latestOcr.averageConfidence}%`,
                            searchTerms: [ent.text, ent.normalized],
                            autoInsert: true,
                          })
                        }
                        className="inline-flex h-7 shrink-0 items-center gap-1 rounded bg-sky-700 px-2 text-[11px] font-semibold text-white hover:bg-sky-800"
                      >
                        <MapPinPlus className="h-3 w-3" />
                        <span>노트 삽입</span>
                      </button>
                    </div>
                  ))
                ) : (
                  <div className="py-4 text-center text-xs text-slate-500">
                    현재 크롭 영역에서 규격 엔티티 패턴이 적게 인식되었습니다. 영역을 좁혀(예: 우상단/타이틀블록) 다시 실행해 보세요.
                  </div>
                )}
              </div>

              <div>
                <div className="mb-1 flex items-center justify-between text-[11px] font-semibold text-slate-600">
                  <span>OCR 원문 텍스트 ({(latestOcr.durationMs / 1000).toFixed(2)}s)</span>
                </div>
                <pre className="max-h-40 overflow-auto rounded border border-slate-200 bg-slate-900 p-2.5 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-slate-100">
                  {latestOcr.fullText.trim() || '(인식된 텍스트 없음)'}
                </pre>
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
};
