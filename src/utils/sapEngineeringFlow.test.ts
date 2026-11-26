import test from 'node:test';
import assert from 'node:assert/strict';
import { H042_LOOP_SEED_DATA } from '../data/h042Dataset.ts';
import { runParallelBatchMatch } from './diagramMatcher.ts';
import { buildCrossLayerDiffs } from './diffEngine.ts';
import { buildElectricalCommentPackage } from './electricalCommentEngine.ts';
import {
  SEED_LEARNED_RULES,
  convertLearnedRulesToVerificationRules,
  createLearnedRule,
  createLearnedRuleFromSpecCheck,
  learnRulesFromAnalysis,
} from './learnedKnowledgeEngine.ts';
import { evaluateSpecCompliance } from './specReviewEngine.ts';
import {
  buildPosHtmlDocument,
  buildPurchaseOrderSpec,
} from './posGeneratorEngine.ts';
import { DrawingContentAnalysisReport } from '../types/diagram.ts';

test('evaluateSpecCompliance evaluates H042 specs, dynamic maker profiles, and attaches learned rules', async () => {
  const { results } = await runParallelBatchMatch(H042_LOOP_SEED_DATA);
  const diffs = buildCrossLayerDiffs(H042_LOOP_SEED_DATA);
  const pkg = buildElectricalCommentPackage({
    evaluatedLoops: results,
    crossLayerDiffs: diffs,
    ruleViolations: [],
    pinNotes: [],
  });

  const mockAnalysis: DrawingContentAnalysisReport = {
    totalDurationMs: 120,
    drawingsAnalyzed: 1,
    pagesScanned: 2,
    pages: [],
    entities: [],
    entityCountsByKind: {
      TAG: 4,
      CABLE: 2,
      JUNCTION_BOX: 1,
      LINE_NO: 0,
      EQUIPMENT: 2,
      HOLD_OR_NOTE: 1,
      REVISION: 0,
    },
    crossDrawingPresence: [],
    makerProfiles: [
      {
        drawingId: 'MKR-VENDOR-99',
        displayName: 'CryoPump_Vendor_Pkg.pdf',
        docClass: 'MAKER_DRAWING',
        isMakerDrawing: true,
        vendorOrPackageHint: 'CryoPump Corp',
        powerSpecs: ['6.6kV 3PH'],
        signalStandards: ['4-20mA', 'Dry Contact'],
        yardToMakerMappings: [
          {
            yardTag: '200-P-101A',
            makerTag: 'MP-01A',
            pageNum: 1,
            context: 'Yard 200-P-101A -> MP-01A',
            xPct: 30,
            yPct: 40,
          },
        ],
        interfacePoints: [
          {
            id: 'IF-1',
            drawingId: 'MKR-VENDOR-99',
            pageNum: 1,
            terminalOrPin: 'TB1-12',
            ioType: 'DO',
            signalDetail: 'ESD Trip Command',
            scopeOwner: 'INTERFACE',
            rawContext: 'TB1-12 ESD',
            xPct: 50,
            yPct: 60,
          },
        ],
        scopeNotes: [
          {
            owner: 'HOLD',
            text: 'Motor space heater voltage HOLD',
            pageNum: 1,
            xPct: 20,
            yPct: 80,
          },
        ],
      },
    ],
  };

  const report = evaluateSpecCompliance({
    evaluatedLoops: results,
    missingCableRows: pkg.missingCableRows,
    analysisReport: mockAnalysis,
    learnedRules: SEED_LEARNED_RULES,
  });

  assert.ok(report.checks.length >= 11);
  assert.ok(report.summary.nonCompliant >= 1);
  assert.ok(report.summary.holdRequired >= 1);

  const dynCheck = report.checks.find((c) => c.id === 'SPEC-MKR-DYN-MKR-VENDOR-99');
  assert.ok(dynCheck);
  assert.equal(dynCheck.status, 'HOLD_REQUIRED');

  const el66Check = report.checks.find((c) => c.specCode === 'SPC-EL-6.6KV');
  assert.ok(el66Check);
  assert.ok(el66Check.matchedLearnedRuleIds.includes('LRN-001'));
});

test('learnedKnowledgeEngine creates rules from specs, auto-learns from maker profiles, and bridges to verification rules', async () => {
  const { results } = await runParallelBatchMatch(H042_LOOP_SEED_DATA);
  const diffs = buildCrossLayerDiffs(H042_LOOP_SEED_DATA);
  const pkg = buildElectricalCommentPackage({
    evaluatedLoops: results,
    crossLayerDiffs: diffs,
    ruleViolations: [],
    pinNotes: [],
  });
  const specReport = evaluateSpecCompliance({
    evaluatedLoops: results,
    missingCableRows: pkg.missingCableRows,
    learnedRules: SEED_LEARNED_RULES,
  });

  const fromSpec = createLearnedRuleFromSpecCheck(specReport.checks[0], SEED_LEARNED_RULES.length);
  assert.equal(fromSpec.source, 'USER_LEARNED');
  assert.ok(fromSpec.titleKo.includes('[스펙학습]'));

  const customRule = createLearnedRule({
    category: 'CABLE_SPEC',
    titleKo: '커스텀 케이블 글랜드 규정',
    patternOrCondition: 'GLAND-M25',
    learnedLessonKo: '방폭 지역 M25 SUS316L 글랜드 적용',
    posRequirementClause: 'SUS316L Ex d/e 글랜드 포함 납품',
    severity: 'WARNING',
    tCodeOrigin: 'ZP01 · TEST',
    existingCount: SEED_LEARNED_RULES.length + 1,
  });

  const bridged = convertLearnedRulesToVerificationRules([
    ...SEED_LEARNED_RULES,
    fromSpec,
    customRule,
  ]);
  assert.equal(bridged.length, 2);
  assert.equal(bridged[1].customRegex, 'GLAND-M25');

  const autoLearned = learnRulesFromAnalysis({
    existingRules: SEED_LEARNED_RULES,
    analysisReport: {
      totalDurationMs: 10,
      drawingsAnalyzed: 1,
      pagesScanned: 1,
      pages: [],
      entities: [],
      entityCountsByKind: {
        TAG: 0,
        CABLE: 0,
        JUNCTION_BOX: 0,
        LINE_NO: 0,
        EQUIPMENT: 0,
        HOLD_OR_NOTE: 1,
        REVISION: 0,
      },
      crossDrawingPresence: [],
      makerProfiles: [
        {
          drawingId: 'MKR-AUTO-1',
          displayName: 'VendorPanel.pdf',
          docClass: 'MAKER_DRAWING',
          isMakerDrawing: true,
          vendorOrPackageHint: 'Kongsberg Skid',
          powerSpecs: ['230VAC'],
          signalStandards: ['MODBUS'],
          yardToMakerMappings: [],
          interfacePoints: [],
          scopeNotes: [
            { owner: 'HOLD', text: 'Power feed HOLD', pageNum: 1, xPct: 10, yPct: 10 },
          ],
        },
      ],
    },
    ruleViolations: [],
  });
  assert.ok(autoLearned.length > SEED_LEARNED_RULES.length);
});

test('posGeneratorEngine synthesizes SAP POS documents and escapes untrusted HTML cleanly', async () => {
  const { results } = await runParallelBatchMatch(H042_LOOP_SEED_DATA);
  const diffs = buildCrossLayerDiffs(H042_LOOP_SEED_DATA);
  const pkg = buildElectricalCommentPackage({
    evaluatedLoops: results,
    crossLayerDiffs: diffs,
    ruleViolations: [],
    pinNotes: [],
  });
  const specReport = evaluateSpecCompliance({
    evaluatedLoops: results,
    missingCableRows: pkg.missingCableRows,
    learnedRules: SEED_LEARNED_RULES,
  });

  const posDoc = buildPurchaseOrderSpec({
    packageId: 'POS-300-PKG',
    evaluatedLoops: results,
    specReport,
    learnedRules: SEED_LEARNED_RULES,
    customVendor: 'Maker <script>alert(1)</script> Corp',
  });

  assert.equal(posDoc.packageId, 'POS-300-PKG');
  assert.equal(posDoc.readinessStatus, 'HOLD_PENDING');
  assert.ok(posDoc.lineItems.length >= 5);
  assert.ok(posDoc.sourceStats.makerProfilesCount >= 1);
  assert.equal(posDoc.learnedClauses.length, SEED_LEARNED_RULES.filter((r) => r.enabled).length);
  assert.ok(posDoc.openHoldConditions.length >= 1);

  const html = buildPosHtmlDocument(posDoc);
  assert.ok(html.includes('SAP 구매발주사양서 (POS)'));
  assert.ok(!html.includes('<script>alert(1)</script>'));
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.ok(html.includes('300-FCV-001'));
});
