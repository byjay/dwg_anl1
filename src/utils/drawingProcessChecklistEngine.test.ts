import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateDrawingProcessChecklist,
  PROCESS_STAGES,
} from './drawingProcessChecklistEngine.ts';
import {
  buildSapIncompleteHtmlReport,
  buildSapIncompleteReportPayload,
  exportSapIncompleteCsv,
  exportSapIncompleteJson,
} from './sapReportExporter.ts';
import { H042_LOOP_SEED_DATA } from '../data/h042Dataset.ts';
import { H042_SEED_PIN_NOTES } from '../data/h042NotesSeed.ts';
import { evaluateLoopEntry } from './diagramMatcher.ts';
import { buildCrossLayerDiffs } from './diffEngine.ts';
import { SEED_LEARNED_RULES } from './learnedKnowledgeEngine.ts';
import { evaluateSpecCompliance } from './specReviewEngine.ts';
import {
  DEFAULT_VERIFICATION_RULES,
  evaluateVerificationRules,
} from './verificationRules.ts';
import type { DrawingContentAnalysisReport } from '../types/diagram.ts';

describe('Drawing Process Checklist Engine & SAP Incomplete Reporter', () => {
  it('auto-generates 4-stage P&ID, GAR, Electrical, and Cross-Gate checklist items from all analysis results', () => {
    const evaluatedLoops = H042_LOOP_SEED_DATA.map(evaluateLoopEntry);
    const crossLayerDiffs = buildCrossLayerDiffs(evaluatedLoops);
    const specReport = evaluateSpecCompliance({
      evaluatedLoops,
      missingCableRows: [],
      learnedRules: SEED_LEARNED_RULES,
    });
    const ruleViolations = evaluateVerificationRules({
      evaluatedLoops,
      extractedEntities: [],
      rules: DEFAULT_VERIFICATION_RULES,
      analysisReport: null,
    });

    const evalResult = evaluateDrawingProcessChecklist({
      evaluatedLoops,
      crossLayerDiffs,
      ruleViolations,
      specReport,
      pinNotes: H042_SEED_PIN_NOTES,
      analysisReport: null,
      aiResult: null,
    });

    assert.equal(PROCESS_STAGES.length, 4);
    assert.ok(evalResult.items.length >= 17);
    assert.ok(evalResult.summary.byStage.every((s) => s.total >= 4));
    assert.ok(evalResult.incompleteItems.length > 0);
    assert.equal(evalResult.summary.releaseGateReady, false);

    // Final release gate must be HOLD_BLOCKED while critical items remain open
    const releaseGate = evalResult.items.find((i) => i.code === 'CHK-GATE-04');
    assert.ok(releaseGate);
    assert.equal(releaseGate.autoStatus, 'HOLD_BLOCKED');
    assert.equal(releaseGate.effectiveCompleted, false);
  });

  it('reacts in real time to manual sign-offs and exports SAP ALV CSV, HTML, and RFC JSON only for incomplete items', () => {
    const evaluatedLoops = H042_LOOP_SEED_DATA.map(evaluateLoopEntry);
    const crossLayerDiffs = buildCrossLayerDiffs(evaluatedLoops);
    const specReport = evaluateSpecCompliance({
      evaluatedLoops,
      missingCableRows: [],
      learnedRules: SEED_LEARNED_RULES,
    });
    const ruleViolations = evaluateVerificationRules({
      evaluatedLoops,
      extractedEntities: [],
      rules: DEFAULT_VERIFICATION_RULES,
      analysisReport: null,
    });

    const initial = evaluateDrawingProcessChecklist({
      evaluatedLoops,
      crossLayerDiffs,
      ruleViolations,
      specReport,
      pinNotes: H042_SEED_PIN_NOTES,
      analysisReport: null,
      aiResult: null,
    });

    const firstIncomplete = initial.incompleteItems[0];
    assert.ok(firstIncomplete);

    const updated = evaluateDrawingProcessChecklist({
      evaluatedLoops,
      crossLayerDiffs,
      ruleViolations,
      specReport,
      pinNotes: H042_SEED_PIN_NOTES,
      analysisReport: null,
      aiResult: null,
      manualSignOffs: { [firstIncomplete.id]: true },
    });

    assert.equal(
      updated.summary.incompleteCount,
      initial.summary.incompleteCount - 1
    );
    assert.equal(
      updated.incompleteItems.some((i) => i.id === firstIncomplete.id),
      false
    );

    const sapPayload = buildSapIncompleteReportPayload(updated);
    assert.equal(sapPayload.header.reportId, 'ZREVIEW_OPEN_ITEMS');
    assert.equal(sapPayload.rows.length, updated.summary.incompleteCount);
    assert.equal(
      sapPayload.rows.some((r) => r.itemId === firstIncomplete.code),
      false
    );

    const csv = exportSapIncompleteCsv(sapPayload);
    assert.ok(csv.includes('"MANDT","PSPID","RPT_ID"'));
    assert.ok(csv.includes('"ZREVIEW_OPEN_ITEMS"'));
    assert.ok(!csv.includes(`"${firstIncomplete.code}"`));

    const jsonText = exportSapIncompleteJson(sapPayload);
    const parsed = JSON.parse(jsonText);
    assert.equal(parsed.SAP_REPORT_HEADER.programName, 'ZR_H042_DWG_CHK_01');
    assert.equal(parsed.ET_OPEN_ITEMS.length, updated.summary.incompleteCount);

    const html = buildSapIncompleteHtmlReport(sapPayload);
    assert.ok(html.includes('SAP ALV LIST VIEWER'));
    assert.ok(html.includes('ZREVIEW_OPEN_ITEMS'));
  });

  it('synthesizes dynamic checklist items per scanned/uploaded drawing profile across disciplines', () => {
    const evaluatedLoops = H042_LOOP_SEED_DATA.map(evaluateLoopEntry);
    const specReport = evaluateSpecCompliance({
      evaluatedLoops,
      missingCableRows: [],
      learnedRules: SEED_LEARNED_RULES,
    });

    const mockAnalysisReport: DrawingContentAnalysisReport = {
      totalDurationMs: 120,
      drawingsAnalyzed: 2,
      pagesScanned: 4,
      pages: [],
      entities: [],
      entityCountsByKind: {
        TAG: 10,
        CABLE: 4,
        JUNCTION_BOX: 2,
        LINE_NO: 3,
        EQUIPMENT: 2,
        HOLD_OR_NOTE: 0,
        REVISION: 1,
      },
      crossDrawingPresence: [],
      documentProfiles: [
        {
          drawingId: 'UPLOAD-PID-901',
          displayName: 'Vendor_Skid_PID_Rev2.pdf',
          docClass: 'PID',
          docClassLabelKo: '배관·계장 공정도 (P&ID)',
          pageCount: 2,
          equipmentCount: 4,
          cableCount: 0,
          tagCount: 12,
          jbCount: 0,
          isMakerDrawing: false,
        },
        {
          drawingId: 'UPLOAD-EL-902',
          displayName: 'Cable_Schedule_Rev1.pdf',
          docClass: 'CABLE_SCHEDULE',
          docClassLabelKo: '케이블 스케줄',
          pageCount: 2,
          equipmentCount: 0,
          cableCount: 25,
          tagCount: 18,
          jbCount: 2,
          isMakerDrawing: false,
        },
      ],
      universalMatches: [
        {
          id: 'UM-1',
          coreKey: '300-TT-901',
          displayTag: '300-TT-901',
          entityCategory: 'INSTRUMENT_TAG',
          matchStatus: 'VARIANT_CONFLICT',
          severity: 'WARNING',
          pidOrLayoutDrawings: ['UPLOAD-PID-901'],
          electricalOrCableDrawings: ['UPLOAD-EL-902'],
          makerDrawings: [],
          variantsFound: ['300-TT-901', '300-TIT-901'],
          linkedCableNos: [],
          linkedEquipment: [],
          summaryKo: '태그 변형 충돌',
          primaryJump: {
            drawingId: 'UPLOAD-PID-901',
            pageNum: 1,
            rawText: '300-TT-901',
            xPct: 20,
            yPct: 30,
          },
        },
      ],
    };

    const result = evaluateDrawingProcessChecklist({
      evaluatedLoops,
      crossLayerDiffs: [],
      ruleViolations: [],
      specReport,
      pinNotes: [],
      analysisReport: mockAnalysisReport,
      aiResult: null,
    });

    const pidUploaded = result.items.find((i) => i.id === 'CHK-DOC-UPLOAD-PID-901');
    const elUploaded = result.items.find((i) => i.id === 'CHK-DOC-UPLOAD-EL-902');
    assert.ok(pidUploaded);
    assert.equal(pidUploaded.discipline, 'PID');
    assert.equal(pidUploaded.autoStatus, 'OPEN_ISSUE');

    assert.ok(elUploaded);
    assert.equal(elUploaded.discipline, 'ELECTRICAL');
    assert.equal(elUploaded.autoStatus, 'OPEN_ISSUE');
  });
});
