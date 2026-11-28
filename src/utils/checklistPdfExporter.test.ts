import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildChecklistPdfReportData,
  splitTextIntoLines,
} from './checklistPdfExporter.ts';
import { H042_LOOP_SEED_DATA } from '../data/h042Dataset.ts';
import { H042_SEED_PIN_NOTES } from '../data/h042NotesSeed.ts';
import { evaluateLoopEntry } from './diagramMatcher.ts';
import { SEED_LEARNED_RULES } from './learnedKnowledgeEngine.ts';
import { evaluateSpecCompliance } from './specReviewEngine.ts';
import { evaluateMasterChecklist } from './masterChecklistEngine.ts';
import {
  DEFAULT_VERIFICATION_RULES,
  evaluateVerificationRules,
} from './verificationRules.ts';

describe('Checklist Print-Ready PDF Exporter', () => {
  it('aggregates checklist status, identified issues across all 4 sources, and learned rules', () => {
    const evaluatedLoops = H042_LOOP_SEED_DATA.map(evaluateLoopEntry);
    const specReport = evaluateSpecCompliance({
      evaluatedLoops,
      missingCableRows: [],
      learnedRules: SEED_LEARNED_RULES,
    });
    const ruleViolations = evaluateVerificationRules({
      evaluatedLoops,
      extractedEntities: [],
      rules: DEFAULT_VERIFICATION_RULES,
      analysisReport: null,
    });
    const { items, summary } = evaluateMasterChecklist({
      evaluatedLoops,
      learnedRules: SEED_LEARNED_RULES,
      ruleViolations,
      pinNotes: H042_SEED_PIN_NOTES,
      specReport,
      analysisReport: null,
      aiResult: null,
    });

    const data = buildChecklistPdfReportData({
      allItems: items,
      filteredItems: items.slice(0, 11),
      summary,
      verifiedIds: { 1: true, 13: true, 89: true },
      evaluatedLoops,
      ruleViolations,
      specReport,
      pinNotes: H042_SEED_PIN_NOTES,
      learnedRules: SEED_LEARNED_RULES,
      options: {
        checklistScope: 'ALL',
        includeChecklist: true,
        includeIssues: true,
        includeLearnedRules: true,
        includeResolvedNotes: false,
      },
    });

    assert.equal(data.checklistRows.length, 99);
    assert.equal(data.checklistStats.verifiedCount, 3);
    assert.ok(data.issueStats.total > 0);
    assert.ok(data.issueStats.bySource.loopDiff > 0);
    assert.ok(data.issueStats.bySource.ruleHit > 0);
    assert.ok(data.issueStats.bySource.specCheck > 0);
    assert.ok(data.issueStats.bySource.pinNote > 0);

    // Verify CRITICAL issues are ordered first
    const firstNonCriticalIdx = data.issues.findIndex((i) => i.severity !== 'CRITICAL');
    if (firstNonCriticalIdx !== -1) {
      for (let i = 0; i < firstNonCriticalIdx; i++) {
        assert.equal(data.issues[i].severity, 'CRITICAL');
      }
      for (let i = firstNonCriticalIdx; i < data.issues.length; i++) {
        assert.notEqual(data.issues[i].severity, 'CRITICAL');
      }
    }

    assert.equal(data.learnedRuleRows.length, SEED_LEARNED_RULES.length);
    assert.ok(data.learnedStats.enabledCount > 0);
    assert.ok(data.learnedStats.totalApplications > 0);
  });

  it('respects FILTERED checklist scope and includeResolvedNotes toggle', () => {
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
      pinNotes: H042_SEED_PIN_NOTES,
      specReport,
      analysisReport: null,
      aiResult: null,
    });

    const notesWithResolved = [
      ...H042_SEED_PIN_NOTES,
      {
        id: 'RESOLVED-TEST-1',
        drawingId: 'CI-000-DIA-0002',
        pageNum: 12,
        xPct: 50,
        yPct: 50,
        tagRef: '200-TEST-999',
        severity: 'INFO' as const,
        status: 'RESOLVED' as const,
        author: 'Engineer',
        content: 'Resolved test note',
        createdAt: '2026-11-28T00:00:00Z',
      },
    ];

    const withoutResolved = buildChecklistPdfReportData({
      allItems: items,
      filteredItems: items.slice(0, 15),
      summary,
      verifiedIds: { 1: true },
      evaluatedLoops,
      ruleViolations: [],
      specReport,
      pinNotes: notesWithResolved,
      learnedRules: SEED_LEARNED_RULES,
      options: {
        checklistScope: 'FILTERED',
        includeChecklist: true,
        includeIssues: true,
        includeLearnedRules: false,
        includeResolvedNotes: false,
      },
    });

    assert.equal(withoutResolved.checklistRows.length, 15);
    assert.equal(
      withoutResolved.issues.some((i) => i.tagOrTarget === '200-TEST-999'),
      false
    );

    const withResolved = buildChecklistPdfReportData({
      allItems: items,
      filteredItems: items.slice(0, 15),
      summary,
      verifiedIds: { 1: true },
      evaluatedLoops,
      ruleViolations: [],
      specReport,
      pinNotes: notesWithResolved,
      learnedRules: SEED_LEARNED_RULES,
      options: {
        checklistScope: 'FILTERED',
        includeChecklist: true,
        includeIssues: true,
        includeLearnedRules: false,
        includeResolvedNotes: true,
      },
    });

    assert.equal(
      withResolved.issues.some((i) => i.tagOrTarget === '200-TEST-999'),
      true
    );
  });

  it('wraps mixed Korean and English engineering strings cleanly without dropping text', () => {
    const sample =
      '200-PDIT-111E / 100-SDV-254A (L-MPYCYS-27) 케이블 누락 및 본질안전 Ex ia IIC T4 루프 파라미터 검증 요망';
    const lines = splitTextIntoLines(sample, 24);
    assert.ok(lines.length >= 3);
    const rejoined = lines.join(' ').replace(/\s+/g, '');
    const original = sample.replace(/\s+/g, '');
    assert.equal(rejoined, original);
  });
});
