import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCrossLayerDiffs,
  exportNotesToCsv,
  normalizeNoteCoordinates,
  resolveLoopPdfTargets,
  runParallelCustomDiff,
} from './diffEngine.ts';
import { H042_LOOP_SEED_DATA } from '../data/h042Dataset.ts';

describe('Cross-Diagram Diff Check & Drawing Note Utilities', () => {
  it('builds structured field-level diffs across P&ID, GAR, Block Diagrams, and Connection Tables', () => {
    const diffs = buildCrossLayerDiffs(H042_LOOP_SEED_DATA);
    assert.ok(diffs.length >= 10, 'Should detect multiple cross-layer diffs in H042 dataset');

    const sdv101Diff = diffs.find((d) => d.canonicalTag === '200-SDV-101' && d.scope === 'BLOCK_VS_CONNECTION');
    assert.ok(sdv101Diff, 'Should surface 200-SDV-101 unit mismatch diff');
    assert.equal(sdv101Diff.severity, 'CRITICAL');
    assert.ok(sdv101Diff.deltas.length >= 2);
    assert.ok(sdv101Diff.leftJump && sdv101Diff.rightJump);

    const revDiff = diffs.find((d) => d.canonicalTag === '100-TIT-252A');
    assert.ok(revDiff);
    assert.equal(revDiff.scope, 'REVISION_VS_ACTIVE');

    const replacementRevDiff = diffs.find(
      (d) => d.canonicalTag === '100-PIT-201BR_A' && d.scope === 'REVISION_VS_ACTIVE'
    );
    assert.equal(replacementRevDiff, undefined, 'Replacement tag should not be flagged as deleted');
  });

  it('resolves exact left/right PDF drawing and page targets for discrepancy loops', () => {
    const sdv101 = H042_LOOP_SEED_DATA.find((l) => l.canonicalTag === '200-SDV-101');
    const sdv254a = H042_LOOP_SEED_DATA.find((l) => l.canonicalTag === '100-SDV-254A');
    assert.ok(sdv101 && sdv254a);

    const targets101 = resolveLoopPdfTargets(sdv101);
    assert.equal(targets101.left.drawingId, 'PD-200-GAR-0001');
    assert.equal(targets101.right.drawingId, 'CI-000-DIA-0002');
    assert.equal(targets101.right.pageNum, 25); // H-06

    const targets254 = resolveLoopPdfTargets(sdv254a);
    assert.equal(targets254.left.drawingId, 'PD-100-GAR-0001');
    assert.equal(targets254.left.pageNum, 5); // 03/07

    const pdit111e = H042_LOOP_SEED_DATA.find((l) => l.canonicalTag === '200-PDIT-111E');
    assert.ok(pdit111e);
    const targetsPdit = resolveLoopPdfTargets(pdit111e);
    assert.equal(targetsPdit.left.drawingId, 'PR-200-PID-0001');
    assert.equal(targetsPdit.left.pageNum, 18); // 15/15
    assert.equal(targetsPdit.right.drawingId, 'CI-000-DIA-0001');
    assert.equal(targetsPdit.right.pageNum, 35); // Sheet 12/22
  });

  it('runs parallel custom pairwise diff between piping and electrical lists', async () => {
    const piping = [
      '200-PDIT-111E, HC0509, 200-ISJB-005',
      '100-SDV-254A, NO.TBD, 100-NISJB-001',
      '100-PIT-201A, RS0101, 100-ISJB-001',
    ].join('\n');

    const electrical = [
      '200-PEIT-111E, HC0509, 200-ISJB-005',
      '100-SDV-254A, MISSING, 100-NISJB-001',
      '100-PIT-201A, RS0101, 100-ISJB-001',
    ].join('\n');

    const results = await runParallelCustomDiff(piping, electrical);
    assert.equal(results.find((r) => r.tag === '100-PIT-201A')?.status, 'MATCHED');
    assert.equal(results.find((r) => r.tag === '100-SDV-254A')?.status, 'VALUE_DIFF');
    assert.equal(results.find((r) => r.tag === '200-PDIT-111E')?.status, 'MISSING_IN_ELECTRICAL');
    assert.equal(results.find((r) => r.tag === '200-PEIT-111E')?.status, 'MISSING_IN_PIPING');
  });

  it('clamps and normalizes canvas click coordinates into zoom-safe percentages', () => {
    assert.deepEqual(normalizeNoteCoordinates(300, 200, 600, 400), { xPct: 50, yPct: 50 });
    assert.deepEqual(normalizeNoteCoordinates(-10, 500, 600, 400), { xPct: 2, yPct: 98 });
  });

  it('exports drawing pin notes into valid CSV', () => {
    const csv = exportNotesToCsv([
      {
        id: 'NOTE-1',
        drawingId: 'CI-000-DIA-0002',
        pageNum: 25,
        xPct: 72.5,
        yPct: 44.2,
        tagRef: '200-SDY-101',
        severity: 'CRITICAL',
        status: 'OPEN',
        author: 'Engineer',
        content: '100-ZSO-101 유닛코드 오기 수정 필요',
        createdAt: '2026-11-23T06:00:00Z',
      },
    ]);
    assert.match(csv, /^"Note ID","Drawing"/);
    assert.match(csv, /200-SDY-101/);
  });
});
