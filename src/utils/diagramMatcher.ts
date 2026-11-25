import {
  DiagramLoopEntry,
  DiscrepancyItem,
  EvaluatedLoopMatch,
  MatchStatus,
  ParallelBatchSummary,
  UnitCode,
} from '../types/diagram';

/**
 * Normalizes a P&ID or Electrical tag to a canonical uppercase unit-prefixed form.
 * Example: normalizeTag('PIT-201A', '100') -> '100-PIT-201A'
 * Example: normalizeTag('200-SDY-111A') -> '200-SDY-111A'
 */
export function normalizeTag(rawTag: string, fallbackUnit?: UnitCode): string {
  const cleaned = rawTag
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '-')
    .replace(/\(.*?\)/g, '')
    .replace(/-+$/g, '');

  const unitMatch = cleaned.match(/^(000|100|200|300|400)-(.+)$/);
  if (unitMatch) {
    return `${unitMatch[1]}-${unitMatch[2]}`;
  }
  if (fallbackUnit) {
    return `${fallbackUnit}-${cleaned}`;
  }
  return cleaned;
}

/**
 * Maps a P&ID instrument/valve tag to its expected electrical signal tags
 * following GasEntec H042 DIA-0001 / DIA-0002 convention.
 */
export function deriveExpectedElectricalTags(pidTag: string, unitCode: UnitCode): string[] {
  const canonical = normalizeTag(pidTag, unitCode);
  const match = canonical.match(/^(\d{3})-([A-Z]+)-(.+)$/);
  if (!match) return [canonical];

  const [, unit, prefix, suffix] = match;
  switch (prefix) {
    case 'SDV':
      return [`${unit}-SDY-${suffix}`, `${unit}-ZSO-${suffix}`, `${unit}-ZSC-${suffix}`];
    case 'BDV':
      return [`${unit}-BDY-${suffix}`, `${unit}-BZSO-${suffix}`, `${unit}-BZSC-${suffix}`];
    case 'UV':
      return [`${unit}-UY-${suffix}`, `${unit}-UZSO-${suffix}`, `${unit}-UZSC-${suffix}`];
    case 'FCV':
      return [`${unit}-FCV-${suffix}`, `${unit}-FVI-${suffix}`];
    case 'TCV':
      return [`${unit}-TCV-${suffix}`, `${unit}-TVI-${suffix}`];
    case 'HV':
      return [`${unit}-HV-${suffix}`, `${unit}-HVI-${suffix}`];
    default:
      return [canonical];
  }
}

/**
 * Checks whether an electrical tag has a unit code prefix that conflicts with its P&ID unit.
 */
export function detectUnitCodeMismatch(pidUnit: UnitCode, electricalTag: string): boolean {
  const tokens = electricalTag.toUpperCase().match(/\b(000|100|200|300|400)-[A-Z0-9_/]+/g) || [];
  return tokens.some((tok) => !tok.startsWith(`${pidUnit}-`));
}

/**
 * Evaluates a single P&ID <-> GAR <-> Electrical loop entry and detects cross-diagram issues.
 */
export function evaluateLoopEntry(entry: DiagramLoopEntry): EvaluatedLoopMatch {
  const discrepancies: DiscrepancyItem[] = [...(entry.knownDiscrepancies || [])];

  // 1. Dynamic check: Unit prefix mismatch between P&ID and Electrical tags
  for (const ep of entry.electricalPaths) {
    if (
      detectUnitCodeMismatch(entry.unitCode, ep.electricalTag) &&
      !discrepancies.some((d) => d.category === 'UNIT_CODE_MISMATCH')
    ) {
      discrepancies.push({
        id: `AUTO-UNIT-${entry.id}`,
        severity: 'CRITICAL',
        category: 'UNIT_CODE_MISMATCH',
        title: `유닛 코드 불일치 (${entry.unitCode} vs ${ep.electricalTag})`,
        description: `P&ID 기준 유닛 코드는 ${entry.unitCode}이나 전장 도면(${ep.blockSheet}/${ep.connectionSheet})에 타 유닛 접두어가 혼용되었습니다.`,
        affectedDrawings: [ep.system === 'PSDS' ? 'H042-CI-000-DIA-0002' : 'H042-CI-000-DIA-0001'],
        recommendedAction: `전장 태그 접두어를 ${entry.unitCode}- 로 통일하세요.`,
      });
    }

    // 2. Dynamic check: Block diagram JB vs Connection table JB mismatch
    if (
      ep.blockDiagramJbNote &&
      !discrepancies.some((d) => d.category === 'JB_NAMING_CONFLICT' || d.category === 'DUPLICATE_TAG_OR_RELAY' || d.category === 'UNIT_CODE_MISMATCH')
    ) {
      discrepancies.push({
        id: `AUTO-JB-${entry.id}`,
        severity: 'WARNING',
        category: 'JB_NAMING_CONFLICT',
        title: `블록도-결선표 JB 표기 불일치 (${ep.junctionBox})`,
        description: ep.blockDiagramJbNote,
        affectedDrawings: [ep.system === 'PSDS' ? 'H042-CI-000-DIA-0002' : 'H042-CI-000-DIA-0001'],
        recommendedAction: `블록도(${ep.blockSheet})와 결선표(${ep.connectionSheet})의 JB 명칭을 일치시키세요.`,
      });
    }
  }

  // 3. Dynamic check: GAR markup status B (Cable Missing), C (Unassigned), D (P&ID Only)
  if (entry.gar?.markupCode === 'B' && !discrepancies.some((d) => d.category === 'CABLE_MISSING')) {
    discrepancies.push({
      id: `AUTO-MARK-B-${entry.id}`,
      severity: 'CRITICAL',
      category: 'CABLE_MISSING',
      title: `케이블 누락 (SEASTAR Mark B): ${entry.canonicalTag}`,
      description:
        entry.gar.note ||
        `GAR(${entry.gar.sheet}) 마크업 B — LIS I/O 목록에는 존재하나 Cable List에 케이블 번호가 누락(NO. T.B.D)되어 있습니다.`,
      affectedDrawings: [`H042-PD-${entry.unitCode}-GAR-0001`, 'H042-CI-000-DIA-0002'],
      recommendedAction: 'Cable List에 신규 케이블 번호를 발행하고 결선도에 반영하세요.',
    });
  } else if (entry.gar?.markupCode === 'C' && !discrepancies.some((d) => d.category === 'UNASSIGNED_CIRCUIT')) {
    discrepancies.push({
      id: `AUTO-MARK-C-${entry.id}`,
      severity: 'WARNING',
      category: 'UNASSIGNED_CIRCUIT',
      title: `케이블 번호 미할당 (SEASTAR Mark C): ${entry.canonicalTag}`,
      description:
        entry.gar.note ||
        `GAR(${entry.gar.sheet}) 마크업 C — DIA-0001 회로도는 존재하나 정식 케이블 번호가 미할당(RC****) 상태입니다.`,
      affectedDrawings: [`H042-PD-${entry.unitCode}-GAR-0001`, 'H042-CI-000-DIA-0001'],
      recommendedAction: '미할당 RC**** 회로에 정식 케이블 번호를 배정하세요.',
    });
  } else if (entry.gar?.markupCode === 'D' && !discrepancies.some((d) => d.category === 'PID_ONLY_UNWIRED')) {
    discrepancies.push({
      id: `AUTO-MARK-D-${entry.id}`,
      severity: 'WARNING',
      category: 'PID_ONLY_UNWIRED',
      title: `P&ID 단독 존재 / 전장 미반영 (SEASTAR Mark D): ${entry.canonicalTag}`,
      description:
        entry.gar.note ||
        `P&ID(${entry.pid.sheet})에는 표기되어 있으나 전장 결선도 및 케이블 리스트에서 확인되지 않습니다.`,
      affectedDrawings: [`H042-PR-${entry.unitCode}-PID-0001`, `H042-PD-${entry.unitCode}-GAR-0001`],
      recommendedAction: '로컬 MCC 패키지 내부 결선인지, 아니면 전장 I/O 누락인지 확인하세요.',
    });
  }

  // Determine canonical status with priority order
  let status: MatchStatus = 'MATCHED';
  if (discrepancies.some((d) => d.category === 'REVISION_DRIFT')) {
    status = 'REVISION_DRIFT';
  } else if (
    discrepancies.some(
      (d) =>
        d.category === 'UNIT_CODE_MISMATCH' ||
        d.category === 'TAG_TYPO' ||
        d.category === 'DUPLICATE_TAG_OR_RELAY' ||
        d.category === 'JB_NAMING_CONFLICT' ||
        d.category === 'EQUIPMENT_TAG_MISMATCH'
    )
  ) {
    status = 'CONFLICT';
  } else if (discrepancies.some((d) => d.category === 'CABLE_MISSING')) {
    status = 'CABLE_MISSING';
  } else if (discrepancies.some((d) => d.category === 'UNASSIGNED_CIRCUIT')) {
    status = 'UNASSIGNED_CIRCUIT';
  } else if (discrepancies.some((d) => d.category === 'PID_ONLY_UNWIRED')) {
    status = 'PID_ONLY';
  }

  const statusLabelMap: Record<MatchStatus, string> = {
    MATCHED: '정상 매칭',
    CABLE_MISSING: '케이블 누락 (Mark B)',
    UNASSIGNED_CIRCUIT: '번호 미할당 (Mark C)',
    PID_ONLY: 'P&ID 단독 (Mark D)',
    CONFLICT: '도면 불일치 / 오기',
    REVISION_DRIFT: '리비전 불일치 (삭제태그)',
  };

  // Completeness score across 3 layers (P&ID + GAR + Electrical)
  let score = 34; // P&ID base
  if (entry.gar) score += entry.gar.markupCode === 'A' || entry.gar.markupCode === 'E' ? 33 : 15;
  if (entry.electricalPaths.length > 0) score += 33;
  const criticalPenalty = discrepancies.filter((d) => d.severity === 'CRITICAL').length * 25;
  const warningPenalty = discrepancies.filter((d) => d.severity === 'WARNING').length * 12;
  const completenessScore = Math.max(10, Math.min(100, score - criticalPenalty - warningPenalty));

  const primaryPath = entry.electricalPaths[0];
  const primaryCableNo =
    primaryPath?.fieldCableNo || entry.gar?.annotatedCableNo || (entry.gar?.markupCode === 'E' ? 'LOCAL (NO CABLE)' : 'UNWIRED');
  const primaryJunctionBox = primaryPath?.junctionBox || (entry.gar?.markupCode === 'E' ? 'LOCAL GAUGE' : 'N/A');
  const primarySystem = primaryPath?.system || (entry.gar?.markupCode === 'E' ? 'LOCAL' : 'UNLINKED');

  return {
    ...entry,
    status,
    statusLabelKo: statusLabelMap[status],
    discrepancies,
    completenessScore,
    primaryCableNo,
    primaryJunctionBox,
    primarySystem,
  };
}

/**
 * Parallelizes cross-diagram evaluation by partitioning entries by module/unitCode
 * and running concurrent Promise.all workers.
 */
export async function runParallelBatchMatch(
  entries: DiagramLoopEntry[]
): Promise<{ results: EvaluatedLoopMatch[]; summary: ParallelBatchSummary }> {
  const start = performance.now();

  // Partition entries by unitCode so each module runs in its own parallel worker task
  const partitions = new Map<UnitCode, DiagramLoopEntry[]>();
  for (const entry of entries) {
    const list = partitions.get(entry.unitCode) || [];
    list.push(entry);
    partitions.set(entry.unitCode, list);
  }

  const workerOutputs = await Promise.all(
    Array.from(partitions.entries()).map(async ([, partitionEntries]) => {
      return partitionEntries.map((item) => evaluateLoopEntry(item));
    })
  );

  const results = workerOutputs.flat();
  const durationMs = Math.max(1, Math.round(performance.now() - start));

  const totalLoops = results.length;
  const matchedCount = results.filter((r) => r.status === 'MATCHED').length;
  const cableMissingCount = results.filter((r) => r.status === 'CABLE_MISSING').length;
  const unassignedCircuitCount = results.filter((r) => r.status === 'UNASSIGNED_CIRCUIT').length;
  const pidOnlyCount = results.filter((r) => r.status === 'PID_ONLY').length;
  const conflictCount = results.filter((r) => r.status === 'CONFLICT').length;
  const revisionDriftCount = results.filter((r) => r.status === 'REVISION_DRIFT').length;

  const allDiscrepancies = results.flatMap((r) => r.discrepancies);
  const criticalIssuesCount = allDiscrepancies.filter((d) => d.severity === 'CRITICAL').length;
  const warningIssuesCount = allDiscrepancies.filter((d) => d.severity === 'WARNING').length;

  const moduleNames: Record<UnitCode, string> = {
    '000': 'Common Facilities',
    '100': 'Regastainer Module',
    '200': 'HP Pump Skid Module',
    '300': 'Recondenser Module',
    '400': 'Utility Interface',
  };

  const moduleBreakdown = Array.from(partitions.keys())
    .sort()
    .map((unitCode) => {
      const modItems = results.filter((r) => r.unitCode === unitCode);
      const matched = modItems.filter((r) => r.status === 'MATCHED').length;
      return {
        unitCode,
        moduleName: moduleNames[unitCode] || `Unit ${unitCode}`,
        total: modItems.length,
        matched,
        issues: modItems.length - matched,
      };
    });

  return {
    results,
    summary: {
      totalLoops,
      matchedCount,
      cableMissingCount,
      unassignedCircuitCount,
      pidOnlyCount,
      conflictCount,
      revisionDriftCount,
      criticalIssuesCount,
      warningIssuesCount,
      matchRatePercent: totalLoops > 0 ? Math.round((matchedCount / totalLoops) * 100) : 0,
      batchDurationMs: durationMs,
      workerPartitionCount: partitions.size,
      moduleBreakdown,
    },
  };
}

export interface LoopFilterOptions {
  unitCode: 'ALL' | UnitCode;
  status: 'ALL' | MatchStatus | 'ISSUES_ONLY';
  system: 'ALL' | 'ICAMS' | 'PSDS' | 'ESD_MCC' | 'UNLINKED';
  query: string;
}

export function filterEvaluatedLoops(
  loops: EvaluatedLoopMatch[],
  filters: LoopFilterOptions
): EvaluatedLoopMatch[] {
  const q = filters.query.trim().toLowerCase();
  return loops.filter((loop) => {
    if (filters.unitCode !== 'ALL' && loop.unitCode !== filters.unitCode) {
      return false;
    }
    if (filters.status === 'ISSUES_ONLY' && loop.status === 'MATCHED') {
      return false;
    }
    if (filters.status !== 'ALL' && filters.status !== 'ISSUES_ONLY' && loop.status !== filters.status) {
      return false;
    }
    if (filters.system !== 'ALL') {
      if (filters.system === 'UNLINKED') {
        if (loop.electricalPaths.length > 0) return false;
      } else if (!loop.electricalPaths.some((p) => p.system === filters.system)) {
        return false;
      }
    }
    if (!q) return true;

    const haystack = [
      loop.canonicalTag,
      loop.equipmentTag,
      loop.serviceName,
      loop.pid.rawTag,
      loop.pid.lineNo || '',
      loop.primaryCableNo,
      loop.primaryJunctionBox,
      loop.gar?.annotatedCableNo || '',
      ...loop.electricalPaths.flatMap((p) => [
        p.electricalTag,
        p.fieldCableNo,
        p.junctionBox,
        p.trunkCableNo,
        p.blockSheet,
        p.connectionSheet,
      ]),
      ...loop.discrepancies.map((d) => `${d.title} ${d.description}`),
    ]
      .join(' ')
      .toLowerCase();

    return haystack.includes(q);
  });
}

export function exportLoopsToCsv(loops: EvaluatedLoopMatch[]): string {
  const headers = [
    'Unit',
    'Canonical Tag',
    'Equipment',
    'Service',
    'Status',
    'P&ID Sheet',
    'Line No',
    'GAR Markup',
    'System',
    'Field Cable',
    'Junction Box',
    'Trunk Cable',
    'Issue Count',
    'Top Issue',
  ];

  const escape = (val: string | number) => `"${String(val).replace(/"/g, '""')}"`;

  const rows = loops.map((l) => [
    l.unitCode,
    l.canonicalTag,
    l.equipmentTag,
    l.serviceName,
    l.statusLabelKo,
    l.pid.sheet,
    l.pid.lineNo || '-',
    l.gar ? `${l.gar.markupCode} (${l.gar.sheet})` : '-',
    l.primarySystem,
    l.primaryCableNo,
    l.primaryJunctionBox,
    l.electricalPaths[0]?.trunkCableNo || '-',
    l.discrepancies.length,
    l.discrepancies[0]?.title || 'OK',
  ]);

  return [headers.map(escape).join(','), ...rows.map((r) => r.map(escape).join(','))].join('\n');
}
