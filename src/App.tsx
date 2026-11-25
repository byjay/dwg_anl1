import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { H042_LOOP_SEED_DATA } from './data/h042Dataset';
import {
  H042_SEED_PIN_NOTES,
  loadStoredPinNotes,
  saveStoredPinNotes,
} from './data/h042NotesSeed';
import {
  CustomPdfAttachment,
  DiagramLoopEntry,
  DiscrepancyItem,
  DiscrepancySeverity,
  DrawingContentAnalysisReport,
  DrawingPinNote,
  EvaluatedLoopMatch,
  ExtractedPdfEntity,
  OcrPageResult,
  ParallelAnalyzeResponse,
  ParallelBatchSummary,
  VerificationRule,
} from './types/diagram';
import {
  LoopFilterOptions,
  filterEvaluatedLoops,
  runParallelBatchMatch,
} from './utils/diagramMatcher';
import {
  buildCrossLayerDiffs,
  resolveDiaPage,
  resolveGarPage,
  resolveLoopPdfTargets,
  resolvePidPage,
} from './utils/diffEngine';
import { buildSearchTermsForLoop, upsertAutoNote } from './utils/pdfLocator';
import { LocalPdfFinding } from './utils/localPdfAudit';
import {
  DEFAULT_VERIFICATION_RULES,
  evaluateVerificationRules,
} from './utils/verificationRules';
import { TopBar, WorkbenchTab } from './components/TopBar';
import { CrossMatchMatrix } from './components/CrossMatchMatrix';
import { DiffCheckWorkspace } from './components/DiffCheckWorkspace';
import { DrawingOcrAnalyzer } from './components/DrawingOcrAnalyzer';
import { RuleReviewWorkspace } from './components/RuleReviewWorkspace';
import { LoopTraceInspector } from './components/LoopTraceInspector';
import {
  PdfFocusTarget,
  PendingNotePrefill,
  SplitPdfViewer,
} from './components/SplitPdfViewer';
import { FreeGeminiModel, ParallelAiVerifier } from './components/ParallelAiVerifier';
import { AddLoopModal } from './components/AddLoopModal';

interface UploadedPreviewItem {
  id: string;
  name: string;
  role: 'PIPING' | 'ELECTRICAL';
  hintRole?: 'PID_GAR' | 'ELECTRICAL_DIA' | 'CABLE_SCHEDULE' | 'MAKER_VENDOR' | 'AUTO';
  objectUrl: string;
  base64Data: string;
  sizeLabel: string;
}

const EMPTY_SUMMARY: ParallelBatchSummary = {
  totalLoops: 0,
  matchedCount: 0,
  cableMissingCount: 0,
  unassignedCircuitCount: 0,
  pidOnlyCount: 0,
  conflictCount: 0,
  revisionDriftCount: 0,
  criticalIssuesCount: 0,
  warningIssuesCount: 0,
  matchRatePercent: 0,
  batchDurationMs: 0,
  workerPartitionCount: 0,
  moduleBreakdown: [],
};

export default function App() {
  const [activeTab, setActiveTab] = useState<WorkbenchTab>('matrix');
  const [rawLoops, setRawLoops] = useState<DiagramLoopEntry[]>(H042_LOOP_SEED_DATA);
  const [evaluatedLoops, setEvaluatedLoops] = useState<EvaluatedLoopMatch[]>([]);
  const [summary, setSummary] = useState<ParallelBatchSummary>(EMPTY_SUMMARY);
  const [isBatchRunning, setIsBatchRunning] = useState(false);

  const [filters, setFilters] = useState<LoopFilterOptions>({
    unitCode: 'ALL',
    status: 'ALL',
    system: 'ALL',
    query: '',
  });

  const [selectedLoopId, setSelectedLoopId] = useState<string>(H042_LOOP_SEED_DATA[0].id);
  const [activePdfLoopId, setActivePdfLoopId] = useState<string>('LOOP-200-SDV-101');
  const [leftFocus, setLeftFocus] = useState<PdfFocusTarget>({
    drawingId: 'PR-200-PID-0001',
    pageNum: 18,
    key: 1,
  });
  const [rightFocus, setRightFocus] = useState<PdfFocusTarget>({
    drawingId: 'CI-000-DIA-0002',
    pageNum: 25,
    key: 1,
  });
  const [uploadedPdfs, setUploadedPdfs] = useState<UploadedPreviewItem[]>([]);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  const [pinNotes, setPinNotes] = useState<DrawingPinNote[]>(() => loadStoredPinNotes());
  const pinNotesRef = useRef<DrawingPinNote[]>(pinNotes);
  const [pendingNotePrefill, setPendingNotePrefill] = useState<PendingNotePrefill | null>(null);

  const [selectedAiModel, setSelectedAiModel] =
    useState<FreeGeminiModel>('gemini-3.1-flash-lite');
  const [aiResult, setAiResult] = useState<ParallelAnalyzeResponse | null>(null);
  const [isAiRunning, setIsAiRunning] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiFocusQuery, setAiFocusQuery] = useState('');

  // Deep PDF content extraction, OCR results & Verification Rules state
  const [analysisReport, setAnalysisReport] =
    useState<DrawingContentAnalysisReport | null>(null);
  const [cachedEntities, setCachedEntities] = useState<ExtractedPdfEntity[]>([]);
  const [ocrResults, setOcrResults] = useState<OcrPageResult[]>([]);
  const [registeredOcrEntities, setRegisteredOcrEntities] = useState<ExtractedPdfEntity[]>([]);
  const [verificationRules, setVerificationRules] = useState<VerificationRule[]>(
    DEFAULT_VERIFICATION_RULES
  );

  useEffect(() => {
    pinNotesRef.current = pinNotes;
    saveStoredPinNotes(pinNotes);
  }, [pinNotes]);

  const handleAutoInsertNote = useCallback(
    (candidate: Omit<DrawingPinNote, 'id' | 'createdAt'>): DrawingPinNote => {
      const res = upsertAutoNote(pinNotesRef.current, candidate);
      pinNotesRef.current = res.notes;
      setPinNotes(res.notes);
      return res.targetNote;
    },
    []
  );

  const executeParallelBatch = useCallback(async (entries: DiagramLoopEntry[]) => {
    setIsBatchRunning(true);
    try {
      const { results, summary: nextSummary } = await runParallelBatchMatch(entries);
      setEvaluatedLoops(results);
      setSummary(nextSummary);
    } finally {
      setIsBatchRunning(false);
    }
  }, []);

  useEffect(() => {
    void executeParallelBatch(rawLoops);
  }, [rawLoops, executeParallelBatch]);

  const filteredLoops = useMemo(
    () => filterEvaluatedLoops(evaluatedLoops, filters),
    [evaluatedLoops, filters]
  );

  const crossLayerDiffs = useMemo(() => buildCrossLayerDiffs(rawLoops), [rawLoops]);

  const allExtractedEntities = useMemo(() => {
    const merged: ExtractedPdfEntity[] = [];
    const seen = new Set<string>();
    const addList = (list: ExtractedPdfEntity[]) => {
      for (const e of list) {
        const key = `${e.drawingId}:${e.pageNum}:${e.kind}:${e.normalized}:${e.source}`;
        if (seen.has(key)) continue;
        seen.add(key);
        merged.push(e);
      }
    };
    if (analysisReport) addList(analysisReport.entities);
    addList(cachedEntities);
    addList(registeredOcrEntities);
    return merged;
  }, [analysisReport, cachedEntities, registeredOcrEntities]);

  const ruleViolations = useMemo(
    () =>
      evaluateVerificationRules({
        evaluatedLoops,
        extractedEntities: allExtractedEntities,
        rules: verificationRules,
        analysisReport,
      }),
    [evaluatedLoops, allExtractedEntities, verificationRules, analysisReport]
  );

  const customAttachments: CustomPdfAttachment[] = useMemo(
    () =>
      uploadedPdfs.map((u) => ({
        name: u.name,
        role: u.role,
        base64Data: u.base64Data,
      })),
    [uploadedPdfs]
  );

  const handleRunParallelAi = async (
    queryOverride?: string,
    attachmentsOverride?: CustomPdfAttachment[]
  ) => {
    setActiveTab('ai');
    setIsAiRunning(true);
    setAiError(null);
    try {
      const response = await fetch('/api/analyze-parallel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          focusQuery: queryOverride ?? aiFocusQuery,
          customAttachments: attachmentsOverride ?? customAttachments,
          model: selectedAiModel,
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || `HTTP ${response.status} 오류가 발생했습니다.`);
      }
      setAiResult(payload as ParallelAnalyzeResponse);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsAiRunning(false);
    }
  };

  const handleRunFocusedQuery = async (query: string, drawingIds: string[]) => {
    setActiveTab('ai');
    setIsAiRunning(true);
    setAiError(null);
    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query,
          drawingIds,
          customAttachments,
          model: selectedAiModel,
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || `HTTP ${response.status} 오류가 발생했습니다.`);
      }
      setAiResult(payload as ParallelAnalyzeResponse);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsAiRunning(false);
    }
  };

  const handleInspectLoop = (loopId: string) => {
    setSelectedLoopId(loopId);
    setActiveTab('trace');
  };

  const handleJumpToDrawingPage = (
    drawingId: string,
    pageNum: number,
    opts?: {
      tagRef: string;
      content: string;
      severity: DiscrepancySeverity;
      searchTerms?: string[];
      autoInsert?: boolean;
    }
  ) => {
    const now = Date.now();
    const shouldAutoInsert = opts ? opts.autoInsert !== false : false;
    const searchTerms =
      opts?.searchTerms && opts.searchTerms.length > 0
        ? opts.searchTerms
        : opts?.tagRef
          ? [opts.tagRef]
          : undefined;

    const focusTarget: PdfFocusTarget = {
      drawingId,
      pageNum,
      key: now,
      searchTerms,
      autoInsertNote:
        opts && shouldAutoInsert
          ? {
              tagRef: opts.tagRef,
              severity: opts.severity,
              content: opts.content,
            }
          : undefined,
    };

    const uploadedMatch = uploadedPdfs.find((u) => u.id === drawingId);
    const isRightPane =
      drawingId.startsWith('CI-') ||
      uploadedMatch?.role === 'ELECTRICAL' ||
      uploadedMatch?.hintRole === 'MAKER_VENDOR' ||
      uploadedMatch?.hintRole === 'CABLE_SCHEDULE';

    if (isRightPane) {
      setRightFocus(focusTarget);
    } else {
      setLeftFocus(focusTarget);
    }

    if (opts && !shouldAutoInsert) {
      setPendingNotePrefill({
        drawingId,
        pageNum,
        tagRef: opts.tagRef,
        severity: opts.severity,
        content: opts.content,
      });
    }
    setActiveTab('pdf');
  };

  const handleCompareSideBySide = (
    left: { drawingId: string; pageNum: number },
    right: { drawingId: string; pageNum: number },
    opts?: {
      tagRef: string;
      searchTerms: string[];
      severity: DiscrepancySeverity;
      content: string;
      autoInsert?: boolean;
    }
  ) => {
    const now = Date.now();
    const shouldAuto = opts?.autoInsert !== false && Boolean(opts);

    const normalizePair = (
      first: { drawingId: string; pageNum: number },
      second: { drawingId: string; pageNum: number }
    ) => {
      if (first.drawingId.startsWith('CI-') && !second.drawingId.startsWith('CI-')) {
        return { leftPane: second, rightPane: first };
      }
      return { leftPane: first, rightPane: second };
    };

    const { leftPane, rightPane } = normalizePair(left, right);
    setLeftFocus({
      drawingId: leftPane.drawingId,
      pageNum: leftPane.pageNum,
      key: now,
      searchTerms: opts?.searchTerms,
    });
    setRightFocus({
      drawingId: rightPane.drawingId,
      pageNum: rightPane.pageNum,
      key: now,
      searchTerms: opts?.searchTerms,
      autoInsertNote:
        shouldAuto && opts
          ? {
              tagRef: opts.tagRef,
              severity: opts.severity,
              content: opts.content,
            }
          : undefined,
    });
    setActiveTab('pdf');
  };

  const handleCompareLoopInPdf = (loop: EvaluatedLoopMatch, autoInsert = true) => {
    const targets = resolveLoopPdfTargets(loop);
    const now = Date.now();
    setActivePdfLoopId(loop.id);

    const topDisc = loop.discrepancies[0];
    const autoNotePayload = autoInsert
      ? {
          tagRef: loop.canonicalTag,
          severity: (topDisc?.severity || 'INFO') as DiscrepancySeverity,
          content: topDisc
            ? `${topDisc.title} — ${topDisc.recommendedAction}`
            : `${loop.canonicalTag} (${loop.serviceName}) 도면 대조 확인`,
        }
      : undefined;

    const garPrimaryOnly =
      loop.electricalPaths.length === 0 ||
      loop.gar?.markupCode === 'B' ||
      loop.gar?.markupCode === 'C';

    setLeftFocus({
      drawingId: targets.left.drawingId,
      pageNum: targets.left.pageNum,
      key: now,
      searchTerms: buildSearchTermsForLoop(loop, 'LEFT'),
      autoInsertNote: garPrimaryOnly ? autoNotePayload : undefined,
    });
    setRightFocus({
      drawingId: targets.right.drawingId,
      pageNum: targets.right.pageNum,
      key: now,
      searchTerms: buildSearchTermsForLoop(loop, 'RIGHT'),
      autoInsertNote: !garPrimaryOnly ? autoNotePayload : undefined,
    });
    setActiveTab('pdf');
  };

  const handleLocateAndAutoInsertOnPane = (
    side: 'LEFT' | 'RIGHT',
    target: {
      drawingId: string;
      pageNum: number;
      searchTerms: string[];
      tagRef: string;
      severity: DiscrepancySeverity;
      content: string;
    }
  ) => {
    const focus: PdfFocusTarget = {
      drawingId: target.drawingId,
      pageNum: target.pageNum,
      key: Date.now(),
      searchTerms: target.searchTerms,
      autoInsertNote: {
        tagRef: target.tagRef,
        severity: target.severity,
        content: target.content,
      },
    };
    if (side === 'LEFT') {
      setLeftFocus(focus);
    } else {
      setRightFocus(focus);
    }
  };

  const handleOpenLayerInPdf = (
    loop: EvaluatedLoopMatch,
    layer: 'PID' | 'GAR' | 'DIA',
    noteOverride?: { severity: DiscrepancySeverity; content: string }
  ) => {
    const now = Date.now();
    setActivePdfLoopId(loop.id);
    const topDisc = loop.discrepancies[0];
    const unitForPiping = loop.unitCode === '100' ? '100' : '200';
    const notePayload = {
      tagRef: loop.canonicalTag,
      severity: noteOverride?.severity || topDisc?.severity || 'INFO',
      content:
        noteOverride?.content ||
        (topDisc
          ? `${topDisc.title} — ${topDisc.recommendedAction}`
          : `${loop.canonicalTag} (${layer}) 도면 위치 확인`),
    };

    if (layer === 'PID') {
      const drawingId = `PR-${unitForPiping}-PID-0001`;
      const pageNum = resolvePidPage(loop.unitCode, loop.pid.sheet);
      setLeftFocus({
        drawingId,
        pageNum,
        key: now,
        searchTerms: buildSearchTermsForLoop(loop, 'LEFT'),
        autoInsertNote: notePayload,
      });
    } else if (layer === 'GAR') {
      const drawingId = `PD-${unitForPiping}-GAR-0001`;
      const pageNum = loop.gar ? resolveGarPage(loop.gar.sheet) : 1;
      setLeftFocus({
        drawingId,
        pageNum,
        key: now,
        searchTerms: buildSearchTermsForLoop(loop, 'LEFT'),
        autoInsertNote: notePayload,
      });
    } else {
      const primaryElec = loop.electricalPaths[0];
      const targets = resolveLoopPdfTargets(loop);
      const drawingId = targets.right.drawingId.startsWith('CI-')
        ? targets.right.drawingId
        : loop.unitCode === '100'
          ? 'CI-000-DIA-0001'
          : 'CI-000-DIA-0002';
      const pageNum = primaryElec
        ? targets.right.pageNum
        : 1;
      setRightFocus({
        drawingId,
        pageNum,
        key: now,
        searchTerms: buildSearchTermsForLoop(loop, 'RIGHT'),
        autoInsertNote: notePayload,
      });
    }
    setActiveTab('pdf');
  };

  const handleJumpToDiscrepancyPdf = (loop: EvaluatedLoopMatch, disc: DiscrepancyItem) => {
    const firstAffected = disc.affectedDrawings[0] || '';
    const layer: 'PID' | 'GAR' | 'DIA' = firstAffected.startsWith('PD-')
      ? 'GAR'
      : firstAffected.startsWith('PR-')
        ? 'PID'
        : loop.electricalPaths.length > 0
          ? 'DIA'
          : loop.gar
            ? 'GAR'
            : 'PID';
    handleOpenLayerInPdf(loop, layer, {
      severity: disc.severity,
      content: `${disc.title} — ${disc.recommendedAction}`,
    });
  };

  const handleJumpToLocalFinding = (finding: LocalPdfFinding) => {
    const matchedLoop = evaluatedLoops.find(
      (l) =>
        l.canonicalTag.toUpperCase() === finding.tag.toUpperCase() ||
        l.pid.rawTag.toUpperCase().includes(finding.tag.toUpperCase())
    );
    if (matchedLoop) {
      setActivePdfLoopId(matchedLoop.id);
    }
    handleJumpToDrawingPage(finding.drawingId, finding.pageNum, {
      tagRef: finding.tag,
      severity: finding.severity,
      content: `${finding.finding} — ${finding.recommendation}`,
      searchTerms: [finding.matchedText, finding.tag],
      autoInsert: true,
    });
  };

  const handleJumpToAiFinding = (
    finding: {
      tag: string;
      severity: DiscrepancySeverity;
      finding: string;
      sourceEvidence: string;
      recommendation: string;
    },
    drawingIds: string[]
  ) => {
    const matchedLoop = evaluatedLoops.find(
      (l) =>
        l.canonicalTag.toUpperCase() === finding.tag.toUpperCase() ||
        l.pid.rawTag.toUpperCase().includes(finding.tag.toUpperCase())
    );
    if (matchedLoop) {
      setActivePdfLoopId(matchedLoop.id);
      const targets = resolveLoopPdfTargets(matchedLoop);
      const evidenceUpper = finding.sourceEvidence.toUpperCase();
      const targetIsElec =
        evidenceUpper.includes('DIA') ||
        evidenceUpper.includes('ISJB') ||
        evidenceUpper.includes('PSDS') ||
        evidenceUpper.includes('ICAMS');
      const targetDrawing = targetIsElec
        ? targets.right.drawingId
        : targets.left.drawingId;
      const targetPage = targetIsElec ? targets.right.pageNum : targets.left.pageNum;
      handleJumpToDrawingPage(targetDrawing, targetPage, {
        tagRef: finding.tag,
        severity: finding.severity,
        content: `${finding.finding} — ${finding.recommendation}`,
        searchTerms: [
          finding.tag,
          ...buildSearchTermsForLoop(matchedLoop, targetIsElec ? 'RIGHT' : 'LEFT'),
        ],
        autoInsert: true,
      });
      return;
    }

    const fallbackDrawing =
      drawingIds.find((d) => d.startsWith('CI-')) || drawingIds[0] || 'CI-000-DIA-0002';
    handleJumpToDrawingPage(fallbackDrawing, 1, {
      tagRef: finding.tag,
      severity: finding.severity,
      content: `${finding.finding} — ${finding.recommendation}`,
      searchTerms: [finding.tag],
      autoInsert: true,
    });
  };

  const handleOpenSuggestedPdfs = (
    pidDrawingId: string,
    pidSheet: string,
    elecDrawingId: string,
    elecSheet: string
  ) => {
    const now = Date.now();
    const unitCode = pidDrawingId.includes('100') ? '100' : '200';
    const elecSystem = elecDrawingId === 'CI-000-DIA-0002' ? 'PSDS' : 'ICAMS';
    setLeftFocus({
      drawingId: pidDrawingId,
      pageNum: resolvePidPage(unitCode, pidSheet),
      key: now,
    });
    setRightFocus({
      drawingId: elecDrawingId,
      pageNum: resolveDiaPage(elecSystem, elecSheet),
      key: now,
    });
    setActiveTab('pdf');
  };

  const handleAskAiForLoop = (loop: EvaluatedLoopMatch) => {
    const prompt = `${loop.canonicalTag} (${loop.serviceName}) 루프에 대해 P&ID(${loop.pid.sheet}), GAR(${loop.gar?.sheet || 'N/A'}), 전장 결선도(${loop.electricalPaths.map((p) => `${p.system} ${p.blockSheet}/${p.connectionSheet}`).join(', ') || '미연결'})를 대조하여 태그, 케이블 번호, JB 및 결선 불일치를 검증해 주세요.`;
    setAiFocusQuery(prompt);
    const targetDrawings = [
      loop.unitCode === '100' ? 'PR-100-PID-0001' : 'PR-200-PID-0001',
      loop.unitCode === '100' ? 'PD-100-GAR-0001' : 'PD-200-GAR-0001',
      'CI-000-DIA-0001',
      'CI-000-DIA-0002',
    ];
    void handleRunFocusedQuery(prompt, targetDrawings);
  };

  const handleAddCustomLoop = (entry: DiagramLoopEntry) => {
    setRawLoops((prev) => [entry, ...prev]);
    setSelectedLoopId(entry.id);
  };

  const issueCount =
    summary.cableMissingCount +
    summary.unassignedCircuitCount +
    summary.pidOnlyCount +
    summary.conflictCount +
    summary.revisionDriftCount;

  const openNoteCount = pinNotes.filter((n) => n.status !== 'RESOLVED').length;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <TopBar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        onOpenUploadPdf={() => setActiveTab('pdf')}
        onRunParallelAi={() => void handleRunParallelAi()}
        isAiRunning={isAiRunning}
        totalLoops={summary.totalLoops}
        issueCount={issueCount}
        openNoteCount={openNoteCount}
        ruleViolationCount={ruleViolations.length}
      />

      <main className="mx-auto max-w-[1440px] px-5 py-5">
        {activeTab === 'matrix' && (
          <CrossMatchMatrix
            loops={evaluatedLoops}
            filteredLoops={filteredLoops}
            summary={summary}
            filters={filters}
            onChangeFilters={setFilters}
            onRerunParallelMatch={() => void executeParallelBatch(rawLoops)}
            onInspectLoop={handleInspectLoop}
            onCompareInPdf={handleCompareLoopInPdf}
            onOpenAddLoop={() => setIsAddModalOpen(true)}
            isBatchRunning={isBatchRunning}
            analysisReport={analysisReport}
            diffs={crossLayerDiffs}
            ruleViolations={ruleViolations}
            pinNotes={pinNotes}
          />
        )}

        {activeTab === 'diff' && (
          <DiffCheckWorkspace
            diffs={crossLayerDiffs}
            uploadedPdfs={uploadedPdfs.map((u) => ({
              id: u.id,
              name: u.name,
              objectUrl: u.objectUrl,
            }))}
            cachedEntities={allExtractedEntities}
            onCacheExtractedEntities={(ents) =>
              setCachedEntities((prev) => [...prev, ...ents])
            }
            onJumpToDrawingPage={handleJumpToDrawingPage}
            onCompareSideBySide={handleCompareSideBySide}
          />
        )}

        {activeTab === 'drawing-ocr' && (
          <DrawingOcrAnalyzer
            uploadedPdfs={uploadedPdfs.map((u) => ({
              id: u.id,
              name: u.name,
              objectUrl: u.objectUrl,
              hintRole: u.hintRole,
            }))}
            onUploadPdf={(item) => setUploadedPdfs((prev) => [...prev, item])}
            analysisReport={analysisReport}
            onAnalysisComplete={(report) => setAnalysisReport(report)}
            ocrResults={ocrResults}
            onOcrComplete={(res) => setOcrResults((prev) => [res, ...prev])}
            onRegisterOcrEntitiesToRules={(ents) =>
              setRegisteredOcrEntities((prev) => [...ents, ...prev])
            }
            onJumpToDrawingPage={handleJumpToDrawingPage}
          />
        )}

        {activeTab === 'rules' && (
          <RuleReviewWorkspace
            rules={verificationRules}
            onToggleRule={(ruleId) =>
              setVerificationRules((prev) =>
                prev.map((r) => (r.id === ruleId ? { ...r, enabled: !r.enabled } : r))
              )
            }
            onChangeRuleSeverity={(ruleId, severity) =>
              setVerificationRules((prev) =>
                prev.map((r) => (r.id === ruleId ? { ...r, defaultSeverity: severity } : r))
              )
            }
            onAddCustomRule={(rule) =>
              setVerificationRules((prev) => [...prev, rule])
            }
            onDeleteCustomRule={(ruleId) =>
              setVerificationRules((prev) => prev.filter((r) => r.id !== ruleId))
            }
            violations={ruleViolations}
            extractedEntityCount={allExtractedEntities.length}
            onOpenDeepAnalyzer={() => setActiveTab('drawing-ocr')}
            onJumpToDrawingPage={handleJumpToDrawingPage}
          />
        )}

        {activeTab === 'trace' && (
          <LoopTraceInspector
            loops={evaluatedLoops}
            selectedLoopId={selectedLoopId}
            onSelectLoop={setSelectedLoopId}
            onOpenLayerInPdf={(loop, layer) => handleOpenLayerInPdf(loop, layer)}
            onCompareLoopInPdf={handleCompareLoopInPdf}
            onJumpToDiscrepancyPdf={handleJumpToDiscrepancyPdf}
            onAskAiForLoop={handleAskAiForLoop}
          />
        )}

        {activeTab === 'pdf' && (
          <SplitPdfViewer
            leftFocus={leftFocus}
            rightFocus={rightFocus}
            evaluatedLoops={evaluatedLoops}
            activeIssueLoopId={activePdfLoopId}
            onSelectIssueLoop={handleCompareLoopInPdf}
            onLocateAndAutoInsertOnPane={handleLocateAndAutoInsertOnPane}
            onAutoInsertNote={handleAutoInsertNote}
            uploadedPdfs={uploadedPdfs}
            pinNotes={pinNotes}
            pendingNotePrefill={pendingNotePrefill}
            onClearPendingPrefill={() => setPendingNotePrefill(null)}
            onAddPinNote={(note) => setPinNotes((prev) => [note, ...prev])}
            onUpdatePinNote={(id, patch) =>
              setPinNotes((prev) => prev.map((n) => (n.id === id ? { ...n, ...patch } : n)))
            }
            onDeletePinNote={(id) =>
              setPinNotes((prev) => prev.filter((n) => n.id !== id))
            }
            onResetSeedNotes={() => setPinNotes(H042_SEED_PIN_NOTES)}
            onUploadPdf={(item) => setUploadedPdfs((prev) => [...prev, item])}
            onRemoveUploadedPdf={(id) =>
              setUploadedPdfs((prev) => prev.filter((item) => item.id !== id))
            }
            onRunAiWithCustomPdfs={(atts) => void handleRunParallelAi(undefined, atts)}
          />
        )}

        {activeTab === 'ai' && (
          <ParallelAiVerifier
            result={aiResult}
            isRunning={isAiRunning}
            error={aiError}
            customAttachments={customAttachments}
            initialFocusQuery={aiFocusQuery}
            selectedModel={selectedAiModel}
            onChangeModel={setSelectedAiModel}
            onRunParallelAudit={(q) => void handleRunParallelAi(q)}
            onRunFocusedQuery={(q, ids) => void handleRunFocusedQuery(q, ids)}
            onJumpToLocalFinding={handleJumpToLocalFinding}
            onJumpToAiFinding={handleJumpToAiFinding}
          />
        )}
      </main>

      <AddLoopModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onAddLoop={handleAddCustomLoop}
        onOpenSuggestedPdfs={handleOpenSuggestedPdfs}
      />
    </div>
  );
}
