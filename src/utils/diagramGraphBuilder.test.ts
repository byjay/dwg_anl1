import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { H042_LOOP_SEED_DATA } from '../data/h042Dataset.ts';
import { runParallelBatchMatch } from './diagramMatcher.ts';
import {
  buildDiagramNetworkGraph,
  buildParallelMatchSunburstTree,
} from './diagramGraphBuilder.ts';

describe('D3 Sunburst & Network Graph Data Builder', () => {
  it('builds a 3-tier Sunburst hierarchy matching parallel batch KPIs', async () => {
    const { results, summary } = await runParallelBatchMatch(H042_LOOP_SEED_DATA);
    const tree = buildParallelMatchSunburstTree(results, summary);

    assert.equal(tree.kind, 'ROOT');
    assert.equal(tree.totalCount, summary.totalLoops);
    assert.equal(tree.matchedCount, summary.matchedCount);
    assert.equal(tree.issueCount, summary.totalLoops - summary.matchedCount);
    assert.equal(tree.matchRatePercent, summary.matchRatePercent);
    assert.equal(tree.children?.length, 4); // Units 100, 200, 300, 400

    const leafSum = (tree.children || []).reduce(
      (acc, mod) =>
        acc +
        (mod.children || []).reduce((sAcc, st) => sAcc + (st.children?.length || 0), 0),
      0
    );
    assert.equal(leafSum, summary.totalLoops);
  });

  it('builds a cross-drawing Network Graph connecting P&ID, GAR, and Electrical layers plus custom uploads', async () => {
    const { results } = await runParallelBatchMatch(H042_LOOP_SEED_DATA);
    const graph = buildDiagramNetworkGraph(results, {
      totalDurationMs: 10,
      drawingsAnalyzed: 2,
      pagesScanned: 2,
      pages: [],
      entities: [],
      entityCountsByKind: {
        TAG: 1,
        CABLE: 1,
        JUNCTION_BOX: 0,
        LINE_NO: 0,
        EQUIPMENT: 1,
        HOLD_OR_NOTE: 0,
        REVISION: 0,
      },
      crossDrawingPresence: [],
      documentProfiles: [
        {
          drawingId: 'CUSTOM-PID-1',
          displayName: '[업로드] ext_pid.pdf',
          docClass: 'PID',
          docClassLabelKo: '배관 계장도 (P&ID)',
          pageCount: 1,
          equipmentCount: 1,
          cableCount: 1,
          tagCount: 1,
          jbCount: 0,
          isMakerDrawing: false,
        },
        {
          drawingId: 'CUSTOM-MKR-1',
          displayName: '[업로드] maker_panel.pdf',
          docClass: 'MAKER_DRAWING',
          docClassLabelKo: '메이커 / 벤더 도면',
          pageCount: 1,
          equipmentCount: 1,
          cableCount: 1,
          tagCount: 1,
          jbCount: 0,
          isMakerDrawing: true,
        },
      ],
      universalMatches: [
        {
          id: 'UM-1',
          coreKey: 'P-301A',
          displayTag: '500-P-301A',
          entityCategory: 'EQUIPMENT',
          matchStatus: 'CROSS_MATCHED',
          severity: 'INFO',
          pidOrLayoutDrawings: ['CUSTOM-PID-1'],
          electricalOrCableDrawings: [],
          makerDrawings: ['CUSTOM-MKR-1'],
          variantsFound: ['500-P-301A'],
          linkedCableNos: ['CBL-501'],
          linkedEquipment: ['500-P-301A'],
          summaryKo: '다중 도면 간 매칭',
          primaryJump: {
            drawingId: 'CUSTOM-PID-1',
            pageNum: 1,
            rawText: '500-P-301A',
            xPct: 20,
            yPct: 20,
          },
        },
      ],
    });

    assert.ok(graph.nodes.some((n) => n.id === 'PR-100-PID-0001' && n.kind === 'PIPING' && n.iconRole === 'PID'));
    assert.ok(graph.nodes.some((n) => n.id === 'PD-200-GAR-0001' && n.kind === 'GAR' && n.iconRole === 'GAR'));
    assert.ok(graph.nodes.some((n) => n.id === 'CI-000-DIA-0002' && n.kind === 'ELECTRICAL' && n.iconRole === 'PSDS'));
    assert.ok(graph.nodes.some((n) => n.id === 'CUSTOM-MKR-1' && n.kind === 'EXTERNAL_MAKER' && n.iconRole === 'MAKER'));
    const customLink = graph.links.find((l) => l.source === 'CUSTOM-PID-1' && l.target === 'CUSTOM-MKR-1');
    assert.ok(customLink);
    assert.ok(customLink.sampleCables.includes('CBL-501'));
    assert.equal(customLink.cableContinuity, 'CONNECTED');
    const unlinkedEdge = graph.links.find((l) => l.target === 'UNLINKED-ELEC');
    assert.ok(unlinkedEdge);
    assert.equal(unlinkedEdge.cableContinuity, 'BROKEN');
    assert.equal(graph.overallStats.externalDocsLinked, 2);
    assert.equal(graph.overallStats.totalLoops, results.length);
  });

  it('handles empty loops cleanly without NaN or errors', () => {
    const emptySummary = {
      totalLoops: 0,
      matchedCount: 0,
      cableMissingCount: 0,
      unassignedCircuitCount: 0,
      pidOnlyCount: 0,
      conflictCount: 0,
      revisionDriftCount: 0,
      criticalIssuesCount: 0,
      warningIssuesCount: 0,
      matchRatePercent: 0,
      batchDurationMs: 0,
      workerPartitionCount: 0,
      moduleBreakdown: [],
    };
    const tree = buildParallelMatchSunburstTree([], emptySummary);
    const graph = buildDiagramNetworkGraph([], null);
    assert.equal(tree.totalCount, 0);
    assert.equal(tree.matchRatePercent, 0);
    assert.equal(graph.nodes.length, 0);
    assert.equal(graph.links.length, 0);
  });
});
