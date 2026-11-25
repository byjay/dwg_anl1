import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  deriveExpectedElectricalTags,
  detectUnitCodeMismatch,
  evaluateLoopEntry,
  exportLoopsToCsv,
  filterEvaluatedLoops,
  normalizeTag,
  runParallelBatchMatch,
} from './diagramMatcher.ts';
import { H042_LOOP_SEED_DATA } from '../data/h042Dataset.ts';

describe('Ship Diagram Matcher & Parallel Audit Engine', () => {
  it('normalizes P&ID short tags with unit prefixes cleanly', () => {
    assert.equal(normalizeTag('PIT-201A', '100'), '100-PIT-201A');
    assert.equal(normalizeTag('200-SDY-111A', '200'), '200-SDY-111A');
    assert.equal(normalizeTag('TI 131B (Typo)', '200'), '200-TI-131B');
  });

  it('derives expected solenoid and limit switch tags from P&ID shutdown/control valves', () => {
    assert.deepEqual(deriveExpectedElectricalTags('SDV-111A', '200'), [
      '200-SDY-111A',
      '200-ZSO-111A',
      '200-ZSC-111A',
    ]);
    assert.deepEqual(deriveExpectedElectricalTags('TCV-252A', '100'), [
      '100-TCV-252A',
      '100-TVI-252A',
    ]);
    assert.deepEqual(deriveExpectedElectricalTags('UV-250A', '100'), [
      '100-UY-250A',
      '100-UZSO-250A',
      '100-UZSC-250A',
    ]);
  });

  it('detects unit code mismatch such as 200-SDY-101 paired with 100-ZSO/ZSC-101', () => {
    assert.equal(detectUnitCodeMismatch('200', '200-SDY-101 / 100-ZSO/ZSC-101'), true);
    assert.equal(detectUnitCodeMismatch('200', '200-SDY-111A / 200-ZSO/ZSC-111A'), false);
  });

  it('evaluates H042 real discrepancy loops with accurate status classification', () => {
    const sdv101 = H042_LOOP_SEED_DATA.find((l) => l.canonicalTag === '200-SDV-101');
    const sdv254a = H042_LOOP_SEED_DATA.find((l) => l.canonicalTag === '100-SDV-254A');
    const tit252a = H042_LOOP_SEED_DATA.find((l) => l.canonicalTag === '100-TIT-252A');
    const pit201a = H042_LOOP_SEED_DATA.find((l) => l.canonicalTag === '100-PIT-201A');

    assert.ok(sdv101 && sdv254a && tit252a && pit201a);

    assert.equal(evaluateLoopEntry(sdv101).status, 'CONFLICT');
    assert.equal(evaluateLoopEntry(sdv254a).status, 'CABLE_MISSING');
    assert.equal(evaluateLoopEntry(tit252a).status, 'REVISION_DRIFT');
    assert.equal(evaluateLoopEntry(pit201a).status, 'MATCHED');
  });

  it('runs parallel batch matching across unit partitions and computes module KPIs', async () => {
    const { results, summary } = await runParallelBatchMatch(H042_LOOP_SEED_DATA);

    assert.equal(results.length, H042_LOOP_SEED_DATA.length);
    assert.ok(summary.workerPartitionCount >= 3, 'Should parallelize across 100, 200, 400 partitions');
    assert.ok(summary.criticalIssuesCount >= 5, 'Should surface real critical drawing conflicts');
    assert.ok(summary.cableMissingCount >= 2, 'Should flag SEASTAR Mark B missing cables');
    assert.equal(
      summary.matchedCount +
        summary.cableMissingCount +
        summary.unassignedCircuitCount +
        summary.pidOnlyCount +
        summary.conflictCount +
        summary.revisionDriftCount,
      summary.totalLoops
    );
  });

  it('filters evaluated loops by unit, status, system, and search text and exports valid CSV', async () => {
    const { results } = await runParallelBatchMatch(H042_LOOP_SEED_DATA);
    const peitMatches = filterEvaluatedLoops(results, {
      unitCode: '200',
      status: 'CONFLICT',
      system: 'ICAMS',
      query: 'PEIT',
    });
    assert.equal(peitMatches.length, 1);
    assert.equal(peitMatches[0].canonicalTag, '200-PDIT-111E');

    const csv = exportLoopsToCsv(peitMatches);
    assert.match(csv, /^"Unit","Canonical Tag"/);
    assert.match(csv, /200-PDIT-111E/);
  });
});
