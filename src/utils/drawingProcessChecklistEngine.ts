import type { WorkbenchTab } from '../components/TopBar';
import type {
  CrossLayerDiffItem,
  DiscrepancySeverity,
  DrawingContentAnalysisReport,
  DrawingPinNote,
  EvaluatedLoopMatch,
  ParallelAnalyzeResponse,
  RuleViolationHit,
  SpecReviewReport,
} from '../types/diagram';

export type ReviewDisciplineStage = 'PID' | 'GAR' | 'ELECTRICAL' | 'CROSS_GATE';

export type ProcessCheckAutoStatus = 'COMPLETED' | 'OPEN_ISSUE' | 'HOLD_BLOCKED';

export interface ProcessChecklistItem {
  id: string;
  code: string;
  stageOrder: number;
  stageLabelKo: string;
  discipline: ReviewDisciplineStage;
  disciplineLabelKo: string;
  titleKo: string;
  processStandardRef: string;
  autoStatus: ProcessCheckAutoStatus;
  effectiveCompleted: boolean;
  isManuallySignedOff: boolean;
  severity: DiscrepancySeverity;
  affectedCount: number;
  affectedTags: string[];
  evidenceDrawings: string[];
  findingSummaryKo: string;
  actionRequiredKo: string;
  responsibleGroup: string;
  sapTCode: string;
  targetTab: WorkbenchTab;
}

export interface DisciplineStageSummary {
  discipline: ReviewDisciplineStage;
  stageOrder: number;
  labelKo: string;
  shortLabelKo: string;
  total: number;
  completed: number;
  incomplete: number;
  holdBlocked: number;
  completionPct: number;
}

export interface ProcessChecklistEvaluation {
  items: ProcessChecklistItem[];
  incompleteItems: ProcessChecklistItem[];
  summary: {
    total: number;
    completedCount: number;
    incompleteCount: number;
    holdBlockedCount: number;
    criticalIncompleteCount: number;
    warningIncompleteCount: number;
    infoIncompleteCount: number;
    completionRatePct: number;
    releaseGateReady: boolean;
    byStage: DisciplineStageSummary[];
  };
}

export interface EvaluateProcessChecklistContext {
  evaluatedLoops: EvaluatedLoopMatch[];
  crossLayerDiffs: CrossLayerDiffItem[];
  ruleViolations: RuleViolationHit[];
  specReport: SpecReviewReport;
  pinNotes: DrawingPinNote[];
  analysisReport: DrawingContentAnalysisReport | null;
  aiResult: ParallelAnalyzeResponse | null;
  manualSignOffs?: Record<string, boolean>;
}

export const PROCESS_STAGES: Array<{
  discipline: ReviewDisciplineStage;
  stageOrder: number;
  labelKo: string;
  shortLabelKo: string;
}> = [
  {
    discipline: 'PID',
    stageOrder: 1,
    labelKo: '1단계 · P&ID 공정도 검토',
    shortLabelKo: 'P&ID 공정도',
  },
  {
    discipline: 'GAR',
    stageOrder: 2,
    labelKo: '2단계 · GAR 장비·배치도 검토',
    shortLabelKo: 'GAR 배치도',
  },
  {
    discipline: 'ELECTRICAL',
    stageOrder: 3,
    labelKo: '3단계 · Electrical 전장·결선 검토',
    shortLabelKo: 'Electrical 전장',
  },
  {
    discipline: 'CROSS_GATE',
    stageOrder: 4,
    labelKo: '4단계 · 통합교차 · 메이커 · 출도게이트',
    shortLabelKo: '통합·출도게이트',
  },
];

function uniqueStrings(values: Array<string | undefined | null>, limit = 8): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    const clean = (v || '').trim();
    if (!clean || seen.has(clean)) continue;
    seen.add(clean);
    out.push(clean);
    if (out.length >= limit) break;
  }
  return out;
}

function highestSeverity(severities: DiscrepancySeverity[]): DiscrepancySeverity {
  if (severities.includes('CRITICAL')) return 'CRITICAL';
  if (severities.includes('WARNING')) return 'WARNING';
  return 'INFO';
}

interface RawProcessCheckSeed {
  id: string;
  code: string;
  discipline: ReviewDisciplineStage;
  titleKo: string;
  processStandardRef: string;
  autoStatus: ProcessCheckAutoStatus;
  severity: DiscrepancySeverity;
  affectedCount: number;
  affectedTags: string[];
  evidenceDrawings: string[];
  findingSummaryKo: string;
  actionRequiredKo: string;
  responsibleGroup: string;
  sapTCode: string;
  targetTab: WorkbenchTab;
}

export function evaluateDrawingProcessChecklist(
  ctx: EvaluateProcessChecklistContext
): ProcessChecklistEvaluation {
  const {
    evaluatedLoops,
    crossLayerDiffs,
    ruleViolations,
    specReport,
    pinNotes,
    analysisReport,
    aiResult,
    manualSignOffs = {},
  } = ctx;

  const seeds: RawProcessCheckSeed[] = [];

  // --------------------------------------------------------------------------
  // STAGE 1: P&ID Review Gates
  // --------------------------------------------------------------------------
  const pidRevisionLoops = evaluatedLoops.filter(
    (l) =>
      l.status === 'REVISION_DRIFT' ||
      l.discrepancies.some((d) => d.category === 'REVISION_DRIFT')
  );
  const pidRevisionDiffs = crossLayerDiffs.filter((d) => d.scope === 'REVISION_VS_ACTIVE');
  const pidRevCount = pidRevisionLoops.length + pidRevisionDiffs.length;

  seeds.push({
    id: 'CHK-PID-01',
    code: 'CHK-PID-01',
    discipline: 'PID',
    titleKo: 'P&ID 리비전 변경(Rev.C/D) 및 삭제 태그 잔존 점검',
    processStandardRef: 'ISO 10628 / Rev Control',
    autoStatus: pidRevCount > 0 ? 'OPEN_ISSUE' : 'COMPLETED',
    severity:
      pidRevCount > 0
        ? highestSeverity([
            ...pidRevisionLoops.flatMap((l) => l.discrepancies.map((d) => d.severity)),
            ...pidRevisionDiffs.map((d) => d.severity),
          ])
        : 'INFO',
    affectedCount: pidRevCount,
    affectedTags: uniqueStrings([
      ...pidRevisionLoops.map((l) => l.canonicalTag),
      ...pidRevisionDiffs.map((d) => d.canonicalTag),
    ]),
    evidenceDrawings: uniqueStrings([
      ...pidRevisionLoops.map((l) => `PR-${l.unitCode}-PID-0001 (${l.pid.sheet})`),
      ...pidRevisionDiffs.map((d) => d.leftJump?.drawingId),
    ]),
    findingSummaryKo:
      pidRevCount > 0
        ? `리비전 드래프트 ${pidRevisionLoops.length}개 루프 및 변경 비교 ${pidRevisionDiffs.length}건 검출 (삭제 태그 잔존 확인 필요)`
        : 'P&ID 최신 리비전과 활성 태그 간 드래프트 불일치 없음',
    actionRequiredKo:
      pidRevCount > 0
        ? 'CC03 변경 비교에서 Rev.C/D 삭제 태그(SPARE/DELETED)를 P&ID·결선표에서 동기화하세요.'
        : '리비전 검토 완료',
    responsibleGroup: 'PROCESS-PID',
    sapTCode: 'CC03',
    targetTab: 'diff',
  });

  const unitOrEquipMismatchLoops = evaluatedLoops.filter((l) =>
    l.discrepancies.some(
      (d) => d.category === 'UNIT_CODE_MISMATCH' || d.category === 'EQUIPMENT_TAG_MISMATCH'
    )
  );
  const rule01Hits = ruleViolations.filter((v) => v.ruleCode === 'RULE-01');
  const pidUnitCount = Math.max(unitOrEquipMismatchLoops.length, rule01Hits.length);

  seeds.push({
    id: 'CHK-PID-02',
    code: 'CHK-PID-02',
    discipline: 'PID',
    titleKo: 'P&ID 유닛 코드(100/200/300/400) 및 장비 태그 정합성 검증',
    processStandardRef: 'Tag Grammar / RULE-01',
    autoStatus: pidUnitCount > 0 ? 'HOLD_BLOCKED' : 'COMPLETED',
    severity: pidUnitCount > 0 ? 'CRITICAL' : 'INFO',
    affectedCount: pidUnitCount,
    affectedTags: uniqueStrings([
      ...unitOrEquipMismatchLoops.map((l) => l.canonicalTag),
      ...rule01Hits.map((h) => h.tagOrTarget),
    ]),
    evidenceDrawings: uniqueStrings([
      ...rule01Hits.map((h) => h.drawingId),
      ...unitOrEquipMismatchLoops.map((l) => `PR-${l.unitCode}-PID-0001 (${l.pid.sheet})`),
    ]),
    findingSummaryKo:
      pidUnitCount > 0
        ? `유닛 접두사/장비명 오기 ${pidUnitCount}건 검출 (예: 200-SDY-101↔100-ZSO-101, 110-P 오기 등)`
        : '전 모듈(100/200/300/400) 유닛 코드 및 장비 태그 일치',
    actionRequiredKo:
      pidUnitCount > 0
        ? 'P&ID 기준 모듈 번호와 GAR/전장 결선도 내 유닛 접두사·장비명을 즉시 정정하세요.'
        : '유닛 코드 검토 완료',
    responsibleGroup: 'PROCESS-PID',
    sapTCode: 'ZRL1',
    targetTab: 'rules',
  });

  const mechChecksFail = specReport.checks.filter(
    (c) => c.discipline === 'MECHANICAL_PROCESS' && c.status !== 'PASS'
  );
  const valveLoopsWithIssues = evaluatedLoops.filter(
    (l) =>
      (l.pid.signalCategory === 'CONTROL_VALVE' ||
        l.pid.signalCategory === 'SHUTDOWN_VALVE' ||
        l.pid.signalCategory === 'ON_OFF_VALVE') &&
      l.discrepancies.length > 0
  );
  const pidValveCount = mechChecksFail.length + valveLoopsWithIssues.length;

  seeds.push({
    id: 'CHK-PID-03',
    code: 'CHK-PID-03',
    discipline: 'PID',
    titleKo: '제어·긴급차단 밸브(SDV/FCV/LCV) Fail-Safe · SOV/LS 사양 검토',
    processStandardRef: 'ASME B31.3 / ISA 5.1 / IEC 61511',
    autoStatus:
      mechChecksFail.some((c) => c.status === 'HOLD_REQUIRED') ||
      valveLoopsWithIssues.some((l) => l.discrepancies.some((d) => d.severity === 'CRITICAL'))
        ? 'HOLD_BLOCKED'
        : pidValveCount > 0
          ? 'OPEN_ISSUE'
          : 'COMPLETED',
    severity: pidValveCount > 0 ? 'CRITICAL' : 'INFO',
    affectedCount: pidValveCount,
    affectedTags: uniqueStrings([
      ...mechChecksFail.flatMap((c) => c.affectedTags),
      ...valveLoopsWithIssues.map((l) => l.canonicalTag),
    ]),
    evidenceDrawings: uniqueStrings([
      ...mechChecksFail.map((c) => `${c.drawingId} p.${c.pageNum}`),
      ...valveLoopsWithIssues.map((l) => `PR-${l.unitCode}-PID-0001 (${l.pid.sheet})`),
    ]),
    findingSummaryKo:
      pidValveCount > 0
        ? `밸브 루프 불일치 ${valveLoopsWithIssues.length}건 · 공정/배관 스펙 부적합 ${mechChecksFail.length}건 (300-FCV-001 TYP.2, SDV ZSO/ZSC 등)`
        : '제어/차단 밸브 Fail-Safe 및 솔레노이드·리미트 스위치 사양 적합',
    actionRequiredKo:
      pidValveCount > 0
        ? 'CL03 스펙 검토 및 P&ID↔전장 결선도 간 밸브 부속품(SV/ZSO/ZSC) 신호를 일치시키세요.'
        : '밸브 사양 검토 완료',
    responsibleGroup: 'PIPING-INST',
    sapTCode: 'CL03',
    targetTab: 'spec',
  });

  const pidHoldHits = ruleViolations.filter(
    (v) =>
      v.ruleCode === 'RULE-07' &&
      (!v.drawingId || v.drawingId.includes('PID') || v.drawingId.includes('PR-'))
  );
  const uploadedPidProfiles = (analysisReport?.documentProfiles || []).filter(
    (p) => p.docClass === 'PID'
  );

  seeds.push({
    id: 'CHK-PID-04',
    code: 'CHK-PID-04',
    discipline: 'PID',
    titleKo: 'P&ID 도면 미확정 HOLD · TBD 마커 및 업로드 공정도 엔티티 점검',
    processStandardRef: 'DCC / RULE-07',
    autoStatus: pidHoldHits.length > 0 ? 'OPEN_ISSUE' : 'COMPLETED',
    severity: pidHoldHits.length > 0 ? 'WARNING' : 'INFO',
    affectedCount: pidHoldHits.length,
    affectedTags: uniqueStrings(pidHoldHits.map((h) => h.tagOrTarget)),
    evidenceDrawings: uniqueStrings([
      ...pidHoldHits.map((h) => (h.drawingId ? `${h.drawingId} p.${h.pageNum || 1}` : undefined)),
      ...uploadedPidProfiles.map((p) => `${p.displayName} (${p.tagCount}태그)`),
    ]),
    findingSummaryKo:
      pidHoldHits.length > 0
        ? `P&ID 관련 HOLD/TBD 마커 ${pidHoldHits.length}건 미해결`
        : uploadedPidProfiles.length > 0
          ? `스캔된 P&ID ${uploadedPidProfiles.length}건 내 미해결 HOLD 마커 없음`
          : 'P&ID 내 미확정 HOLD/TBD 마커 미검출',
    actionRequiredKo:
      pidHoldHits.length > 0
        ? 'CV03N/CV04N에서 HOLD 마커 좌표를 확인하고 확정 값을 반영하세요.'
        : 'P&ID HOLD 점검 완료',
    responsibleGroup: 'PROCESS-PID',
    sapTCode: 'CV03N',
    targetTab: 'drawing-ocr',
  });

  // --------------------------------------------------------------------------
  // STAGE 2: GAR (Piping / Electrical Arrangement) Review Gates
  // --------------------------------------------------------------------------
  const cableMissingLoops = evaluatedLoops.filter(
    (l) => l.status === 'CABLE_MISSING' || l.gar?.markupCode === 'B'
  );
  seeds.push({
    id: 'CHK-GAR-01',
    code: 'CHK-GAR-01',
    discipline: 'GAR',
    titleKo: '배치도(GAR) Mark B 케이블 누락 항목 전수 발행 및 반영',
    processStandardRef: 'GAR Markup B / Cable Schedule',
    autoStatus: cableMissingLoops.length > 0 ? 'HOLD_BLOCKED' : 'COMPLETED',
    severity: cableMissingLoops.length > 0 ? 'CRITICAL' : 'INFO',
    affectedCount: cableMissingLoops.length,
    affectedTags: uniqueStrings(cableMissingLoops.map((l) => l.canonicalTag)),
    evidenceDrawings: uniqueStrings(
      cableMissingLoops.map((l) =>
        l.gar ? `PD-${l.unitCode}-GAR-0001 (${l.gar.sheet})` : `PD-${l.unitCode}-GAR-0001`
      )
    ),
    findingSummaryKo:
      cableMissingLoops.length > 0
        ? `GAR Mark B 케이블 누락 루프 ${cableMissingLoops.length}건 미조치 (${cableMissingLoops
            .slice(0, 3)
            .map((l) => l.canonicalTag)
            .join(', ')})`
        : 'GAR Mark B 케이블 누락 항목 없음',
    actionRequiredKo:
      cableMissingLoops.length > 0
        ? 'QM02 코멘트 보고서 기준으로 누락된 케이블 번호를 신규 발행하고 GAR/결선도에 반영하세요.'
        : 'Mark B 검토 완료',
    responsibleGroup: 'EL-LAYOUT',
    sapTCode: 'QM02',
    targetTab: 'comments',
  });

  const unassignedLoops = evaluatedLoops.filter(
    (l) => l.status === 'UNASSIGNED_CIRCUIT' || l.gar?.markupCode === 'C'
  );
  const rule04Hits = ruleViolations.filter((v) => v.ruleCode === 'RULE-04');
  const unassignedCount = Math.max(unassignedLoops.length, rule04Hits.length);

  seeds.push({
    id: 'CHK-GAR-02',
    code: 'CHK-GAR-02',
    discipline: 'GAR',
    titleKo: 'GAR Mark C (RC**** / NO.TBD) 미할당 회로 정식 케이블 번호 확정',
    processStandardRef: 'GAR Markup C / RULE-04',
    autoStatus: unassignedCount > 0 ? 'OPEN_ISSUE' : 'COMPLETED',
    severity: unassignedCount > 0 ? 'CRITICAL' : 'INFO',
    affectedCount: unassignedCount,
    affectedTags: uniqueStrings([
      ...unassignedLoops.map((l) => l.canonicalTag),
      ...rule04Hits.map((h) => h.tagOrTarget),
    ]),
    evidenceDrawings: uniqueStrings([
      ...unassignedLoops.map((l) => (l.gar ? `PD-${l.unitCode}-GAR-0001 (${l.gar.sheet})` : undefined)),
      ...rule04Hits.map((h) => h.drawingId),
    ]),
    findingSummaryKo:
      unassignedCount > 0
        ? `미할당 회로(RC****/HC****/TBD) ${unassignedCount}건 존재`
        : '미할당 회로(RC****/TBD) 없음',
    actionRequiredKo:
      unassignedCount > 0
        ? 'iCAMS/PSDS 결선표에서 정식 회로·케이블 번호를 할당한 뒤 GAR 마크업을 갱신하세요.'
        : 'Mark C 검토 완료',
    responsibleGroup: 'EL-LAYOUT',
    sapTCode: 'CV04N',
    targetTab: 'pdf',
  });

  const pidOnlyLoops = evaluatedLoops.filter(
    (l) => l.status === 'PID_ONLY' || l.gar?.markupCode === 'D'
  );
  seeds.push({
    id: 'CHK-GAR-03',
    code: 'CHK-GAR-03',
    discipline: 'GAR',
    titleKo: 'GAR Mark D (P&ID 단독 계기) 전장·배치도 수록 범위 확정',
    processStandardRef: 'GAR Markup D / Scope Check',
    autoStatus: pidOnlyLoops.length > 0 ? 'OPEN_ISSUE' : 'COMPLETED',
    severity: pidOnlyLoops.length > 0 ? 'WARNING' : 'INFO',
    affectedCount: pidOnlyLoops.length,
    affectedTags: uniqueStrings(pidOnlyLoops.map((l) => l.canonicalTag)),
    evidenceDrawings: uniqueStrings(
      pidOnlyLoops.map((l) => `PR-${l.unitCode}-PID-0001 (${l.pid.sheet})`)
    ),
    findingSummaryKo:
      pidOnlyLoops.length > 0
        ? `P&ID 단독(전장/GAR 미수록) 루프 ${pidOnlyLoops.length}건 — 로컬 패키지 결선 여부 확인 필요`
        : 'P&ID 단독 미배선 항목 없음',
    actionRequiredKo:
      pidOnlyLoops.length > 0
        ? 'MCC/로컬 스키드 내부 결선인지 외부 신호인지 확정하고 외부 신호 시 Cable List에 추가하세요.'
        : 'Mark D 검토 완료',
    responsibleGroup: 'EL-LAYOUT',
    sapTCode: 'MD04',
    targetTab: 'matrix',
  });

  const pidVsGarDiffs = crossLayerDiffs.filter((d) => d.scope === 'PID_VS_GAR');
  const elGarSpecChecks = specReport.checks.filter(
    (c) => (c.specCode === 'SPEC-EL-004' || c.drawingId.includes('GAR')) && c.status !== 'PASS'
  );
  const garAnnotCount = pidVsGarDiffs.length + elGarSpecChecks.length;

  seeds.push({
    id: 'CHK-GAR-04',
    code: 'CHK-GAR-04',
    discipline: 'GAR',
    titleKo: '전장·배관 배치도(EL-100-GAR / PD-GAR) Tag · Cable No. · Elevation 표기 검증',
    processStandardRef: 'EL-100-GAR / SPEC-EL-004',
    autoStatus: garAnnotCount > 0 ? 'HOLD_BLOCKED' : 'COMPLETED',
    severity: garAnnotCount > 0 ? 'CRITICAL' : 'INFO',
    affectedCount: garAnnotCount,
    affectedTags: uniqueStrings([
      ...elGarSpecChecks.flatMap((c) => c.affectedTags),
      ...pidVsGarDiffs.map((d) => d.canonicalTag),
    ]),
    evidenceDrawings: uniqueStrings([
      ...elGarSpecChecks.map((c) => `${c.drawingId} p.${c.pageNum}`),
      ...pidVsGarDiffs.map((d) => d.rightJump?.drawingId || d.leftJump?.drawingId),
    ]),
    findingSummaryKo:
      garAnnotCount > 0
        ? `GAR 배치도 표기 누락/차이 ${garAnnotCount}건 (EL-100-GAR Cable Tag·Elevation 누락, P&ID↔GAR 디프 포함)`
        : '배치도 Tag · Cable No. · Elevation 표기 정합 완료',
    actionRequiredKo:
      garAnnotCount > 0
        ? 'EL-100-GAR의 Motor·JB·PB·GD/FD 심볼에 고유 Tag, Elevation, Cable No.를 일괄 추가하세요.'
        : '배치도 표기 검토 완료',
    responsibleGroup: 'EL-LAYOUT',
    sapTCode: 'QM02',
    targetTab: 'comments',
  });

  // --------------------------------------------------------------------------
  // STAGE 3: Electrical / C&I Diagram & Cable Review Gates
  // --------------------------------------------------------------------------
  const blockVsConnDiffs = crossLayerDiffs.filter((d) => d.scope === 'BLOCK_VS_CONNECTION');
  const dupOrTypoHits = ruleViolations.filter(
    (v) => v.ruleCode === 'RULE-02' || v.ruleCode === 'RULE-03'
  );
  const elBlockCount = blockVsConnDiffs.length + dupOrTypoHits.length;

  seeds.push({
    id: 'CHK-EL-01',
    code: 'CHK-EL-01',
    discipline: 'ELECTRICAL',
    titleKo: '전장 블록도 ↔ 결선표(Connection Sheet) 매핑 · 회로번호/태그 중복 정정',
    processStandardRef: 'DIA-0001/0002 / RULE-02/03',
    autoStatus: elBlockCount > 0 ? 'HOLD_BLOCKED' : 'COMPLETED',
    severity: elBlockCount > 0 ? 'CRITICAL' : 'INFO',
    affectedCount: elBlockCount,
    affectedTags: uniqueStrings([
      ...blockVsConnDiffs.map((d) => d.canonicalTag),
      ...dupOrTypoHits.map((h) => h.tagOrTarget),
    ]),
    evidenceDrawings: uniqueStrings([
      ...blockVsConnDiffs.map((d) => d.leftJump?.drawingId || d.rightJump?.drawingId),
      ...dupOrTypoHits.map((h) => h.drawingId),
    ]),
    findingSummaryKo:
      elBlockCount > 0
        ? `블록도↔결선표 차이 ${blockVsConnDiffs.length}건 · 태그/회로 중복·오기 ${dupOrTypoHits.length}건 (RL0113, RE0101, SDV-202A~D 순서 등)`
        : '블록도와 결선표 간 회로번호·릴레이·태그 매핑 일치',
    actionRequiredKo:
      elBlockCount > 0
        ? 'CC03 및 CV04N에서 블록도(E-01/R-09 등)와 Connection Sheet 순서·고유 회로번호를 일치시키세요.'
        : '블록도↔결선표 검토 완료',
    responsibleGroup: 'EL-CI-ENG',
    sapTCode: 'CC03',
    targetTab: 'diff',
  });

  const jbConflicts = evaluatedLoops.filter((l) =>
    l.discrepancies.some((d) => d.category === 'JB_NAMING_CONFLICT')
  );
  const edjbPinNotes = pinNotes.filter(
    (n) => n.status !== 'RESOLVED' && (n.tagRef.includes('JB') || n.content.includes('80P'))
  );
  const jbIssueCount = jbConflicts.length + edjbPinNotes.length;

  seeds.push({
    id: 'CHK-EL-02',
    code: 'CHK-EL-02',
    discipline: 'ELECTRICAL',
    titleKo: 'JB(ISJB/NISJB/EDJB/GDJB) 단자대 용량(80P↔40P) 및 명칭 충돌 검증',
    processStandardRef: 'JB Terminal Sizing / LRN-005',
    autoStatus: jbIssueCount > 0 ? 'OPEN_ISSUE' : 'COMPLETED',
    severity: jbIssueCount > 0 ? 'CRITICAL' : 'INFO',
    affectedCount: jbIssueCount,
    affectedTags: uniqueStrings([
      ...jbConflicts.map((l) => l.canonicalTag),
      ...edjbPinNotes.map((n) => n.tagRef),
    ]),
    evidenceDrawings: uniqueStrings([
      ...edjbPinNotes.map((n) => `${n.drawingId} p.${n.pageNum}`),
      ...jbConflicts.flatMap((l) => l.electricalPaths.map((p) => p.junctionBox)),
    ]),
    findingSummaryKo:
      jbIssueCount > 0
        ? `JB 단자대 수량 불일치 및 명칭 충돌 ${jbIssueCount}건 (200-EDJB-001 80P↔40P, NISJB/GDJB 표기 충돌)`
        : '모든 JB 단자대 용량 및 명칭 정합',
    actionRequiredKo:
      jbIssueCount > 0
        ? 'JB List와 Connection Sheet 간 Pole 수량(20% Spare 확보) 및 ISJB/NISJB 구분을 통일하세요.'
        : 'JB 단자대 검토 완료',
    responsibleGroup: 'EL-CI-ENG',
    sapTCode: 'VA03',
    targetTab: 'trace',
  });

  const elCableSpecFails = specReport.checks.filter(
    (c) => c.discipline === 'ELECTRICAL_CABLE' && c.status !== 'PASS'
  );
  const rule09Hits = ruleViolations.filter((v) => v.ruleCode === 'RULE-09');
  const cableSpecCount = elCableSpecFails.length + rule09Hits.length;

  seeds.push({
    id: 'CHK-EL-03',
    code: 'CHK-EL-03',
    discipline: 'ELECTRICAL',
    titleKo: '전력(6.6kV 6/10kV) · 제어 · 계장 케이블 정격 및 규격(JIS/IEC) 일치 검증',
    processStandardRef: 'IEC 60092-354 / SPEC-EL-001/002',
    autoStatus:
      elCableSpecFails.some((c) => c.status === 'HOLD_REQUIRED')
        ? 'HOLD_BLOCKED'
        : cableSpecCount > 0
          ? 'OPEN_ISSUE'
          : 'COMPLETED',
    severity: cableSpecCount > 0 ? 'CRITICAL' : 'INFO',
    affectedCount: cableSpecCount,
    affectedTags: uniqueStrings([
      ...elCableSpecFails.flatMap((c) => c.affectedTags),
      ...rule09Hits.map((h) => h.tagOrTarget),
    ]),
    evidenceDrawings: uniqueStrings([
      ...elCableSpecFails.map((c) => `${c.drawingId} p.${c.pageNum}`),
      ...rule09Hits.map((h) => h.drawingId),
    ]),
    findingSummaryKo:
      cableSpecCount > 0
        ? `케이블 스펙 부적합 ${elCableSpecFails.length}건 · 케이블 정보 누락 ${rule09Hits.length}건 (6/10kV CJPF/SC 등급, L-MPYCYS-27↔LFMTY10S 등)`
        : '고압 전력·제어·계장 케이블 정격 및 Legend 일치',
    actionRequiredKo:
      cableSpecCount > 0
        ? 'CL03 스펙 검토 및 Cable Legend(6/10kV 등급 및 JIS/IEC 심볼)를 수정하고 공인 SPEC을 첨부하세요.'
        : '케이블 규격 검토 완료',
    responsibleGroup: 'EL-POWER-CI',
    sapTCode: 'CL03',
    targetTab: 'spec',
  });

  const wdSpecCheck = specReport.checks.filter(
    (c) => c.specCode === 'SPEC-EL-003' && c.status !== 'PASS'
  );
  const wdPinNotes = pinNotes.filter(
    (n) =>
      n.status !== 'RESOLVED' &&
      (n.content.includes('W/D') || n.content.includes('블록 다이어그램'))
  );
  const wdMissingCount = wdSpecCheck.length + wdPinNotes.length;

  seeds.push({
    id: 'CHK-EL-04',
    code: 'CHK-EL-04',
    discipline: 'ELECTRICAL',
    titleKo: 'iCAMS / PSDS 결선도 앞단 블록 다이어그램(W/D) 시트 누락 보완',
    processStandardRef: 'DIA-0001/0002 W/D Coverage',
    autoStatus: wdMissingCount > 0 ? 'HOLD_BLOCKED' : 'COMPLETED',
    severity: wdMissingCount > 0 ? 'CRITICAL' : 'INFO',
    affectedCount: wdMissingCount,
    affectedTags: uniqueStrings([
      ...wdSpecCheck.flatMap((c) => c.affectedTags),
      ...wdPinNotes.map((n) => n.tagRef),
    ]),
    evidenceDrawings: uniqueStrings([
      ...wdSpecCheck.map((c) => `${c.drawingId} p.${c.pageNum}`),
      ...wdPinNotes.map((n) => `${n.drawingId} p.${n.pageNum}`),
    ]),
    findingSummaryKo:
      wdMissingCount > 0
        ? `300번대(DAJB/EAJB/EDJB) 및 MCC 연동 W/D 블록 다이어그램 시트 누락 ${wdMissingCount}건`
        : '전 결선표 대응 W/D 블록 다이어그램 시트 구비 완료',
    actionRequiredKo:
      wdMissingCount > 0
        ? 'DIA-0001 Sheet 16~22 및 DIA-0002 Sheet 18~22용 W/D 블록 다이어그램을 신규 추가하세요.'
        : 'W/D 시트 검토 완료',
    responsibleGroup: 'EL-CI-ENG',
    sapTCode: 'QM02',
    targetTab: 'comments',
  });

  const exSpecFails = specReport.checks.filter(
    (c) => c.discipline === 'INSTRUMENT_EX' && c.status !== 'PASS'
  );
  seeds.push({
    id: 'CHK-EL-05',
    code: 'CHK-EL-05',
    discipline: 'ELECTRICAL',
    titleKo: '본질안전(Ex ia) 배리어 중복(IS-AI-97) 및 방폭(IEC 60079) 정합 검증',
    processStandardRef: 'IEC 60079-11/14 / SPEC-EX',
    autoStatus:
      exSpecFails.some((c) => c.status === 'HOLD_REQUIRED')
        ? 'HOLD_BLOCKED'
        : exSpecFails.length > 0
          ? 'OPEN_ISSUE'
          : 'COMPLETED',
    severity: exSpecFails.length > 0 ? 'CRITICAL' : 'INFO',
    affectedCount: exSpecFails.length,
    affectedTags: uniqueStrings(exSpecFails.flatMap((c) => c.affectedTags)),
    evidenceDrawings: uniqueStrings(exSpecFails.map((c) => `${c.drawingId} p.${c.pageNum}`)),
    findingSummaryKo:
      exSpecFails.length > 0
        ? `방폭/IS 루프 스펙 부적합 ${exSpecFails.length}건 (IS-AI-97 배리어 중복, ZSC/ZSO 4선식 루프 등)`
        : '본질안전 배리어 및 방폭 등급 정합 완료',
    actionRequiredKo:
      exSpecFails.length > 0
        ? 'DIA-0001 Sheet 19/22 배리어 중복을 해소하고 ZCL99 Ex ia 계산기로 Co/Lo 여유를 확인하세요.'
        : '방폭/IS 검토 완료',
    responsibleGroup: 'INST-SAFETY',
    sapTCode: 'CL03',
    targetTab: 'spec',
  });

  // --------------------------------------------------------------------------
  // STAGE 4: Cross-Discipline Reconciliation, Maker Boundary & SAP Release Gate
  // --------------------------------------------------------------------------
  const openPinNotes = pinNotes.filter((n) => n.status !== 'RESOLVED');
  seeds.push({
    id: 'CHK-GATE-01',
    code: 'CHK-GATE-01',
    discipline: 'CROSS_GATE',
    titleKo: 'PDF 도면 좌표 핀 노트(OPEN / IN_REVIEW) 코멘트 종결 처리',
    processStandardRef: 'CV04N Markups / CRS',
    autoStatus: openPinNotes.length > 0 ? 'OPEN_ISSUE' : 'COMPLETED',
    severity:
      openPinNotes.length > 0
        ? highestSeverity(openPinNotes.map((n) => n.severity))
        : 'INFO',
    affectedCount: openPinNotes.length,
    affectedTags: uniqueStrings(openPinNotes.map((n) => n.tagRef)),
    evidenceDrawings: uniqueStrings(
      openPinNotes.map((n) => `${n.drawingId} p.${n.pageNum}`)
    ),
    findingSummaryKo:
      openPinNotes.length > 0
        ? `미해결 도면 핀 노트 ${openPinNotes.length}건 잔존 (전체 ${pinNotes.length}건 중)`
        : `도면 핀 노트 ${pinNotes.length}건 전량 해결(RESOLVED) 완료`,
    actionRequiredKo:
      openPinNotes.length > 0
        ? 'CV04N 분할 PDF 뷰어에서 미해결 핀을 순차 확인하고 수정 반영 후 RESOLVED로 전환하세요.'
        : '핀 노트 종결 완료',
    responsibleGroup: 'LEAD-CHECKER',
    sapTCode: 'CV04N',
    targetTab: 'pdf',
  });

  const makerSpecFails = specReport.checks.filter(
    (c) => c.discipline === 'MAKER_PACKAGE' && c.status !== 'PASS'
  );
  const makerHoldNotes = (analysisReport?.makerProfiles || []).flatMap((m) =>
    m.scopeNotes
      .filter((s) => s.owner === 'HOLD' || s.owner === 'UNSPECIFIED' as unknown as typeof s.owner)
      .map((s) => ({ drawingId: m.drawingId, pageNum: s.pageNum, text: s.text }))
  );
  const makerCount = makerSpecFails.length + makerHoldNotes.length;

  seeds.push({
    id: 'CHK-GATE-02',
    code: 'CHK-GATE-02',
    discipline: 'CROSS_GATE',
    titleKo: '메이커 패키지(300-V-001 및 업로드 벤더 도면) Battery Limit · HOLD 확정',
    processStandardRef: 'CS15 / Battery Limit 3-Way',
    autoStatus:
      makerSpecFails.some((c) => c.status === 'HOLD_REQUIRED')
        ? 'HOLD_BLOCKED'
        : makerCount > 0
          ? 'OPEN_ISSUE'
          : 'COMPLETED',
    severity: makerCount > 0 ? 'CRITICAL' : 'INFO',
    affectedCount: makerCount,
    affectedTags: uniqueStrings([
      ...makerSpecFails.flatMap((c) => c.affectedTags),
      ...(analysisReport?.makerProfiles || []).map((m) => m.vendorOrPackageHint),
    ]),
    evidenceDrawings: uniqueStrings([
      ...makerSpecFails.map((c) => `${c.drawingId} p.${c.pageNum}`),
      ...makerHoldNotes.map((h) => `${h.drawingId} p.${h.pageNum}`),
    ]),
    findingSummaryKo:
      makerCount > 0
        ? `메이커 경계/HOLD 미확정 ${makerCount}건 (300-DAJB/EAJB/EDJB TRUNK HOLD 및 Yard↔Maker 분계)`
        : '메이커 패키지 인터페이스 및 Scope Split 확정 완료',
    actionRequiredKo:
      makerCount > 0
        ? 'CS15 메이커 도면 분석에서 Vendor 케이블 사양·I/O 분계점을 확정하고 ME21N POS에 반영하세요.'
        : '메이커 경계 검토 완료',
    responsibleGroup: 'PKG-MAKER-ENG',
    sapTCode: 'CS15',
    targetTab: 'maker',
  });

  const aiFindings = (aiResult?.tracks || []).flatMap((t) =>
    (t.findings || []).map((f) => ({ ...f, trackTitle: t.trackName }))
  );
  const aiSerious = aiFindings.filter(
    (f) => f.severity === 'CRITICAL' || f.severity === 'WARNING'
  );
  const aiNotRunYet = !aiResult;

  seeds.push({
    id: 'CHK-GATE-03',
    code: 'CHK-GATE-03',
    discipline: 'CROSS_GATE',
    titleKo: '병렬 AI 정밀 감사(ZAI1) 실행 및 근거 기반 지적사항 검증',
    processStandardRef: 'ZAI1 / Citation Guardrail',
    autoStatus: aiNotRunYet
      ? 'OPEN_ISSUE'
      : aiSerious.length > 0
        ? 'OPEN_ISSUE'
        : 'COMPLETED',
    severity:
      aiSerious.some((f) => f.severity === 'CRITICAL')
        ? 'CRITICAL'
        : aiNotRunYet || aiSerious.length > 0
          ? 'WARNING'
          : 'INFO',
    affectedCount: aiNotRunYet ? 1 : aiSerious.length,
    affectedTags: uniqueStrings(
      aiNotRunYet ? ['AI 감사 미실행'] : aiSerious.map((f) => f.tag)
    ),
    evidenceDrawings: uniqueStrings(
      aiNotRunYet ? ['ZAI1 병렬감사'] : aiSerious.map((f) => f.sourceEvidence)
    ),
    findingSummaryKo: aiNotRunYet
      ? '병렬 AI 정밀 감사(ZAI1)가 아직 실행되지 않았습니다 (선택적 교차 검증 또는 수동 확인 필요)'
      : aiSerious.length > 0
        ? `AI 병렬 감사에서 CRITICAL/WARNING ${aiSerious.length}건 검출`
        : `AI 병렬 감사 완료 (${aiFindings.length}건 검토됨)`,
    actionRequiredKo: aiNotRunYet
      ? 'ZAI1에서 병렬 AI 정밀 감사를 실행해 도면 원문을 AI로 교차 점검하거나 수동으로 확인 체크하세요.'
      : aiSerious.length > 0
        ? 'ZAI1 검출 항목의 PDF 근거 영역을 CV04N 오버레이에서 확인 후 조치하세요.'
        : 'AI 교차 검증 완료',
    responsibleGroup: 'QA-AI-AUDIT',
    sapTCode: 'ZAI1',
    targetTab: 'ai',
  });

  // Dynamic per-uploaded-document / universal cross-match items when user scans/uploads PDFs
  if (analysisReport) {
    for (const profile of analysisReport.documentProfiles || []) {
      const docMatches = (analysisReport.universalMatches || []).filter(
        (m) =>
          (m.matchStatus === 'VARIANT_CONFLICT' ||
            m.matchStatus === 'UNRESOLVED_ATTENTION') &&
          (m.pidOrLayoutDrawings.includes(profile.drawingId) ||
            m.electricalOrCableDrawings.includes(profile.drawingId) ||
            m.makerDrawings.includes(profile.drawingId))
      );

      const docRuleHits = ruleViolations.filter(
        (v) => v.drawingId === profile.drawingId
      );
      const docIssueCount = docMatches.length + docRuleHits.length;

      const mappedDiscipline: ReviewDisciplineStage =
        profile.docClass === 'PID'
          ? 'PID'
          : profile.docClass === 'GAR_LAYOUT'
            ? 'GAR'
            : profile.docClass === 'ELECTRICAL_DIA' ||
                profile.docClass === 'CABLE_SCHEDULE'
              ? 'ELECTRICAL'
              : 'CROSS_GATE';

      const safeId = profile.drawingId.replace(/[^A-Za-z0-9_-]/g, '_');

      seeds.push({
        id: `CHK-DOC-${safeId}`,
        code: `CHK-DOC-${profile.drawingId.slice(0, 10)}`,
        discipline: mappedDiscipline,
        titleKo: `[실물 스캔] ${profile.displayName} (${profile.docClassLabelKo}) 교차·룰 정합 검증`,
        processStandardRef: `CV03N Vector/OCR (${profile.pageCount}p)`,
        autoStatus:
          docRuleHits.some((h) => h.severity === 'CRITICAL')
            ? 'HOLD_BLOCKED'
            : docIssueCount > 0
              ? 'OPEN_ISSUE'
              : 'COMPLETED',
        severity:
          docIssueCount > 0
            ? highestSeverity([
                ...docMatches.map((m) => m.severity),
                ...docRuleHits.map((h) => h.severity),
              ])
            : 'INFO',
        affectedCount: docIssueCount,
        affectedTags: uniqueStrings([
          ...docMatches.map((m) => m.displayTag),
          ...docRuleHits.map((h) => h.tagOrTarget),
        ]),
        evidenceDrawings: [
          `${profile.drawingId} (${profile.tagCount}태그·${profile.cableCount}케이블·${profile.equipmentCount}장비)`,
        ],
        findingSummaryKo:
          docIssueCount > 0
            ? `범용 교차 불일치 ${docMatches.length}건 · 룰 위반 ${docRuleHits.length}건 검출`
            : `추출 태그 ${profile.tagCount}건·케이블 ${profile.cableCount}건 도면 간 교차 검증 이상 없음`,
        actionRequiredKo:
          docIssueCount > 0
            ? 'CV03N 도면·OCR 분석 및 ZRL1에서 검출된 변형 충돌·미확정 항목을 확인하세요.'
            : '업로드 도면 스캔 검증 완료',
        responsibleGroup:
          mappedDiscipline === 'PID'
            ? 'PROCESS-PID'
            : mappedDiscipline === 'GAR'
              ? 'EL-LAYOUT'
              : mappedDiscipline === 'ELECTRICAL'
                ? 'EL-CI-ENG'
                : 'PKG-MAKER-ENG',
        sapTCode: 'CV03N',
        targetTab: 'drawing-ocr',
      });
    }
  }

  // Compute preliminary completion before final SAP Release Gate (CHK-GATE-04)
  const computeEffectiveCompleted = (seed: RawProcessCheckSeed): boolean => {
    if (Object.prototype.hasOwnProperty.call(manualSignOffs, seed.id)) {
      return Boolean(manualSignOffs[seed.id]);
    }
    return seed.autoStatus === 'COMPLETED';
  };

  const preGateIncomplete = seeds.filter((s) => !computeEffectiveCompleted(s));
  const preGateCriticalIncomplete = preGateIncomplete.filter(
    (s) => s.severity === 'CRITICAL' || s.autoStatus === 'HOLD_BLOCKED'
  );

  seeds.push({
    id: 'CHK-GATE-04',
    code: 'CHK-GATE-04',
    discipline: 'CROSS_GATE',
    titleKo: '최종 SAP FOR WORKING 출도 및 ME21N POS 발주 해제 게이트',
    processStandardRef: 'SAP Release Gate / ME21N',
    autoStatus:
      preGateCriticalIncomplete.length > 0
        ? 'HOLD_BLOCKED'
        : preGateIncomplete.length > 0
          ? 'OPEN_ISSUE'
          : 'COMPLETED',
    severity:
      preGateCriticalIncomplete.length > 0
        ? 'CRITICAL'
        : preGateIncomplete.length > 0
          ? 'WARNING'
          : 'INFO',
    affectedCount: preGateIncomplete.length,
    affectedTags: uniqueStrings(preGateIncomplete.map((s) => s.code)),
    evidenceDrawings: ['ME21N POS Release Gate', 'QM02 Comment Package'],
    findingSummaryKo:
      preGateIncomplete.length > 0
        ? `선행 미완료 검토 항목 ${preGateIncomplete.length}건 (CRITICAL/HOLD ${preGateCriticalIncomplete.length}건) 존재로 출도 보류`
        : '전 공종(P&ID·GAR·Electrical·메이커) 검토 완료 — FOR WORKING 출도 및 POS 발행 가능',
    actionRequiredKo:
      preGateIncomplete.length > 0
        ? '미완료 CRITICAL/HOLD 항목을 모두 종결하거나 SAP 미완료 보고서로 발행 후 재승인하세요.'
        : 'ME21N에서 최종 POS 사양서를 출력하세요.',
    responsibleGroup: 'PROJ-QA-GATE',
    sapTCode: 'ME21N',
    targetTab: 'pos',
  });

  const stageMetaMap = new Map(PROCESS_STAGES.map((st) => [st.discipline, st]));

  const items: ProcessChecklistItem[] = seeds.map((seed) => {
    const meta = stageMetaMap.get(seed.discipline)!;
    const hasManualOverride = Object.prototype.hasOwnProperty.call(manualSignOffs, seed.id);
    const effectiveCompleted = hasManualOverride
      ? Boolean(manualSignOffs[seed.id])
      : seed.autoStatus === 'COMPLETED';

    return {
      ...seed,
      stageOrder: meta.stageOrder,
      stageLabelKo: meta.labelKo,
      disciplineLabelKo: meta.shortLabelKo,
      effectiveCompleted,
      isManuallySignedOff: Boolean(manualSignOffs[seed.id]),
    };
  });

  const incompleteItems = items.filter((item) => !item.effectiveCompleted);
  const completedCount = items.length - incompleteItems.length;
  const completionRatePct =
    items.length > 0 ? Math.round((completedCount / items.length) * 100) : 100;

  const byStage: DisciplineStageSummary[] = PROCESS_STAGES.map((st) => {
    const stageItems = items.filter((i) => i.discipline === st.discipline);
    const stageCompleted = stageItems.filter((i) => i.effectiveCompleted).length;
    const stageIncomplete = stageItems.length - stageCompleted;
    const stageHold = stageItems.filter(
      (i) => !i.effectiveCompleted && i.autoStatus === 'HOLD_BLOCKED'
    ).length;

    return {
      discipline: st.discipline,
      stageOrder: st.stageOrder,
      labelKo: st.labelKo,
      shortLabelKo: st.shortLabelKo,
      total: stageItems.length,
      completed: stageCompleted,
      incomplete: stageIncomplete,
      holdBlocked: stageHold,
      completionPct:
        stageItems.length > 0
          ? Math.round((stageCompleted / stageItems.length) * 100)
          : 100,
    };
  });

  return {
    items,
    incompleteItems,
    summary: {
      total: items.length,
      completedCount,
      incompleteCount: incompleteItems.length,
      holdBlockedCount: incompleteItems.filter((i) => i.autoStatus === 'HOLD_BLOCKED').length,
      criticalIncompleteCount: incompleteItems.filter((i) => i.severity === 'CRITICAL').length,
      warningIncompleteCount: incompleteItems.filter((i) => i.severity === 'WARNING').length,
      infoIncompleteCount: incompleteItems.filter((i) => i.severity === 'INFO').length,
      completionRatePct,
      releaseGateReady: incompleteItems.length === 0,
      byStage,
    },
  };
}
