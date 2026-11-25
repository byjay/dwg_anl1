import {
  DrawingContentAnalysisReport,
  EvaluatedLoopMatch,
  MatchStatus,
  ParallelBatchSummary,
  UnitCode,
} from '../types/diagram';

export interface SunburstNodeDatum {
  id: string;
  name: string;
  shortLabel: string;
  kind: 'ROOT' | 'MODULE' | 'STATUS' | 'LOOP';
  value?: number;
  unitCode?: UnitCode;
  status?: MatchStatus;
  loopId?: string;
  canonicalTag?: string;
  matchedCount: number;
  issueCount: number;
  totalCount: number;
  matchRatePercent: number;
  completenessScore?: number;
  discrepancyCount?: number;
  color: string;
  children?: SunburstNodeDatum[];
}

export type NetworkNodeKind = 'PIPING' | 'GAR' | 'ELECTRICAL' | 'EXTERNAL_MAKER';
export type NetworkIconRole =
  | 'PID'
  | 'GAR'
  | 'ICAMS'
  | 'PSDS'
  | 'MCC'
  | 'UNLINKED'
  | 'MAKER';

export interface DiagramNetworkNode {
  id: string;
  label: string;
  shortLabel: string;
  kind: NetworkNodeKind;
  iconRole: NetworkIconRole;
  systemFilter?: 'ICAMS' | 'PSDS' | 'ESD_MCC' | 'UNLINKED';
  unitCode?: UnitCode;
  totalLoops: number;
  matchedLoops: number;
  issueLoops: number;
  criticalCount: number;
  matchRatePercent: number;
  /** Deterministic initial coordinates (percentage 0..100 of canvas) to stabilize D3 force layout */
  anchorXRatio: number;
  anchorYRatio: number;
  loopIds: string[];
}

export interface DiagramNetworkLink {
  id: string;
  source: string;
  target: string;
  totalLoops: number;
  matchedLoops: number;
  issueLoops: number;
  criticalCount: number;
  dominantHealth: 'HEALTHY' | 'WARNING' | 'CRITICAL';
  cableContinuity: 'CONNECTED' | 'PARTIAL' | 'BROKEN';
  sampleTags: string[];
  sampleCables: string[];
  discrepantLoopIds: string[];
}

export interface DiagramNetworkGraph {
  nodes: DiagramNetworkNode[];
  links: DiagramNetworkLink[];
  overallStats: {
    totalLoops: number;
    matchedLoops: number;
    issueLoops: number;
    matchRatePercent: number;
    totalNodes: number;
    totalLinks: number;
    externalDocsLinked: number;
  };
}

const STATUS_META: Record<
  MatchStatus,
  { label: string; shortLabel: string; color: string; order: number }
> = {
  MATCHED: {
    label: '정상 매칭',
    shortLabel: '정상',
    color: '#16A34A', // emerald-600
    order: 0,
  },
  CONFLICT: {
    label: '도면 불일치 / 오기',
    shortLabel: '오기·충돌',
    color: '#DC2626', // red-600
    order: 1,
  },
  CABLE_MISSING: {
    label: '케이블 누락 (Mark B)',
    shortLabel: 'Mark B 누락',
    color: '#E11D48', // rose-600
    order: 2,
  },
  UNASSIGNED_CIRCUIT: {
    label: '번호 미할당 (Mark C)',
    shortLabel: 'Mark C 미할당',
    color: '#D97706', // amber-600
    order: 3,
  },
  PID_ONLY: {
    label: 'P&ID 단독 (Mark D)',
    shortLabel: 'Mark D 단독',
    color: '#F59E0B', // amber-500
    order: 4,
  },
  REVISION_DRIFT: {
    label: '리비전 불일치',
    shortLabel: '리비전',
    color: '#9333EA', // purple-600
    order: 5,
  },
};

const MODULE_COLORS: Record<UnitCode, string> = {
  '000': '#334155',
  '100': '#0284C7', // sky-600
  '200': '#0369A1', // sky-700
  '300': '#475569',
  '400': '#4F46E5', // indigo-600
};

/**
 * Builds a deterministic 3-tier hierarchy (Root -> Module -> Status -> Loop)
 * for D3 Sunburst partitioning.
 */
export function buildParallelMatchSunburstTree(
  loops: EvaluatedLoopMatch[],
  summary: ParallelBatchSummary
): SunburstNodeDatum {
  const byUnit = new Map<UnitCode, EvaluatedLoopMatch[]>();
  for (const loop of loops) {
    const arr = byUnit.get(loop.unitCode) || [];
    arr.push(loop);
    byUnit.set(loop.unitCode, arr);
  }

  const orderedUnits: UnitCode[] = ['100', '200', '400', '000', '300'];
  const moduleChildren: SunburstNodeDatum[] = [];

  for (const unitCode of orderedUnits) {
    const unitLoops = byUnit.get(unitCode);
    if (!unitLoops || unitLoops.length === 0) continue;

    const moduleName =
      summary.moduleBreakdown.find((m) => m.unitCode === unitCode)?.moduleName ||
      unitLoops[0].moduleName;

    const byStatus = new Map<MatchStatus, EvaluatedLoopMatch[]>();
    for (const l of unitLoops) {
      const sArr = byStatus.get(l.status) || [];
      sArr.push(l);
      byStatus.set(l.status, sArr);
    }

    const statusChildren: SunburstNodeDatum[] = [];
    const sortedStatuses = Array.from(byStatus.keys()).sort(
      (a, b) => STATUS_META[a].order - STATUS_META[b].order
    );

    for (const status of sortedStatuses) {
      const sLoops = byStatus.get(status) || [];
      const meta = STATUS_META[status];
      const matchedCount = status === 'MATCHED' ? sLoops.length : 0;
      const issueCount = status === 'MATCHED' ? 0 : sLoops.length;

      const loopChildren: SunburstNodeDatum[] = sLoops.map((loop) => ({
        id: `SB-LOOP-${loop.id}`,
        name: `${loop.canonicalTag} (${loop.serviceName})`,
        shortLabel: loop.canonicalTag,
        kind: 'LOOP',
        value: 1,
        unitCode: loop.unitCode,
        status: loop.status,
        loopId: loop.id,
        canonicalTag: loop.canonicalTag,
        matchedCount: loop.status === 'MATCHED' ? 1 : 0,
        issueCount: loop.status === 'MATCHED' ? 0 : 1,
        totalCount: 1,
        matchRatePercent: loop.status === 'MATCHED' ? 100 : 0,
        completenessScore: loop.completenessScore,
        discrepancyCount: loop.discrepancies.length,
        color: meta.color,
      }));

      statusChildren.push({
        id: `SB-STATUS-${unitCode}-${status}`,
        name: `${unitCode} · ${meta.label}`,
        shortLabel: meta.shortLabel,
        kind: 'STATUS',
        unitCode,
        status,
        matchedCount,
        issueCount,
        totalCount: sLoops.length,
        matchRatePercent: Math.round((matchedCount / Math.max(1, sLoops.length)) * 100),
        color: meta.color,
        children: loopChildren,
      });
    }

    const modMatched = unitLoops.filter((l) => l.status === 'MATCHED').length;
    const modIssues = unitLoops.length - modMatched;
    moduleChildren.push({
      id: `SB-MOD-${unitCode}`,
      name: `${unitCode} ${moduleName}`,
      shortLabel: `Unit ${unitCode}`,
      kind: 'MODULE',
      unitCode,
      matchedCount: modMatched,
      issueCount: modIssues,
      totalCount: unitLoops.length,
      matchRatePercent: Math.round((modMatched / Math.max(1, unitLoops.length)) * 100),
      color: MODULE_COLORS[unitCode] || '#0284C7',
      children: statusChildren,
    });
  }

  const totalMatched = loops.filter((l) => l.status === 'MATCHED').length;
  const totalIssues = loops.length - totalMatched;

  return {
    id: 'SB-ROOT',
    name: 'H042 전체 시그널 루프',
    shortLabel: '전체 시스템',
    kind: 'ROOT',
    matchedCount: totalMatched,
    issueCount: totalIssues,
    totalCount: loops.length,
    matchRatePercent:
      loops.length > 0 ? Math.round((totalMatched / loops.length) * 100) : summary.matchRatePercent,
    color: '#0F172A',
    children: moduleChildren,
  };
}

function resolvePidDrawingNodeId(unitCode: UnitCode): {
  id: string;
  label: string;
  shortLabel: string;
  anchorXRatio: number;
  anchorYRatio: number;
} {
  if (unitCode === '100') {
    return {
      id: 'PR-100-PID-0001',
      label: 'PR-100-PID-0001 (Regas P&ID)',
      shortLabel: 'P&ID 100',
      anchorXRatio: 0.16,
      anchorYRatio: 0.22,
    };
  }
  if (unitCode === '200') {
    return {
      id: 'PR-200-PID-0001',
      label: 'PR-200-PID-0001 (HP Pump P&ID)',
      shortLabel: 'P&ID 200',
      anchorXRatio: 0.16,
      anchorYRatio: 0.56,
    };
  }
  return {
    id: '400-UTIL-PID',
    label: '400-UTIL-SYS (Utility P&ID)',
    shortLabel: 'P&ID 400',
    anchorXRatio: 0.16,
    anchorYRatio: 0.85,
  };
}

function resolveGarDrawingNodeId(unitCode: UnitCode): {
  id: string;
  label: string;
  shortLabel: string;
  anchorXRatio: number;
  anchorYRatio: number;
} {
  if (unitCode === '100') {
    return {
      id: 'PD-100-GAR-0001',
      label: 'PD-100-GAR-0001 (Regas GAR)',
      shortLabel: 'GAR 100',
      anchorXRatio: 0.49,
      anchorYRatio: 0.24,
    };
  }
  return {
    id: 'PD-200-GAR-0001',
    label: 'PD-200-GAR-0001 (HP Pump GAR)',
    shortLabel: 'GAR 200',
    anchorXRatio: 0.49,
    anchorYRatio: 0.64,
  };
}

function resolveElecDrawingNodeId(loop: EvaluatedLoopMatch): {
  id: string;
  label: string;
  shortLabel: string;
  iconRole: NetworkIconRole;
  systemFilter: DiagramNetworkNode['systemFilter'];
  anchorXRatio: number;
  anchorYRatio: number;
} {
  if (loop.primarySystem === 'ICAMS') {
    return {
      id: 'CI-000-DIA-0001',
      label: 'CI-000-DIA-0001 (iCAMS)',
      shortLabel: 'DIA iCAMS',
      iconRole: 'ICAMS',
      systemFilter: 'ICAMS',
      anchorXRatio: 0.84,
      anchorYRatio: 0.17,
    };
  }
  if (loop.primarySystem === 'PSDS') {
    return {
      id: 'CI-000-DIA-0002',
      label: 'CI-000-DIA-0002 (PSDS)',
      shortLabel: 'DIA PSDS',
      iconRole: 'PSDS',
      systemFilter: 'PSDS',
      anchorXRatio: 0.84,
      anchorYRatio: 0.40,
    };
  }
  if (loop.primarySystem === 'ESD_MCC') {
    return {
      id: 'EXMAR-ESD-MCC',
      label: 'EXMAR ESD / MCC (DIA-0002)',
      shortLabel: 'ESD / MCC',
      iconRole: 'MCC',
      systemFilter: 'ESD_MCC',
      anchorXRatio: 0.84,
      anchorYRatio: 0.63,
    };
  }
  return {
    id: 'UNLINKED-ELEC',
    label: '전장 미연결 (Unwired)',
    shortLabel: '전장 미연결',
    iconRole: 'UNLINKED',
    systemFilter: 'UNLINKED',
    anchorXRatio: 0.84,
    anchorYRatio: 0.86,
  };
}

/**
 * Builds a Cross-Drawing Network Graph connecting Piping (P&ID) <-> Layout (GAR) <-> Electrical (DIA/MCC)
 * plus any dynamically analyzed external/maker drawings from DrawingContentAnalysisReport.
 */
export function buildDiagramNetworkGraph(
  loops: EvaluatedLoopMatch[],
  analysisReport?: DrawingContentAnalysisReport | null
): DiagramNetworkGraph {
  const nodeMap = new Map<string, DiagramNetworkNode>();
  const linkAccum = new Map<
    string,
    {
      source: string;
      target: string;
      totalLoops: number;
      matchedLoops: number;
      issueLoops: number;
      criticalCount: number;
      sampleTags: Set<string>;
      sampleCables: Set<string>;
      discrepantLoopIds: Set<string>;
    }
  >();

  const ensureNode = (
    id: string,
    init: Omit<DiagramNetworkNode, 'totalLoops' | 'matchedLoops' | 'issueLoops' | 'criticalCount' | 'matchRatePercent' | 'loopIds'>
  ): DiagramNetworkNode => {
    let n = nodeMap.get(id);
    if (!n) {
      n = {
        ...init,
        totalLoops: 0,
        matchedLoops: 0,
        issueLoops: 0,
        criticalCount: 0,
        matchRatePercent: 100,
        loopIds: [],
      };
      nodeMap.set(id, n);
    }
    return n;
  };

  const bumpNode = (node: DiagramNetworkNode, loop: EvaluatedLoopMatch) => {
    if (!node.loopIds.includes(loop.id)) {
      node.loopIds.push(loop.id);
      node.totalLoops += 1;
      if (loop.status === 'MATCHED') {
        node.matchedLoops += 1;
      } else {
        node.issueLoops += 1;
      }
      if (loop.discrepancies.some((d) => d.severity === 'CRITICAL')) {
        node.criticalCount += 1;
      }
      node.matchRatePercent = Math.round((node.matchedLoops / Math.max(1, node.totalLoops)) * 100);
    }
  };

  const bumpLink = (source: string, target: string, loop: EvaluatedLoopMatch, forceIssue = false) => {
    const key = `${source}=>${target}`;
    let acc = linkAccum.get(key);
    if (!acc) {
      acc = {
        source,
        target,
        totalLoops: 0,
        matchedLoops: 0,
        issueLoops: 0,
        criticalCount: 0,
        sampleTags: new Set(),
        sampleCables: new Set(),
        discrepantLoopIds: new Set(),
      };
      linkAccum.set(key, acc);
    }
    acc.totalLoops += 1;
    const isIssue = forceIssue || loop.status !== 'MATCHED';
    if (!isIssue) {
      acc.matchedLoops += 1;
    } else {
      acc.issueLoops += 1;
      acc.discrepantLoopIds.add(loop.id);
    }
    if (loop.discrepancies.some((d) => d.severity === 'CRITICAL')) {
      acc.criticalCount += 1;
    }
    if (acc.sampleTags.size < 4) {
      acc.sampleTags.add(loop.canonicalTag);
    }
    const rawCable = (loop.primaryCableNo || '').trim();
    if (
      rawCable &&
      rawCable !== 'UNWIRED' &&
      rawCable !== 'LOCAL (NO CABLE)' &&
      acc.sampleCables.size < 4
    ) {
      acc.sampleCables.add(rawCable.split(/\s+/)[0]);
    }
  };

  for (const loop of loops) {
    const pidInfo = resolvePidDrawingNodeId(loop.unitCode);
    const pidNode = ensureNode(pidInfo.id, {
      id: pidInfo.id,
      label: pidInfo.label,
      shortLabel: pidInfo.shortLabel,
      kind: 'PIPING',
      iconRole: 'PID',
      unitCode: loop.unitCode,
      anchorXRatio: pidInfo.anchorXRatio,
      anchorYRatio: pidInfo.anchorYRatio,
    });
    bumpNode(pidNode, loop);

    const elecInfo = resolveElecDrawingNodeId(loop);
    const elecNode = ensureNode(elecInfo.id, {
      id: elecInfo.id,
      label: elecInfo.label,
      shortLabel: elecInfo.shortLabel,
      kind: 'ELECTRICAL',
      iconRole: elecInfo.iconRole,
      systemFilter: elecInfo.systemFilter,
      anchorXRatio: elecInfo.anchorXRatio,
      anchorYRatio: elecInfo.anchorYRatio,
    });
    bumpNode(elecNode, loop);

    if (loop.gar) {
      const garInfo = resolveGarDrawingNodeId(loop.unitCode);
      const garNode = ensureNode(garInfo.id, {
        id: garInfo.id,
        label: garInfo.label,
        shortLabel: garInfo.shortLabel,
        kind: 'GAR',
        iconRole: 'GAR',
        unitCode: loop.unitCode,
        anchorXRatio: garInfo.anchorXRatio,
        anchorYRatio: garInfo.anchorYRatio,
      });
      bumpNode(garNode, loop);

      bumpLink(pidInfo.id, garInfo.id, loop);
      bumpLink(garInfo.id, elecInfo.id, loop, loop.status === 'PID_ONLY');
    } else {
      bumpLink(pidInfo.id, elecInfo.id, loop);
    }
  }

  // Optionally overlay uploaded/custom drawings from universal analysis
  let externalDocsLinked = 0;
  if (analysisReport?.documentProfiles) {
    const customProfiles = analysisReport.documentProfiles.filter((p) =>
      p.drawingId.startsWith('CUSTOM-')
    );
    externalDocsLinked = customProfiles.length;

    customProfiles.forEach((prof, idx) => {
      const cleanName = prof.displayName.replace(/^\[업로드\]\s*/, '');
      const relatedMatches = (analysisReport.universalMatches || []).filter(
        (m) =>
          m.pidOrLayoutDrawings.includes(prof.drawingId) ||
          m.electricalOrCableDrawings.includes(prof.drawingId) ||
          m.makerDrawings.includes(prof.drawingId)
      );
      const matchedCnt = relatedMatches.filter((m) => m.matchStatus === 'CROSS_MATCHED').length;
      const issueCnt = relatedMatches.length - matchedCnt;
      const critCnt = relatedMatches.filter((m) => m.severity === 'CRITICAL').length;

      const extNode = ensureNode(prof.drawingId, {
        id: prof.drawingId,
        label: `${cleanName} (${prof.docClassLabelKo})`,
        shortLabel: cleanName.slice(0, 16),
        kind: 'EXTERNAL_MAKER',
        iconRole: 'MAKER',
        anchorXRatio: 0.5,
        anchorYRatio: Math.min(0.92, 0.85 + idx * 0.08),
      });
      extNode.totalLoops = Math.max(1, relatedMatches.length);
      extNode.matchedLoops = matchedCnt;
      extNode.issueLoops = issueCnt;
      extNode.criticalCount = critCnt;
      extNode.matchRatePercent =
        relatedMatches.length > 0 ? Math.round((matchedCnt / relatedMatches.length) * 100) : 100;
    });

    // Connect pairs of custom drawings that share universal matches
    if (customProfiles.length >= 2 && analysisReport.universalMatches) {
      for (const um of analysisReport.universalMatches) {
        const docs = Array.from(
          new Set([
            ...um.pidOrLayoutDrawings,
            ...um.electricalOrCableDrawings,
            ...um.makerDrawings,
          ])
        ).filter((d) => nodeMap.has(d));
        if (docs.length >= 2) {
          const src = docs[0];
          const tgt = docs[1];
          const key = `${src}=>${tgt}`;
          let acc = linkAccum.get(key);
          if (!acc) {
            acc = {
              source: src,
              target: tgt,
              totalLoops: 0,
              matchedLoops: 0,
              issueLoops: 0,
              criticalCount: 0,
              sampleTags: new Set(),
              sampleCables: new Set(),
              discrepantLoopIds: new Set(),
            };
            linkAccum.set(key, acc);
          }
          acc.totalLoops += 1;
          if (um.matchStatus === 'CROSS_MATCHED') {
            acc.matchedLoops += 1;
          } else {
            acc.issueLoops += 1;
          }
          if (um.severity === 'CRITICAL') acc.criticalCount += 1;
          if (acc.sampleTags.size < 4) acc.sampleTags.add(um.displayTag);
          for (const c of um.linkedCableNos || []) {
            if (acc.sampleCables.size < 4) acc.sampleCables.add(c);
          }
        }
      }
    }
  }

  const links: DiagramNetworkLink[] = Array.from(linkAccum.entries()).map(([key, acc]) => {
    const dominantHealth: DiagramNetworkLink['dominantHealth'] =
      acc.criticalCount > 0 || acc.issueLoops > acc.matchedLoops
        ? 'CRITICAL'
        : acc.issueLoops > 0
          ? 'WARNING'
          : 'HEALTHY';
    const cableContinuity: DiagramNetworkLink['cableContinuity'] =
      acc.target === 'UNLINKED-ELEC' || (acc.matchedLoops === 0 && acc.criticalCount > 0)
        ? 'BROKEN'
        : acc.issueLoops > 0
          ? 'PARTIAL'
          : 'CONNECTED';

    return {
      id: `LINK-${key}`,
      source: acc.source,
      target: acc.target,
      totalLoops: acc.totalLoops,
      matchedLoops: acc.matchedLoops,
      issueLoops: acc.issueLoops,
      criticalCount: acc.criticalCount,
      dominantHealth,
      cableContinuity,
      sampleTags: Array.from(acc.sampleTags),
      sampleCables: Array.from(acc.sampleCables),
      discrepantLoopIds: Array.from(acc.discrepantLoopIds),
    };
  });

  const nodes = Array.from(nodeMap.values());
  const matchedLoops = loops.filter((l) => l.status === 'MATCHED').length;
  const issueLoops = loops.length - matchedLoops;

  return {
    nodes,
    links,
    overallStats: {
      totalLoops: loops.length,
      matchedLoops,
      issueLoops,
      matchRatePercent: loops.length > 0 ? Math.round((matchedLoops / loops.length) * 100) : 0,
      totalNodes: nodes.length,
      totalLinks: links.length,
      externalDocsLinked,
    },
  };
}
