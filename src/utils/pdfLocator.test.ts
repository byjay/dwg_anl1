import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSearchTermsForLoop,
  matchTextBoxesForTerms,
  PdfTextBox,
  upsertAutoNote,
} from './pdfLocator.ts';
import { H042_LOOP_SEED_DATA } from '../data/h042Dataset.ts';
import { DrawingPinNote } from '../types/diagram.ts';

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
});
