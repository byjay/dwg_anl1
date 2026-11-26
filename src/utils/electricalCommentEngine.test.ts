import test from 'node:test';
import assert from 'node:assert/strict';
import { H042_LOOP_SEED_DATA } from '../data/h042Dataset.ts';
import { runParallelBatchMatch } from './diagramMatcher.ts';
import { buildCrossLayerDiffs } from './diffEngine.ts';
import {
  DEFAULT_VERIFICATION_RULES,
  evaluateVerificationRules,
} from './verificationRules.ts';
import { buildElectricalCommentPackage } from './electricalCommentEngine.ts';
import { buildTemplateStyleHtmlReport } from './templateReportHtmlExporter.ts';

test('buildElectricalCommentPackage synthesizes Module 300, missing cables, and diagram comments', async () => {
  const { results: evaluatedLoops } = await runParallelBatchMatch(H042_LOOP_SEED_DATA);
  const crossLayerDiffs = buildCrossLayerDiffs(H042_LOOP_SEED_DATA);
  const ruleViolations = evaluateVerificationRules({
    evaluatedLoops,
    extractedEntities: [],
    rules: DEFAULT_VERIFICATION_RULES,
    analysisReport: null,
  });

  const pkg = buildElectricalCommentPackage({
    evaluatedLoops,
    crossLayerDiffs,
    ruleViolations,
    pinNotes: [],
    analysisReport: null,
  });

  assert.ok(pkg.missingCableRows.length >= 12);
  assert.ok(pkg.commentSheets.length >= 20, 'Should include all 20 attached-template + Module 300 slides');

  // Verify core attached PDF slides (p.1..18) and Module 300 slide
  const slide1 = pkg.commentSheets.find((s) => s.sheetNo === 1);
  assert.ok(slide1 && slide1.title.includes('RL0113'), 'Slide 1 should cover RL0113 & PB note typo');
  assert.ok(
    slide1.evidencePanels.every((p) => p.drawingId === 'REQ-REV1-261118' && p.pdfUrl.endsWith('.pdf')),
    'Slide 1 evidence panels should resolve to attached PDF URL'
  );

  const slide2 = pkg.commentSheets.find((s) => s.sheetNo === 2);
  assert.ok(slide2 && slide2.targetDiagram === 'H042-EL-100-GAR-0001');

  const slide3 = pkg.commentSheets.find((s) => s.sheetNo === 3);
  assert.ok(slide3 && slide3.title.includes('200-EDJB-001'));

  const slide10 = pkg.commentSheets.find((s) => s.sheetNo === 10);
  assert.ok(slide10 && slide10.title.includes('R-09') && slide10.queries.some((q) => q.includes('202C')));

  const slide20 = pkg.commentSheets.find((s) => s.sheetNo === 20);
  assert.ok(slide20 && slide20.slideKind === 'CHECKLIST' && slide20.targetDiagram === 'H042-COMMON');

  assert.ok(
    pkg.missingCableRows.some((r) => r.tag.includes('100-SDV-254A')),
    'Should flag Mark B missing cable 100-SDV-254A'
  );
  assert.ok(
    pkg.missingCableRows.some((r) => r.tag.includes('300-LCV-002') || r.tag.includes('300-FCV-001')),
    'Should include Unit 300 HOLD/missing cables'
  );

  const sheet300 = pkg.commentSheets.find((s) => s.targetDiagram === 'H042-PR-300-PID-0001');
  assert.ok(sheet300, 'Should include Recondenser 300-V-001 comment sheet');
  assert.ok(sheet300.evidencePanels.some((p) => p.drawingId === 'PR-300-PID-0001' && p.pageNum === 1));
  assert.ok(sheet300.queries.some((q) => q.includes('LCV-002')));
  assert.ok(sheet300.electricalComments.length >= 1);
});

test('buildTemplateStyleHtmlReport outputs attached-template slide HTML with embedded snapshot images and escaping', async () => {
  const { results: evaluatedLoops } = await runParallelBatchMatch(H042_LOOP_SEED_DATA);
  const crossLayerDiffs = buildCrossLayerDiffs(H042_LOOP_SEED_DATA);
  const pkg = buildElectricalCommentPackage({
    evaluatedLoops,
    crossLayerDiffs,
    ruleViolations: [],
    pinNotes: [
      {
        id: 'USER-NOTE-XSS',
        drawingId: 'CI-000-DIA-0002',
        pageNum: 25,
        xPct: 45,
        yPct: 55,
        tagRef: '200-SDV-101',
        severity: 'WARNING',
        status: 'OPEN',
        author: 'Engineer',
        content: '<script>alert(1)</script> 확인 필요',
        createdAt: '2026-11-24T12:00:00Z',
        source: 'USER',
      },
    ],
  });

  const html = buildTemplateStyleHtmlReport(pkg, {
    'EV-300-PID-MARKUP': 'data:image/png;base64,FAKEIMGDATA',
  });

  assert.ok(html.includes('<!DOCTYPE html>'));
  assert.ok(html.includes('data:image/png;base64,FAKEIMGDATA'));
  assert.ok(html.includes('질의 / 요청'));
  assert.ok(html.includes('query-box checklist'), 'Should render Slide 20 checklist style');
  assert.ok(html.includes('전기 Diagram 코멘트 조치사항'));
  assert.ok(!html.includes('<script>alert(1)</script>'));
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
});
