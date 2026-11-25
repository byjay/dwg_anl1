import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCrossDrawingPresence,
  compareDocumentEntities,
  extractEntitiesFromBoxes,
} from './drawingContentAnalyzer.ts';
import { parseTesseractWordsToBoxes } from './ocrAnalyzer.ts';
import { PdfTextBox } from './pdfLocator.ts';

describe('Deep Drawing Content Analyzer & OCR Coordinate Mapper', () => {
  it('extracts inline CAD tags, spatially split P&ID bubbles, line numbers, JBs, cables, equipment, and HOLDs', () => {
    const boxes: PdfTextBox[] = [
      { str: '100-PIT-201A', xPct: 22, yPct: 18, leftPct: 20, topPct: 17, widthPct: 5, heightPct: 2 },
      { str: 'PDIT', xPct: 45, yPct: 40, leftPct: 44, topPct: 39, widthPct: 2, heightPct: 1.5 },
      { str: '111E', xPct: 45.2, yPct: 42.1, leftPct: 44, topPct: 41.5, widthPct: 2, heightPct: 1.5 },
      { str: 'TI', xPct: 68, yPct: 55, leftPct: 67.5, topPct: 54.5, widthPct: 1.5, heightPct: 1.4 },
      { str: '131B', xPct: 68.1, yPct: 56.8, leftPct: 67.5, topPct: 56.2, widthPct: 2, heightPct: 1.4 },
      { str: '6"-200-LN-111-ZEA-C80', xPct: 30, yPct: 30, leftPct: 25, topPct: 29, widthPct: 10, heightPct: 1.5 },
      { str: 'JUNCTION BOX (100-NISJB-001)', xPct: 75, yPct: 70, leftPct: 70, topPct: 69, widthPct: 12, heightPct: 2 },
      { str: 'RC03208', xPct: 52, yPct: 60, leftPct: 50, topPct: 59, widthPct: 4, heightPct: 1.5 },
      { str: '110-P-101E', xPct: 15, yPct: 80, leftPct: 12, topPct: 79, widthPct: 6, heightPct: 2 },
      { str: 'HOLD-100-GW-XXX-B1X-N', xPct: 85, yPct: 25, leftPct: 80, topPct: 24, widthPct: 10, heightPct: 2 },
      { str: 'Rev. C', xPct: 90, yPct: 92, leftPct: 88, topPct: 91, widthPct: 4, heightPct: 1.5 },
    ];

    const entities = extractEntitiesFromBoxes(boxes, 'PR-200-PID-0001', 18, 'VECTOR');
    const norms = new Set(entities.map((e) => `${e.kind}:${e.normalized}`));

    assert.ok(norms.has('TAG:100-PIT-201A'));
    assert.ok(norms.has('TAG:PDIT-111E'), 'Should pair split PDIT + 111E bubble');
    assert.ok(norms.has('TAG:TI-131B'), 'Should pair split TI + 131B bubble');
    assert.ok(norms.has('LINE_NO:6"-200-LN-111-ZEA-C80'));
    assert.ok(norms.has('JUNCTION_BOX:100-NISJB-001'));
    assert.ok(norms.has('CABLE:RC03208'));
    assert.ok(norms.has('EQUIPMENT:110-P-101E'));
    assert.ok(
      entities.some((e) => e.kind === 'HOLD_OR_NOTE' && e.normalized.includes('HOLD')),
      'Should capture HOLD marker'
    );
    assert.ok(norms.has('REVISION:REV.C'));

    const presence = buildCrossDrawingPresence(entities);
    assert.ok(presence.some((p) => p.normalized === '110-P-101E' && p.hasAttentionFlag));
    assert.ok(presence.some((p) => p.normalized === 'RC03208' && p.hasAttentionFlag));
  });

  it('compares two drawing entity lists and classifies ADDED, REMOVED, MODIFIED, and UNCHANGED', () => {
    const left = extractEntitiesFromBoxes(
      [
        { str: '200-PDIT-111E', xPct: 20, yPct: 20, leftPct: 18, topPct: 19, widthPct: 6, heightPct: 2 },
        { str: '200-P-101D', xPct: 30, yPct: 40, leftPct: 28, topPct: 39, widthPct: 6, heightPct: 2 },
        { str: '6"-200-LN-111-ZEA-C80', xPct: 40, yPct: 50, leftPct: 35, topPct: 49, widthPct: 10, heightPct: 2 },
        { str: '200-SDV-112E', xPct: 50, yPct: 60, leftPct: 48, topPct: 59, widthPct: 6, heightPct: 2 },
      ],
      'PR-200-PID-0001',
      18,
      'VECTOR'
    );

    const right = extractEntitiesFromBoxes(
      [
        { str: '200-PDIT-111E', xPct: 25, yPct: 25, leftPct: 23, topPct: 24, widthPct: 6, heightPct: 2 },
        { str: '110-P-101D', xPct: 32, yPct: 42, leftPct: 30, topPct: 41, widthPct: 6, heightPct: 2 },
        { str: 'HOLD 2', xPct: 70, yPct: 80, leftPct: 68, topPct: 79, widthPct: 4, heightPct: 2 },
      ],
      'PD-200-GAR-0001',
      6,
      'OCR'
    );

    const diff = compareDocumentEntities(
      'PR-200-PID-0001',
      'P&ID 200',
      left,
      'PD-200-GAR-0001',
      'GAR 200',
      right
    );

    assert.equal(diff.summary.unchanged, 1);
    assert.equal(diff.summary.modified, 1); // 200-P-101D vs 110-P-101D
    assert.equal(diff.summary.removed, 2); // 6"-200-LN-111-ZEA-C80, 200-SDV-112E
    assert.equal(diff.summary.added, 1); // HOLD 2

    const modItem = diff.items.find((i) => i.changeType === 'MODIFIED');
    assert.ok(modItem);
    assert.equal(modItem.kind, 'EQUIPMENT');
    assert.match(modItem.normalizedKey, /200-P-101D.*110-P-101D/);
  });

  it('converts cropped Tesseract OCR word boxes into full-page percentage coordinates', () => {
    const { boxes, wordBoxes } = parseTesseractWordsToBoxes(
      [
        {
          text: '100-SDV-254A',
          confidence: 91.6,
          bbox: { x0: 100, y0: 100, x1: 300, y1: 150 },
        },
      ],
      1000,
      500,
      { left: 50, top: 50, width: 50, height: 50 }
    );

    assert.equal(boxes.length, 1);
    assert.equal(boxes[0].str, '100-SDV-254A');
    // x center in crop = 200 / 1000 = 20% -> page x = 50 + 0.2 * 50 = 60%
    assert.equal(boxes[0].xPct, 60);
    // y center in crop = 125 / 500 = 25% -> page y = 50 + 0.25 * 50 = 62.5%
    assert.equal(boxes[0].yPct, 62.5);
    assert.equal(wordBoxes[0].confidence, 92);
  });
});
