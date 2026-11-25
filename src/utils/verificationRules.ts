import {
  DiscrepancySeverity,
  DrawingContentAnalysisReport,
  EvaluatedLoopMatch,
  ExtractedPdfEntity,
  RuleViolationHit,
  VerificationRule,
} from '../types/diagram';
import { resolveLoopPdfTargets } from './diffEngine';

export const DEFAULT_VERIFICATION_RULES: VerificationRule[] = [
  {
    id: 'RULE-01',
    code: 'RULE-01',
    nameKo: '유닛 코드 일관성 검사 (100/200/400)',
    category: 'UNIT_CODE_MISMATCH',
    descriptionKo:
      '루프의 소속 모듈(100/200)과 P&ID·GAR·DIA 내 태그, 펌프(110-P 오기), JB 번호의 유닛 접두사가 일치하는지 검증합니다.',
    checkScope: 'HYBRID',
    defaultSeverity: 'CRITICAL',
    enabled: true,
  },
  {
    id: 'RULE-02',
    code: 'RULE-02',
    nameKo: '계기·밸브 태그 오타 및 복사 오류 검출',
    category: 'TAG_TYPO',
    descriptionKo:
      'PDIT↔PEIT 오타, TI 131B/RV 113D 번호 중복, 블록도 복사 잔존 태그(200-LIT-101D, VE-101A)를 검출합니다.',
    checkScope: 'HYBRID',
    defaultSeverity: 'CRITICAL',
    enabled: true,
  },
  {
    id: 'RULE-03',
    code: 'RULE-03',
    nameKo: '블록도↔결선표 케이블·JB 상호 정합성',
    category: 'DUPLICATE_TAG_OR_RELAY',
    descriptionKo:
      '전장 블록도와 결선 테이블 간 케이블 번호(RC03208 vs RC0308), 릴레이/터미널, JB 명칭 불일치를 검사합니다.',
    checkScope: 'LOOP_CROSS_CHECK',
    defaultSeverity: 'WARNING',
    enabled: true,
  },
  {
    id: 'RULE-04',
    code: 'RULE-04',
    nameKo: '미할당·누락 케이블 (RC**** / NO.TBD / Mark B) 검사',
    category: 'CABLE_MISSING',
    descriptionKo:
      'GAR SEASTAR 마크업(B: 누락, C: RC**** 미할당) 및 도면 내 NO.TBD 표기를 검출합니다.',
    checkScope: 'HYBRID',
    defaultSeverity: 'CRITICAL',
    enabled: true,
  },
  {
    id: 'RULE-05',
    code: 'RULE-05',
    nameKo: 'P&ID 단독 미배선 (Unwired) 계기 검사',
    category: 'PID_ONLY_UNWIRED',
    descriptionKo:
      'P&ID에는 존재하지만 전장 결선도(iCAMS/PSDS)에 배선 경로가 없는 태그(예: PMSD-201)를 검출합니다.',
    checkScope: 'LOOP_CROSS_CHECK',
    defaultSeverity: 'WARNING',
    enabled: true,
  },
  {
    id: 'RULE-06',
    code: 'RULE-06',
    nameKo: '리비전 삭제·교체 태그 잔존 (Revision Drift) 검사',
    category: 'REVISION_DRIFT',
    descriptionKo:
      'P&ID 최신 리비전(Rev.C)에서 삭제된 태그가 전장 결선도(DIA)에 남아 있는지 검증합니다.',
    checkScope: 'LOOP_CROSS_CHECK',
    defaultSeverity: 'WARNING',
    enabled: true,
  },
  {
    id: 'RULE-07',
    code: 'RULE-07',
    nameKo: '도면 미확정 HOLD · XXX · TBD 표기 스캔',
    category: 'HOLD_AND_TBD',
    descriptionKo:
      'PDF 벡터 텍스트 및 OCR 추출 결과에서 HOLD, XXX, T.B.D 등 설계 미확정 마커를 전수 검출합니다.',
    checkScope: 'PDF_CONTENT_SCAN',
    defaultSeverity: 'WARNING',
    enabled: true,
  },
  {
    id: 'RULE-08',
    code: 'RULE-08',
    nameKo: '범용 다이어그램·메이커 도면 교차 매칭 & 인터페이스 검토',
    category: 'UNIVERSAL_DIAGRAM_MATCH',
    descriptionKo:
      '업로드된 외부 도면·메이커 도면을 포함해 도면 간 태그/장비 변형 충돌, 단독 미반영, Yard↔Maker 경계(BY YARD/TB)를 자동 검출합니다.',
    checkScope: 'PDF_CONTENT_SCAN',
    defaultSeverity: 'WARNING',
    enabled: true,
  },
  {
    id: 'RULE-09',
    code: 'RULE-09',
    nameKo: '케이블 규격(Spec)·시점/종단 정보 누락 검사',
    category: 'CABLE_INFO_AUDIT',
    descriptionKo:
      '추출된 케이블 정보에서 규격(mm²/TPYC 등) 누락, 시점/종단 미연결, 미할당 케이블을 검출합니다.',
    checkScope: 'PDF_CONTENT_SCAN',
    defaultSeverity: 'INFO',
    enabled: true,
  },
];

function mapDiscrepancyCategoryToRuleId(category: string): string {
  switch (category) {
    case 'UNIT_CODE_MISMATCH':
    case 'EQUIPMENT_TAG_MISMATCH':
      return 'RULE-01';
    case 'TAG_TYPO':
      return 'RULE-02';
    case 'DUPLICATE_TAG_OR_RELAY':
    case 'JB_NAMING_CONFLICT':
      return 'RULE-03';
    case 'CABLE_MISSING':
    case 'UNASSIGNED_CIRCUIT':
      return 'RULE-04';
    case 'PID_ONLY_UNWIRED':
      return 'RULE-05';
    case 'REVISION_DRIFT':
      return 'RULE-06';
    default:
      return 'RULE-02';
  }
}

function getSeverityOverride(
  rule: VerificationRule,
  _fallback: DiscrepancySeverity
): DiscrepancySeverity {
  return rule.defaultSeverity;
}

/**
 * Pure Rule Engine evaluator: checks enabled Engineering Rules across both
 * evaluated cross-discipline loops (MODEL) and extracted PDF/OCR entities (VECTOR_PDF / OCR).
 */
export function evaluateVerificationRules(params: {
  evaluatedLoops: EvaluatedLoopMatch[];
  extractedEntities: ExtractedPdfEntity[];
  rules: VerificationRule[];
  analysisReport?: DrawingContentAnalysisReport | null;
}): RuleViolationHit[] {
  const { evaluatedLoops, extractedEntities, rules, analysisReport } = params;
  const ruleMap = new Map<string, VerificationRule>();
  for (const r of rules) {
    if (r.enabled) ruleMap.set(r.id, r);
  }

  const hits: RuleViolationHit[] = [];

  // 1. Evaluate loop model discrepancies against enabled rules
  for (const loop of evaluatedLoops) {
    const targets = resolveLoopPdfTargets(loop);
    for (const disc of loop.discrepancies) {
      const ruleId = mapDiscrepancyCategoryToRuleId(disc.category);
      const rule = ruleMap.get(ruleId);
      if (!rule) continue;

      const primaryAffected = disc.affectedDrawings[0] || '';
      const isElec = primaryAffected.startsWith('CI-');
      const jump = isElec ? targets.right : targets.left;

      hits.push({
        id: `HIT-MODEL-${rule.code}-${loop.id}-${disc.id}`,
        ruleId: rule.id,
        ruleCode: rule.code,
        ruleNameKo: rule.nameKo,
        severity: getSeverityOverride(rule, disc.severity),
        tagOrTarget: loop.canonicalTag,
        drawingId: jump.drawingId,
        pageNum: jump.pageNum,
        evidence: `${disc.title} — ${disc.description}`,
        recommendation: disc.recommendedAction,
        source: 'MODEL',
      });
    }
  }

  // 2. Evaluate real extracted PDF Vector & OCR entities against content rules
  for (const ent of extractedEntities) {
    const src: 'VECTOR_PDF' | 'OCR' = ent.source === 'OCR' ? 'OCR' : 'VECTOR_PDF';

    // RULE-01: 110-P- equipment unit prefix error in HP Pump Skid
    const rule01 = ruleMap.get('RULE-01');
    if (rule01 && ent.normalized.startsWith('110-P-')) {
      hits.push({
        id: `HIT-ENT-${rule01.code}-${ent.id}`,
        ruleId: rule01.id,
        ruleCode: rule01.code,
        ruleNameKo: rule01.nameKo,
        severity: rule01.defaultSeverity,
        tagOrTarget: ent.text,
        drawingId: ent.drawingId,
        pageNum: ent.pageNum,
        xPct: ent.xPct,
        yPct: ent.yPct,
        evidence: `${ent.drawingId} p.${ent.pageNum} (${src})에서 유닛 번호 오기 "${ent.text}" 검출 (정규 표기: 200-${ent.normalized.slice(4)})`,
        recommendation: `${ent.text} 표기를 200-${ent.normalized.slice(4)}로 통일 수정`,
        source: src,
      });
    }

    // RULE-02: PEIT typo / TI 131B / RV 113D detected in PDF or OCR
    const rule02 = ruleMap.get('RULE-02');
    if (
      rule02 &&
      (ent.normalized.includes('PEIT-111E') ||
        ent.normalized === 'TI-131B' ||
        ent.normalized === 'RV-113D')
    ) {
      hits.push({
        id: `HIT-ENT-${rule02.code}-${ent.id}`,
        ruleId: rule02.id,
        ruleCode: rule02.code,
        ruleNameKo: rule02.nameKo,
        severity: rule02.defaultSeverity,
        tagOrTarget: ent.text,
        drawingId: ent.drawingId,
        pageNum: ent.pageNum,
        xPct: ent.xPct,
        yPct: ent.yPct,
        evidence: `${ent.drawingId} p.${ent.pageNum} (${src})에서 태그 오기 "${ent.text}" 실물 텍스트 검출`,
        recommendation: ent.normalized.includes('PEIT')
          ? '200-PEIT-111E를 200-PDIT-111E로 정정'
          : `${ent.text} 중복/오기 번호를 인접 호기 기준으로 정정`,
        source: src,
      });
    }

    // RULE-04: Masked / missing cables (RC****, NO.TBD)
    const rule04 = ruleMap.get('RULE-04');
    if (
      rule04 &&
      (ent.normalized.includes('RC****') ||
        ent.normalized.includes('HC****') ||
        ent.normalized.includes('NO.TBD') ||
        ent.normalized.includes('NO TBD'))
    ) {
      hits.push({
        id: `HIT-ENT-${rule04.code}-${ent.id}`,
        ruleId: rule04.id,
        ruleCode: rule04.code,
        ruleNameKo: rule04.nameKo,
        severity: rule04.defaultSeverity,
        tagOrTarget: ent.text,
        drawingId: ent.drawingId,
        pageNum: ent.pageNum,
        xPct: ent.xPct,
        yPct: ent.yPct,
        evidence: `${ent.drawingId} p.${ent.pageNum} (${src})에서 미할당 케이블 표기 "${ent.text}" 검출 (${ent.rawContext})`,
        recommendation: '케이블 리스트/결선도에서 공식 케이블 번호 확정 후 마크업 반영',
        source: src,
      });
    }

    // RULE-07: HOLD / XXX / T.B.D markers
    const rule07 = ruleMap.get('RULE-07');
    if (
      rule07 &&
      (ent.normalized.includes('HOLD') ||
        ent.normalized === 'XXX' ||
        ent.normalized.includes('T.B.D') ||
        ent.normalized === 'TBD')
    ) {
      hits.push({
        id: `HIT-ENT-${rule07.code}-${ent.id}`,
        ruleId: rule07.id,
        ruleCode: rule07.code,
        ruleNameKo: rule07.nameKo,
        severity: rule07.defaultSeverity,
        tagOrTarget: ent.text,
        drawingId: ent.drawingId,
        pageNum: ent.pageNum,
        xPct: ent.xPct,
        yPct: ent.yPct,
        evidence: `${ent.drawingId} p.${ent.pageNum} (${src})에서 미확정 표기 "${ent.text}" 검출 (문맥: ${ent.rawContext})`,
        recommendation: '관련 벤더/공정 데이터 확정 후 HOLD 및 XXX 표기 해제 필요',
        source: src,
      });
    }

    // Custom user-defined regex rules
    for (const rule of rules) {
      if (!rule.enabled || !rule.isCustom || !rule.customRegex) continue;
      try {
        const re = new RegExp(rule.customRegex, 'i');
        if (re.test(ent.text) || re.test(ent.rawContext)) {
          hits.push({
            id: `HIT-CUSTOM-${rule.code}-${ent.id}`,
            ruleId: rule.id,
            ruleCode: rule.code,
            ruleNameKo: rule.nameKo,
            severity: rule.defaultSeverity,
            tagOrTarget: ent.text,
            drawingId: ent.drawingId,
            pageNum: ent.pageNum,
            xPct: ent.xPct,
            yPct: ent.yPct,
            evidence: `사용자 룰(${rule.customRegex}) 일치 — ${ent.drawingId} p.${ent.pageNum} (${src}): "${ent.text}"`,
            recommendation: `사용자 정의 검증 룰 "${rule.nameKo}" 기준에 따라 도면 위치 확인`,
            source: src,
          });
        }
      } catch {
        // Ignore malformed user regex cleanly
      }
    }
  }

  // 3. Evaluate Universal Diagram Matching & Maker Interfaces (RULE-08)
  const rule08 = ruleMap.get('RULE-08');
  if (rule08 && analysisReport?.universalMatches) {
    for (const um of analysisReport.universalMatches) {
      if (
        um.matchStatus === 'VARIANT_CONFLICT' ||
        um.matchStatus === 'UNRESOLVED_ATTENTION' ||
        (um.matchStatus === 'SINGLE_DRAWING_ONLY' && (analysisReport.drawingsAnalyzed ?? 0) >= 2)
      ) {
        hits.push({
          id: `HIT-UM-${rule08.code}-${um.id}`,
          ruleId: rule08.id,
          ruleCode: rule08.code,
          ruleNameKo: rule08.nameKo,
          severity:
            um.matchStatus === 'VARIANT_CONFLICT'
              ? 'CRITICAL'
              : rule08.defaultSeverity,
          tagOrTarget: um.displayTag,
          drawingId: um.primaryJump.drawingId,
          pageNum: um.primaryJump.pageNum,
          xPct: um.primaryJump.xPct,
          yPct: um.primaryJump.yPct,
          evidence: `[${um.entityCategory}] ${um.summaryKo}`,
          recommendation:
            um.matchStatus === 'VARIANT_CONFLICT'
              ? `도면 간 표기 불일치(${um.variantsFound.join(' vs ')})를 기준 도면 기준으로 통일`
              : um.matchStatus === 'SINGLE_DRAWING_ONLY'
                ? `상대 도면(전장/배관/메이커)에 ${um.displayTag} 반영 누락 여부 확인`
                : '메이커 인터페이스 경계 및 미확정 항목 해소 필요',
          source: 'VECTOR_PDF',
        });
      }
    }
  }

  // 4. Evaluate Structured Cable Info & Spec completeness (RULE-09)
  const rule09 = ruleMap.get('RULE-09');
  if (rule09 && analysisReport?.cableRecords) {
    for (const cbl of analysisReport.cableRecords) {
      if (cbl.signalCategory === 'UNASSIGNED' || (cbl.fromEndpoint === '-' && cbl.toEndpoint === '-')) {
        hits.push({
          id: `HIT-CBL-${rule09.code}-${cbl.id}`,
          ruleId: rule09.id,
          ruleCode: rule09.code,
          ruleNameKo: rule09.nameKo,
          severity: cbl.signalCategory === 'UNASSIGNED' ? 'WARNING' : rule09.defaultSeverity,
          tagOrTarget: cbl.normalizedCableNo,
          drawingId: cbl.drawingId,
          pageNum: cbl.pageNum,
          xPct: cbl.xPct,
          yPct: cbl.yPct,
          evidence: `케이블 "${cbl.cableNo}" (${cbl.drawingId} p.${cbl.pageNum}): ${
            cbl.signalCategory === 'UNASSIGNED'
              ? '케이블 번호 미할당'
              : `시점/종단 정보 미검출 (규격: ${cbl.cableSpec})`
          }`,
          recommendation: '케이블 스케줄 또는 결선도에서 공식 케이블 번호·규격·From/To 종단 확인',
          source: cbl.source === 'OCR' ? 'OCR' : 'VECTOR_PDF',
        });
      }
    }
  }

  const sevRank: Record<DiscrepancySeverity, number> = {
    CRITICAL: 0,
    WARNING: 1,
    INFO: 2,
  };
  return hits.sort((a, b) => {
    if (sevRank[a.severity] !== sevRank[b.severity]) {
      return sevRank[a.severity] - sevRank[b.severity];
    }
    return a.ruleCode.localeCompare(b.ruleCode);
  });
}
