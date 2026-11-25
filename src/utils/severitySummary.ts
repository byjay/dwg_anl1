import {
  DiscrepancySeverity,
  EvaluatedLoopMatch,
  UnitCode,
} from '../types/diagram';

export interface SeverityDiscrepancyEntry {
  id: string;
  loopId: string;
  canonicalTag: string;
  unitCode: UnitCode;
  serviceName: string;
  severity: DiscrepancySeverity;
  category: string;
  title: string;
  description: string;
  affectedDrawings: string[];
  recommendedAction: string;
  completenessScore: number;
  primaryCableNo: string;
  primaryJunctionBox: string;
}

export interface SeverityBucketSummary {
  severity: DiscrepancySeverity;
  labelKo: string;
  shortLabel: string;
  count: number;
  uniqueLoopCount: number;
  sharePercent: number;
  items: SeverityDiscrepancyEntry[];
}

export interface DiscrepancySeveritySummary {
  totalDiscrepancies: number;
  affectedLoopsCount: number;
  buckets: SeverityBucketSummary[];
  bySeverity: Record<DiscrepancySeverity, SeverityBucketSummary>;
}

const SEVERITY_META: Record<
  DiscrepancySeverity,
  { labelKo: string; shortLabel: string; order: number }
> = {
  CRITICAL: { labelKo: '심각 (Critical)', shortLabel: 'Critical', order: 0 },
  WARNING: { labelKo: '주의 (Warning)', shortLabel: 'Warning', order: 1 },
  INFO: { labelKo: '참고 (Info)', shortLabel: 'Info', order: 2 },
};

/**
 * Pure aggregator for Critical / Warning / Info design discrepancies across evaluated loops.
 */
export function buildDiscrepancySeveritySummary(
  loops: EvaluatedLoopMatch[]
): DiscrepancySeveritySummary {
  const entriesBySeverity: Record<DiscrepancySeverity, SeverityDiscrepancyEntry[]> = {
    CRITICAL: [],
    WARNING: [],
    INFO: [],
  };
  const affectedLoopIds = new Set<string>();

  for (const loop of loops) {
    if (loop.discrepancies.length > 0) {
      affectedLoopIds.add(loop.id);
    }
    for (const disc of loop.discrepancies) {
      entriesBySeverity[disc.severity].push({
        id: `${loop.id}::${disc.id}`,
        loopId: loop.id,
        canonicalTag: loop.canonicalTag,
        unitCode: loop.unitCode,
        serviceName: loop.serviceName,
        severity: disc.severity,
        category: disc.category,
        title: disc.title,
        description: disc.description,
        affectedDrawings: disc.affectedDrawings,
        recommendedAction: disc.recommendedAction,
        completenessScore: loop.completenessScore,
        primaryCableNo: loop.primaryCableNo,
        primaryJunctionBox: loop.primaryJunctionBox,
      });
    }
  }

  const totalDiscrepancies =
    entriesBySeverity.CRITICAL.length +
    entriesBySeverity.WARNING.length +
    entriesBySeverity.INFO.length;

  const severities: DiscrepancySeverity[] = ['CRITICAL', 'WARNING', 'INFO'];
  const buckets: SeverityBucketSummary[] = severities.map((sev) => {
    const items = entriesBySeverity[sev];
    const uniqueLoops = new Set(items.map((i) => i.loopId));
    return {
      severity: sev,
      labelKo: SEVERITY_META[sev].labelKo,
      shortLabel: SEVERITY_META[sev].shortLabel,
      count: items.length,
      uniqueLoopCount: uniqueLoops.size,
      sharePercent:
        totalDiscrepancies > 0 ? Math.round((items.length / totalDiscrepancies) * 100) : 0,
      items,
    };
  });

  return {
    totalDiscrepancies,
    affectedLoopsCount: affectedLoopIds.size,
    buckets,
    bySeverity: {
      CRITICAL: buckets[0],
      WARNING: buckets[1],
      INFO: buckets[2],
    },
  };
}
