import {
  DiscrepancySeverity,
  DrawingContentAnalysisReport,
  LearnedEngineeringRule,
  LearnedRuleCategory,
  RuleViolationHit,
  SpecCheckItem,
  VerificationRule,
} from '../types/diagram';

const STORAGE_KEY = 'h042_sap_learned_rules_v1';

export const LEARNED_CATEGORY_LABELS: Record<LearnedRuleCategory, string> = {
  CABLE_SPEC: '케이블 규격·할당',
  TAG_NAMING: '태그·유닛 명명규칙',
  MAKER_SCOPE: '메이커 인터페이스·범위',
  SAFETY_EX: '방폭(IS)·안전(PSDS)',
  DRAWING_RULE: '도면 정합·배치 기준',
};

export const SEED_LEARNED_RULES: LearnedEngineeringRule[] = [
  {
    id: 'LRN-001',
    code: 'LRN-001',
    category: 'CABLE_SPEC',
    categoryLabelKo: LEARNED_CATEGORY_LABELS.CABLE_SPEC,
    titleKo: '6.6kV 고압 모터 케이블 6/10kV 등급 통일 기준',
    patternOrCondition: '6.6kV|6/10kV|CJPF|EL-000-DIA',
    learnedLessonKo:
      'H042-EL-000-DIA-0001 단선도 검토 결과 6.6kV 모터를 일반 6.6kV 표기가 아닌 선급 규격 6/10kV (CJPF/SC) 등급으로 발주·명기해야 하며 C&I 30C 케이블 인터페이스를 동시 확정해야 함.',
    posRequirementClause:
      '6.6kV 고압 모터 인입 케이블은 6/10kV 등급(CJPF/SC 난연·차폐 규격)으로 제작·공급하고, MCC 30C 제어 케이블 인터페이스를 C&I W/D와 일치시켜야 함.',
    severity: 'CRITICAL',
    tCodeOrigin: 'CL03 · EL-000-DIA',
    appliedCount: 4,
    enabled: true,
    source: 'SYSTEM_LEARNED',
    createdAt: '2026-11-20',
  },
  {
    id: 'LRN-002',
    code: 'LRN-002',
    category: 'MAKER_SCOPE',
    categoryLabelKo: LEARNED_CATEGORY_LABELS.MAKER_SCOPE,
    titleKo: 'TYP.2 제어밸브 Solenoid & Fail-Close LS 누락 방지',
    patternOrCondition: 'FCV-001|TYP\\.2|SOLENOID|FAIL-CLOSE|FY-003',
    learnedLessonKo:
      '300-FCV-001 (TYP.2) 검토에서 포지셔너 AO/AI만 도면에 반영되고 Solenoid Valve(DO) 및 Fail-Close Limit Switch(DI) 케이블이 누락됨. TYP.2 제어밸브 발주 시 Solenoid·LS I/O 포함 여부를 필수 검증함.',
    posRequirementClause:
      'TYP.2 공압 제어밸브(FCV/LCV)는 포지셔너(4~20mA HART) 외 Solenoid Valve(24VDC Ex ia/d) 및 Fail-Close Limit Switch(2-Wire/Dry Contact) 단자대와 케이블 글랜드를 패키지에 포함해 공급할 것.',
    severity: 'CRITICAL',
    tCodeOrigin: 'CS15 · PR-300-PID',
    appliedCount: 6,
    enabled: true,
    source: 'SYSTEM_LEARNED',
    createdAt: '2026-11-22',
  },
  {
    id: 'LRN-003',
    code: 'LRN-003',
    category: 'SAFETY_EX',
    categoryLabelKo: LEARNED_CATEGORY_LABELS.SAFETY_EX,
    titleKo: 'SDV/ESD 밸브 ZSO·ZSC 4선식 분리 및 W/D·Vendor HOLD 선결',
    patternOrCondition: 'SDV|ZSO|ZSC|EDJB|EAJB|DAJB|HOLD',
    learnedLessonKo:
      '모듈 300 SDV-001~006 및 200-SDV-101 검토에서 ZSO/ZSC 4선식 분리 누락과 Vendor JB(EAJB/EDJB/DAJB) 트렁크 케이블 HOLD가 반복 발생. POS 발행 전 Vendor JB 단자도·케이블 외경 확정 필수.',
    posRequirementClause:
      '모든 Shutdown Valve(SDV)는 Open(ZSO) 및 Close(ZSC) 리미트 스위치 회로를 4선식(개별 Pair)으로 분리 배선하며, Vendor JB(EAJB/EDJB/DAJB) 내부 결선도 및 글랜드 규격을 PO 발행 후 2주 내 확정 제출할 것.',
    severity: 'CRITICAL',
    tCodeOrigin: 'QM02 · DIA-0002',
    appliedCount: 8,
    enabled: true,
    source: 'SYSTEM_LEARNED',
    createdAt: '2026-11-23',
  },
  {
    id: 'LRN-004',
    code: 'LRN-004',
    category: 'SAFETY_EX',
    categoryLabelKo: LEARNED_CATEGORY_LABELS.SAFETY_EX,
    titleKo: '본질안전(IS) 배리어 채널 중복 할당 금지 (1 Loop = 1 Barrier)',
    patternOrCondition: 'IS-AI|IS-AO|BARRIER|611A|R76',
    learnedLessonKo:
      'DIA-0001 Sheet 19/22(IS-AI-97 중복) 및 DIA-0002 R76 릴레이 3중 할당 사례처럼 안전계장(PSDS)/IS 배리어 채널 중복 시 루프 간섭이 발생함.',
    posRequirementClause:
      'PSDS 릴레이 출력 및 본질안전 배리어(IS-AI/IS-AO)는 계기 루프당 독립 채널(1:1 할당)을 보장하며 Spare 15% 이상을 확보한 Marshalling Cabinet BOM을 제출할 것.',
    severity: 'CRITICAL',
    tCodeOrigin: 'ZRL1 · DIA-0001/0002',
    appliedCount: 5,
    enabled: true,
    source: 'SYSTEM_LEARNED',
    createdAt: '2026-11-23',
  },
  {
    id: 'LRN-005',
    code: 'LRN-005',
    category: 'CABLE_SPEC',
    categoryLabelKo: LEARNED_CATEGORY_LABELS.CABLE_SPEC,
    titleKo: 'SEASTAR Mark B/C 미할당(RC****) 및 W/D↔C/T 규격 통일',
    patternOrCondition: 'RC\\*\\*\\*\\*|L-MPYCYS|LFMTY10S|MARK B|MARK C',
    learnedLessonKo:
      'GAR 마크업상 케이블 누락(Mark B)과 RC**** 미할당(Mark C)이 방치되면 물량 산출(MTO)이 누락됨. 블록도(L-MPYCYS-27)와 결선표(LFMTY10S) 규격 상이 여부도 발주 전 일괄 통일 필요.',
    posRequirementClause:
      '계장·제어 케이블 발주 물량 산출 시 GAR Mark B/C 잔여 루프를 전수 포함하고, 블록도와 결선표 간 케이블 형명(L-MPYCYS-27 / MPYCYS / TPYC) 불일치 없는 단일 승인 규격으로 납품할 것.',
    severity: 'WARNING',
    tCodeOrigin: 'MD04 · GAR/DIA',
    appliedCount: 9,
    enabled: true,
    source: 'SYSTEM_LEARNED',
    createdAt: '2026-11-21',
  },
  {
    id: 'LRN-006',
    code: 'LRN-006',
    category: 'TAG_NAMING',
    categoryLabelKo: LEARNED_CATEGORY_LABELS.TAG_NAMING,
    titleKo: '모듈·유닛 접두사 일치 (100/200/300/400) 및 GAR Tag·EL 표기 의무',
    patternOrCondition: '110-P-|100-E-201|EL-100-GAR|LCV-001|LCV-002',
    learnedLessonKo:
      'GAR 도면의 110-P 오기(정정 200-P), 100-E-201A 오기(정정 100-E-202A), 모듈300 LCV-001/002 불일치, EL-100-GAR Tag/Elevation 누락이 반복 검출됨. P&ID 최신 Rev. 기준으로 태그/명판 각인 확정.',
    posRequirementClause:
      '모든 납품 장비·밸브·계기의 스테인리스 명판(Nameplate)은 최신 승인 P&ID(Rev.D 이상) 태그 번호와 100% 동일하게 각인하고, 전장 배치도(EL-GAR)용 Elevation·Cable Entry 정보를 함께 제공할 것.',
    severity: 'WARNING',
    tCodeOrigin: 'CV03N · PD/EL-GAR',
    appliedCount: 7,
    enabled: true,
    source: 'SYSTEM_LEARNED',
    createdAt: '2026-11-24',
  },
  {
    id: 'LRN-007',
    code: 'LRN-007',
    category: 'DRAWING_RULE',
    categoryLabelKo: LEARNED_CATEGORY_LABELS.DRAWING_RULE,
    titleKo: '다채널 패키지(진동센서/가스감지기) 복사 오류 및 고유 CIR.NO 검증',
    patternOrCondition: 'VE-101|GD-201|RE0101|CIR\\.NO|VJB',
    learnedLessonKo:
      '200-VE-101A~E 진동센서 5대 복사 오류 및 100/200/300-GD 케이블 RE0101 중복 사례를 반영해 동일 시리즈 다채널 기기 발주 시 채널·JB·회로번호 유일성을 사전 검증함.',
    posRequirementClause:
      'Multi-Channel 패키지(진동센서 VE, 가스감지기 GD) 공급 시 호기별 고유 Tag(A~E), 개별 J/B 번호 및 독립 회로번호(CIR.NO)를 Vendor Loop Diagram에 명시할 것.',
    severity: 'WARNING',
    tCodeOrigin: 'MD04 · DIA-0001/0002',
    appliedCount: 3,
    enabled: true,
    source: 'SYSTEM_LEARNED',
    createdAt: '2026-11-24',
  },
];

export function loadLearnedRules(): LearnedEngineeringRule[] {
  if (typeof window === 'undefined') return SEED_LEARNED_RULES;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return SEED_LEARNED_RULES;
    const parsed = JSON.parse(raw) as LearnedEngineeringRule[];
    if (!Array.isArray(parsed) || parsed.length === 0) return SEED_LEARNED_RULES;
    return parsed;
  } catch {
    return SEED_LEARNED_RULES;
  }
}

export function saveLearnedRules(rules: LearnedEngineeringRule[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(rules));
  } catch {
    // Ignore storage quota errors cleanly
  }
}

export function createLearnedRule(params: {
  category: LearnedRuleCategory;
  titleKo: string;
  patternOrCondition: string;
  learnedLessonKo: string;
  posRequirementClause: string;
  severity: DiscrepancySeverity;
  tCodeOrigin: string;
  existingCount: number;
}): LearnedEngineeringRule {
  const nextNum = String(params.existingCount + 1).padStart(3, '0');
  const code = `LRN-${nextNum}`;
  return {
    id: `${code}-${Date.now()}`,
    code,
    category: params.category,
    categoryLabelKo: LEARNED_CATEGORY_LABELS[params.category],
    titleKo: params.titleKo.trim(),
    patternOrCondition: params.patternOrCondition.trim() || 'CUSTOM',
    learnedLessonKo: params.learnedLessonKo.trim(),
    posRequirementClause: params.posRequirementClause.trim() || params.learnedLessonKo.trim(),
    severity: params.severity,
    tCodeOrigin: params.tCodeOrigin.trim() || 'ZP01 · USER',
    appliedCount: 1,
    enabled: true,
    source: 'USER_LEARNED',
    createdAt: new Date().toISOString().slice(0, 10),
  };
}

export function createLearnedRuleFromSpecCheck(
  check: SpecCheckItem,
  existingCount: number
): LearnedEngineeringRule {
  const catMap: Record<SpecCheckItem['discipline'], LearnedRuleCategory> = {
    ELECTRICAL_CABLE: 'CABLE_SPEC',
    INSTRUMENT_EX: 'SAFETY_EX',
    MECHANICAL_PROCESS: 'TAG_NAMING',
    MAKER_PACKAGE: 'MAKER_SCOPE',
  };
  return createLearnedRule({
    category: catMap[check.discipline],
    titleKo: `[스펙학습] ${check.titleKo}`,
    patternOrCondition: check.affectedTags.slice(0, 4).join('|') || check.specCode,
    learnedLessonKo: `${check.observedDrawingState} → 조치기준: ${check.recommendationKo}`,
    posRequirementClause: check.posClauseSuggestion,
    severity: check.severity,
    tCodeOrigin: `CL03 · ${check.specCode}`,
    existingCount,
  });
}

/**
 * Automatically distills new learned rules from newly uploaded drawings/maker profiles & rule violations,
 * deduplicating by title/pattern so repeated scans never create duplicates.
 */
export function learnRulesFromAnalysis(params: {
  existingRules: LearnedEngineeringRule[];
  analysisReport?: DrawingContentAnalysisReport | null;
  ruleViolations: RuleViolationHit[];
}): LearnedEngineeringRule[] {
  const { existingRules, analysisReport, ruleViolations } = params;
  const next = [...existingRules];
  const existingTitles = new Set(next.map((r) => r.titleKo.toLowerCase()));

  if (analysisReport?.makerProfiles) {
    for (const mp of analysisReport.makerProfiles) {
      if (mp.scopeNotes.some((n) => n.owner === 'HOLD')) {
        const title = `${mp.vendorOrPackageHint || mp.displayName} 메이커 HOLD 선결 기준`;
        if (!existingTitles.has(title.toLowerCase())) {
          existingTitles.add(title.toLowerCase());
          next.unshift(
            createLearnedRule({
              category: 'MAKER_SCOPE',
              titleKo: title,
              patternOrCondition: `${mp.vendorOrPackageHint || mp.displayName}|BY_MAKER|HOLD`,
              learnedLessonKo: `${mp.displayName} 분석에서 벤더 미확정(HOLD) 및 Yard↔Maker 경계(${mp.interfacePoints.length}개 포인트) 확인됨.`,
              posRequirementClause: `${mp.vendorOrPackageHint || mp.displayName} 패키지 발주 시 Yard↔Maker 단자 경계(${mp.interfacePoints.length} 포인트) 및 미확정 HOLD 항목을 선결 조건으로 명시할 것.`,
              severity: 'CRITICAL',
              tCodeOrigin: `CS15 · ${mp.drawingId}`,
              existingCount: next.length,
            })
          );
        }
      }
    }
  }

  // Capture recurring high-severity PDF/OCR rule hits
  const topCriticalHits = ruleViolations
    .filter((v) => v.severity === 'CRITICAL' && v.source !== 'MODEL')
    .slice(0, 3);
  for (const hit of topCriticalHits) {
    const title = `[자동학습] ${hit.tagOrTarget} (${hit.ruleCode}) 도면 재발 방지`;
    if (!existingTitles.has(title.toLowerCase())) {
      existingTitles.add(title.toLowerCase());
      next.unshift(
        createLearnedRule({
          category: 'DRAWING_RULE',
          titleKo: title,
          patternOrCondition: hit.tagOrTarget,
          learnedLessonKo: `${hit.evidence} → ${hit.recommendation}`,
          posRequirementClause: `${hit.tagOrTarget} 관련 발주/설계 시 "${hit.recommendation}" 기준을 사전 반영할 것.`,
          severity: hit.severity,
          tCodeOrigin: `ZRL1 · ${hit.ruleCode}`,
          existingCount: next.length,
        })
      );
    }
  }

  return next;
}

/**
 * Converts enabled USER_LEARNED rules into VerificationRules so learned knowledge actively drives ZRL1 checks.
 */
export function convertLearnedRulesToVerificationRules(
  learnedRules: LearnedEngineeringRule[]
): VerificationRule[] {
  return learnedRules
    .filter((lr) => lr.enabled && lr.source === 'USER_LEARNED' && lr.patternOrCondition.trim().length >= 2)
    .map((lr) => ({
      id: `RULE-${lr.id}`,
      code: lr.code,
      nameKo: `[학습] ${lr.titleKo}`,
      category: `LEARNED_${lr.category}`,
      descriptionKo: lr.learnedLessonKo,
      checkScope: 'PDF_CONTENT_SCAN',
      defaultSeverity: lr.severity,
      enabled: true,
      isCustom: true,
      customRegex: lr.patternOrCondition,
    }));
}
