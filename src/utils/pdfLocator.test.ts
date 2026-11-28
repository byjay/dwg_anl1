import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSearchTermsForLoop,
  extractAiRegionCandidates,
  matchMultipleTextRegions,
  matchTextBoxesForTerms,
  PdfTextBox,
  upsertAutoNote,
} from './pdfLocator.ts';
import { H042_LOOP_SEED_DATA } from '../data/h042Dataset.ts';
import { DrawingPinNote, ParallelAnalyzeResponse } from '../types/diagram.ts';

describe('PDF Vector Text Coordinate Locator & Auto-Note Upsert', () => {
  it('matches exact and split CAD tag boxes on a PDF page', () => {
    const boxes: PdfTextBox[] = [
      { str: 'PIPING & INSTRUMENT DIAGRAM', xPct: 50, yPct: 5, leftPct: 30, topPct: 4, widthPct: 40, heightPct: 2 },
      { str: 'PDIT', xPct: 36.8, yPct: 66.7, leftPct: 35.5, topPct: 65.8, widthPct: 2.6, heightPct: 1.5 },
      { str: '111E', xPct: 36.8, yPct: 67.7, leftPct: 35.5, topPct: 67.0, widthPct: 2.6, heightPct: 1.5 },
      { str: '200-PEIT-111E', xPct: 10.5, yPct: 26.4, leftPct: 6.5, topPct: 25.5, widthPct: 8, heightPct: 1.6 },
    ];

    const exact = matchTextBoxesForTerms(boxes, ['200-PEIT-111E', 'HC0509']);
    assert.ok(exact);
    assert.equal(exact.matchedTerm, '200-PEIT-111E');
    assert.equal(exact.xPct, 10.5);

    const splitMatch = matchTextBoxesForTerms(boxes, ['200-PDIT-111E', 'PDIT-111E']);
    assert.ok(splitMatch);
    assert.equal(splitMatch.exact, true);
    assert.ok(Math.abs(splitMatch.xPct - 36.8) < 0.2);
    assert.ok(splitMatch.yPct >= 66 && splitMatch.yPct <= 68);
  });

  it('builds prioritized search terms for both left (P&ID/GAR) and right (Electrical) panes', () => {
    const pdit = H042_LOOP_SEED_DATA.find((l) => l.canonicalTag === '200-PDIT-111E');
    assert.ok(pdit);

    const leftTerms = buildSearchTermsForLoop(pdit, 'LEFT');
    const rightTerms = buildSearchTermsForLoop(pdit, 'RIGHT');

    assert.ok(leftTerms.includes('PDIT-111E'));
    assert.ok(rightTerms.includes('200-PEIT-111E'));
    assert.ok(rightTerms.includes('HC0509'));
  });

  it('upserts auto-located pin notes without creating duplicates for the same drawing/page/tag', () => {
    const initial: DrawingPinNote[] = [];
    const first = upsertAutoNote(initial, {
      drawingId: 'CI-000-DIA-0001',
      pageNum: 35,
      xPct: 10.5,
      yPct: 26.4,
      tagRef: '200-PDIT-111E',
      severity: 'CRITICAL',
      status: 'OPEN',
      author: 'Auto Locate',
      content: '200-PEIT-111E 오타 수정 필요',
      source: 'AUTO_LOCATE',
    });

    assert.equal(first.wasCreated, true);
    assert.equal(first.notes.length, 1);

    const second = upsertAutoNote(first.notes, {
      drawingId: 'CI-000-DIA-0001',
      pageNum: 35,
      xPct: 10.5,
      yPct: 26.4,
      tagRef: '200-PDIT-111E',
      severity: 'CRITICAL',
      status: 'OPEN',
      author: 'Auto Locate',
      content: '200-PEIT-111E 오타 수정 필요',
      source: 'AUTO_LOCATE',
    });

    assert.equal(second.wasCreated, false);
    assert.equal(second.notes.length, 1);
  });

  it('extracts AI textRegions and matches non-overlapping overlays on PDF text boxes', () => {
    const aiResult: ParallelAnalyzeResponse = {
      model: 'gemini-3.1-flash-lite',
      thinkingLevel: 'HIGH',
      totalDurationMs: 1200,
      tracks: [
        {
          trackId: 'track-2',
          trackName: 'HP Pump Track',
          moduleCode: '200',
          drawingIds: ['CI-000-DIA-0002'],
          status: 'COMPLETED',
          durationMs: 1200,
          findings: [
            {
              tag: '200-SDV-101',
              severity: 'CRITICAL',
              category: 'UNIT_CODE_MISMATCH',
              finding: '100-ZSO/ZSC-101 및 100-NISJB-001 유닛 코드 오기',
              sourceEvidence: 'CI-000-DIA-0002 H-06',
              recommendation: '200-ZSO/ZSC-101로 정정',
              textRegions: ['100-ZSO/ZSC-101', '100-NISJB-001'],
              pageHint: 25,
            },
          ],
        },
      ],
    };

    const candidates = extractAiRegionCandidates({
      drawingId: 'CI-000-DIA-0002',
      pageNum: 25,
      aiResult,
    });

    assert.equal(candidates.length, 1);
    assert.equal(candidates[0].source, 'GEMINI_AI');
    assert.deepEqual(candidates[0].searchTerms, ['100-ZSO/ZSC-101', '100-NISJB-001', '200-SDV-101']);

    const boxes: PdfTextBox[] = [
      { str: '100-ZSO/ZSC-101', xPct: 22.5, yPct: 41.2, leftPct: 18, topPct: 40, widthPct: 9, heightPct: 2.2 },
      { str: '100-NISJB-001', xPct: 68.0, yPct: 44.0, leftPct: 63, topPct: 43, widthPct: 10, heightPct: 2.0 },
      { str: '100-NISJB-001', xPct: 68.1, yPct: 44.1, leftPct: 63, topPct: 43, widthPct: 10, heightPct: 2.0 },
    ];

    const overlays = matchMultipleTextRegions(boxes, candidates);
    assert.equal(overlays.length, 2);
    assert.equal(overlays[0].matchedTerm, '100-ZSO/ZSC-101');
    assert.equal(overlays[1].matchedTerm, '100-NISJB-001');
  });
});
