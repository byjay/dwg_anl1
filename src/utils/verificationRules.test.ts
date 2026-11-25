import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { H042_LOOP_SEED_DATA } from '../data/h042Dataset.ts';
import { runParallelBatchMatch } from './diagramMatcher.ts';
import { extractEntitiesFromBoxes } from './drawingContentAnalyzer.ts';
import {
  DEFAULT_VERIFICATION_RULES,
  evaluateVerificationRules,
} from './verificationRules.ts';

describe('Engineering Verification Rule Engine', () => {
  it('evaluates H042 loops and extracted PDF/OCR entities against active rules and custom regex rules', async () => {
    const { results: evaluatedLoops } = await runParallelBatchMatch(H042_LOOP_SEED_DATA);
    const extractedEntities = extractEntitiesFromBoxes(
      [
        { str: '110-P-101E', xPct: 40, yPct: 45, leftPct: 38, topPct: 44, widthPct: 5, heightPct: 2 },
        { str: '200-PEIT-111E', xPct: 55, yPct: 30, leftPct: 52, topPct: 29, widthPct: 6, heightPct: 2 },
        { str: 'HOLD 1', xPct: 80, yPct: 20, leftPct: 78, topPct: 19, widthPct: 4, heightPct: 2 },
        { str: 'RC****', xPct: 25, yPct: 65, leftPct: 23, topPct: 64, widthPct: 4, heightPct: 2 },
      ],
      'PD-200-GAR-0001',
      6,
      'OCR'
    );

    const hits = evaluateVerificationRules({
      evaluatedLoops,
      extractedEntities,
      rules: DEFAULT_VERIFICATION_RULES,
    });

    assert.ok(hits.some((h) => h.ruleCode === 'RULE-01' && h.source === 'OCR' && h.tagOrTarget === '110-P-101E'));
    assert.ok(hits.some((h) => h.ruleCode === 'RULE-02' && h.source === 'OCR' && h.tagOrTarget === '200-PEIT-111E'));
    assert.ok(hits.some((h) => h.ruleCode === 'RULE-04' && h.source === 'OCR' && h.tagOrTarget === 'RC****'));
    assert.ok(hits.some((h) => h.ruleCode === 'RULE-07' && h.source === 'OCR' && h.tagOrTarget === 'HOLD 1'));

    // Disabling RULE-07 suppresses HOLD hits
    const rulesWithoutHold = DEFAULT_VERIFICATION_RULES.map((r) =>
      r.id === 'RULE-07' ? { ...r, enabled: false } : r
    );
    const hitsWithoutHold = evaluateVerificationRules({
      evaluatedLoops,
      extractedEntities,
      rules: rulesWithoutHold,
    });
    assert.equal(
      hitsWithoutHold.some((h) => h.ruleCode === 'RULE-07'),
      false,
      'Disabled rule must produce zero hits'
    );

    // Custom regex rule
    const withCustom = [
      ...DEFAULT_VERIFICATION_RULES,
      {
        id: 'CUSTOM-PEIT',
        code: 'RULE-C01',
        nameKo: 'PEIT 오기 검출 커스텀 룰',
        category: 'CUSTOM',
        descriptionKo: '정규식 PEIT 패턴 탐지',
        checkScope: 'PDF_CONTENT_SCAN' as const,
        defaultSeverity: 'CRITICAL' as const,
        enabled: true,
        isCustom: true,
        customRegex: 'PEIT-111[A-E]',
      },
    ];
    const customHits = evaluateVerificationRules({
      evaluatedLoops,
      extractedEntities,
      rules: withCustom,
    });
    assert.ok(
      customHits.some((h) => h.ruleCode === 'RULE-C01' && h.tagOrTarget === '200-PEIT-111E')
    );
  });

  it('evaluates RULE-08 universal diagram matches and RULE-09 cable completeness from analysisReport', () => {
    const hits = evaluateVerificationRules({
      evaluatedLoops: [],
      extractedEntities: [],
      rules: DEFAULT_VERIFICATION_RULES,
      analysisReport: {
        totalDurationMs: 12,
        drawingsAnalyzed: 2,
        pagesScanned: 2,
        pages: [],
        entities: [],
        entityCountsByKind: {
          TAG: 0,
          CABLE: 1,
          JUNCTION_BOX: 0,
          LINE_NO: 0,
          EQUIPMENT: 1,
          HOLD_OR_NOTE: 0,
          REVISION: 0,
        },
        crossDrawingPresence: [],
        cableRecords: [
          {
            id: 'CBL-1',
            drawingId: 'CUSTOM-PID',
            pageNum: 1,
            cableNo: 'CBL-501',
            normalizedCableNo: 'CBL-501',
            cableSpec: '-',
            signalCategory: 'CONTROL',
            fromEndpoint: '-',
            toEndpoint: '-',
            xPct: 20,
            yPct: 30,
            source: 'VECTOR',
          },
        ],
        universalMatches: [
          {
            id: 'UM-EQUIPMENT-P-301A',
            coreKey: 'P-301A',
            displayTag: '500-P-301A',
            entityCategory: 'EQUIPMENT',
            matchStatus: 'VARIANT_CONFLICT',
            severity: 'CRITICAL',
            pidOrLayoutDrawings: ['CUSTOM-PID'],
            electricalOrCableDrawings: [],
            makerDrawings: ['CUSTOM-MAKER'],
            variantsFound: ['500-P-301A', '400-P-301A'],
            linkedCableNos: ['CBL-501'],
            linkedEquipment: ['500-P-301A'],
            summaryKo: '도면 간 표기 충돌: 500-P-301A ↔ 400-P-301A',
            primaryJump: {
              drawingId: 'CUSTOM-PID',
              pageNum: 1,
              rawText: '500-P-301A',
              xPct: 20,
              yPct: 20,
            },
          },
        ],
      },
    });

    assert.ok(
      hits.some((h) => h.ruleCode === 'RULE-08' && h.severity === 'CRITICAL' && h.tagOrTarget === '500-P-301A')
    );
    assert.ok(
      hits.some((h) => h.ruleCode === 'RULE-09' && h.tagOrTarget === 'CBL-501')
    );
  });
});
