import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { H042_LOOP_SEED_DATA } from '../data/h042Dataset.ts';
import { runParallelBatchMatch } from './diagramMatcher.ts';
import { buildDiscrepancySeveritySummary } from './severitySummary.ts';

describe('Discrepancy Severity Summary Builder', () => {
  it('aggregates Critical, Warning, and Info discrepancy counts and share percentages accurately', async () => {
    const { results, summary } = await runParallelBatchMatch(H042_LOOP_SEED_DATA);
    const sevSummary = buildDiscrepancySeveritySummary(results);

    assert.equal(sevSummary.bySeverity.CRITICAL.count, summary.criticalIssuesCount);
    assert.equal(sevSummary.bySeverity.WARNING.count, summary.warningIssuesCount);
    assert.ok(sevSummary.bySeverity.INFO.count >= 1);
    assert.equal(
      sevSummary.totalDiscrepancies,
      sevSummary.bySeverity.CRITICAL.count +
        sevSummary.bySeverity.WARNING.count +
        sevSummary.bySeverity.INFO.count
    );

    const firstCritical = sevSummary.bySeverity.CRITICAL.items[0];
    assert.ok(firstCritical);
    assert.ok(firstCritical.loopId.startsWith('LOOP-'));
    assert.ok(firstCritical.canonicalTag.length > 0);
    assert.ok(firstCritical.primaryCableNo.length > 0);
    assert.ok(firstCritical.primaryJunctionBox.length > 0);
  });

  it('handles empty loops safely with zero counts', () => {
    const sevSummary = buildDiscrepancySeveritySummary([]);
    assert.equal(sevSummary.totalDiscrepancies, 0);
    assert.equal(sevSummary.affectedLoopsCount, 0);
    assert.equal(sevSummary.bySeverity.CRITICAL.sharePercent, 0);
    assert.equal(sevSummary.bySeverity.WARNING.sharePercent, 0);
    assert.equal(sevSummary.bySeverity.INFO.sharePercent, 0);
  });
});
