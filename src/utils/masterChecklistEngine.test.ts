import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildMasterChecklistHtmlReport,
  evaluateMasterChecklist,
  exportChecklistCsv,
  MASTER_DOMAINS,
} from './masterChecklistEngine.ts';
import { H042_LOOP_SEED_DATA } from '../data/h042Dataset.ts';
import { evaluateLoopEntry } from './diagramMatcher.ts';
import { SEED_LEARNED_RULES } from './learnedKnowledgeEngine.ts';
import { evaluateSpecCompliance } from './specReviewEngine.ts';

describe('Master 1~99 Directives Checklist Engine', () => {
  it('defines exactly 99 unique items numbered 1..99 spanning all 9 engineering domains', () => {
    const evaluatedLoops = H042_LOOP_SEED_DATA.map(evaluateLoopEntry);
    const specReport = evaluateSpecCompliance({
      evaluatedLoops,
      missingCableRows: [],
      learnedRules: SEED_LEARNED_RULES,
    });

    const { items, summary } = evaluateMasterChecklist({
      evaluatedLoops,
      learnedRules: SEED_LEARNED_RULES,
      ruleViolations: [],
      pinNotes: [],
      specReport,
      analysisReport: null,
      aiResult: null,
    });

    assert.equal(MASTER_DOMAINS.length, 9);
    assert.equal(items.length, 99);
    assert.equal(summary.total, 99);

    const ids = items.map((i) => i.id);
    assert.equal(new Set(ids).size, 99);
    assert.equal(ids[0], 1);
    assert.equal(ids[98], 99);

    for (const d of MASTER_DOMAINS) {
      const domainItems = items.filter((i) => i.domainId === d.id);
      assert.equal(domainItems.length, 11, `Domain ${d.id} should contain 11 items`);
    }

    assert.equal(
      summary.implementedCount + summary.partialCount + summary.plannedCount,
      99
    );
    assert.ok(summary.implementedCount >= 55);
  });

  it('exports valid CSV and standalone HTML reports for all 99 directives', () => {
    const evaluatedLoops = H042_LOOP_SEED_DATA.map(evaluateLoopEntry);
    const specReport = evaluateSpecCompliance({
      evaluatedLoops,
      missingCableRows: [],
      learnedRules: SEED_LEARNED_RULES,
      });

    const { items, summary } = evaluateMasterChecklist({
      evaluatedLoops,
      learnedRules: SEED_LEARNED_RULES,
      ruleViolations: [],
      pinNotes: [],
      specReport,
      analysisReport: null,
      aiResult: null,
    });

    const csv = exportChecklistCsv(items, { 1: true, 13: true });
    assert.ok(csv.includes('"ENG-01"'));
    assert.ok(csv.includes('"ENG-99"'));
    assert.ok(csv.includes('"VERIFIED"'));

    const html = buildMasterChecklistHtmlReport({
      items,
      summary,
      verifiedIds: { 13: true },
    });
    assert.ok(html.includes('ENG-01'));
    assert.ok(html.includes('ENG-99'));
    assert.ok(html.includes('적용 완료'));
  });
});
