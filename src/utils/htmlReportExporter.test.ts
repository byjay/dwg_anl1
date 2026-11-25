import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { H042_LOOP_SEED_DATA } from '../data/h042Dataset.ts';
import { H042_SEED_PIN_NOTES } from '../data/h042NotesSeed.ts';
import { runParallelBatchMatch } from './diagramMatcher.ts';
import { buildCrossLayerDiffs } from './diffEngine.ts';
import { buildDiscrepancySeveritySummary } from './severitySummary.ts';
import { evaluateVerificationRules, DEFAULT_VERIFICATION_RULES } from './verificationRules.ts';
import {
  buildHtmlReportDocument,
  buildPerSectionHtmlReports,
  escapeHtml,
} from './htmlReportExporter.ts';

describe('Sectioned HTML Report Exporter', () => {
  it('renders only selected sections in combined HTML and escapes untrusted characters', async () => {
    const { results, summary } = await runParallelBatchMatch(H042_LOOP_SEED_DATA);
    const sevSummary = buildDiscrepancySeveritySummary(results);
    const diffs = buildCrossLayerDiffs(H042_LOOP_SEED_DATA);
    const violations = evaluateVerificationRules({
      evaluatedLoops: results,
      extractedEntities: [],
      rules: DEFAULT_VERIFICATION_RULES,
    });

    const html = buildHtmlReportDocument({
      projectCode: 'H042',
      generatedAt: '2026-11-24 09:00:00',
      selectedSections: ['SUMMARY_KPI', 'DISCREPANCY_SEVERITY'],
      summary,
      loops: results,
      severitySummary: sevSummary,
      diffs,
      ruleViolations: violations,
      pinNotes: H042_SEED_PIN_NOTES,
      analysisReport: null,
    });

    assert.ok(html.includes('<!DOCTYPE html>'));
    assert.ok(html.includes('data-section="SUMMARY_KPI"'));
    assert.ok(html.includes('data-section="DISCREPANCY_SEVERITY"'));
    assert.equal(html.includes('data-section="LOOP_MATRIX"'), false);
    assert.equal(html.includes('data-section="RULE_VIOLATIONS"'), false);
    assert.equal(escapeHtml('<script>alert("xss")</script>'), '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
  });

  it('produces standalone per-section HTML files for each checked section', async () => {
    const { results, summary } = await runParallelBatchMatch(H042_LOOP_SEED_DATA);
    const sevSummary = buildDiscrepancySeveritySummary(results);
    const diffs = buildCrossLayerDiffs(H042_LOOP_SEED_DATA);
    const violations = evaluateVerificationRules({
      evaluatedLoops: results,
      extractedEntities: [],
      rules: DEFAULT_VERIFICATION_RULES,
    });

    const exports = buildPerSectionHtmlReports({
      projectCode: 'H042',
      generatedAt: '2026-11-24 09:00:00',
      selectedSections: ['LOOP_MATRIX', 'CROSS_LAYER_DIFF', 'RULE_VIOLATIONS'],
      summary,
      loops: results,
      severitySummary: sevSummary,
      diffs,
      ruleViolations: violations,
      pinNotes: H042_SEED_PIN_NOTES,
      analysisReport: null,
    });

    assert.equal(exports.length, 3);
    assert.equal(exports[0].filename, 'H042_03_loop_cross_match_2026-11-24.html');
    assert.ok(exports[0].html.includes('data-section="LOOP_MATRIX"'));
    assert.equal(exports[0].html.includes('data-section="CROSS_LAYER_DIFF"'), false);
    assert.equal(exports[0].itemCount, results.length);
  });
});
