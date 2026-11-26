import {
  DrawingContentAnalysisReport,
  EvaluatedLoopMatch,
  LearnedEngineeringRule,
  SpecCheckItem,
  SpecDiscipline,
  SpecReviewReport,
} from '../types/diagram';
import { MissingCableActionRow } from './electricalCommentEngine';

export const SPEC_DISCIPLINE_LABELS: Record<SpecDiscipline, string> = {
  ELECTRICAL_CABLE: '전장·케이블 스펙',
  INSTRUMENT_EX: '계장·방폭(IS)·안전',
  MECHANICAL_PROCESS: '배관·기계·태그 스펙',
  MAKER_PACKAGE: '메이커 패키지·경계',
};

function findMatchingLearnedRuleIds(
  textToScan: string,
  learnedRules: LearnedEngineeringRule[]
): string[] {
  const matched: string[] = [];
  for (const lr of learnedRules) {
    if (!lr.enabled || !lr.patternOrCondition) continue;
    try {
      const re = new RegExp(lr.patternOrCondition, 'i');
      if (re.test(textToScan)) {
        matched.push(lr.code);
      }
    } catch {
      if (textToScan.toUpperCase().includes(lr.patternOrCondition.toUpperCase())) {
        matched.push(lr.code);
      }
    }
  }
  return matched;
}

/**
 * Pure engineering Specification Compliance Engine (CL03).
 * Evaluates H042 drawing package specs, missing cables, maker vendor interfaces,
 * uploaded dynamic drawing content, and learned knowledge rules.
 */
export function evaluateSpecCompliance(params: {
  evaluatedLoops: EvaluatedLoopMatch[];
  missingCableRows: MissingCableActionRow[];
  analysisReport?: DrawingContentAnalysisReport | null;
  learnedRules: LearnedEngineeringRule[];
}): SpecReviewReport {
  const { evaluatedLoops, missingCableRows, analysisReport, learnedRules } = params;

  const rawChecks: Omit<SpecCheckItem, 'matchedLearnedRuleIds'>[] = [];

  // 1. 6.6kV Motor Power Cable Insulation Grade (EL-000-DIA-0001)
  rawChecks.push({
    id: 'SPEC-EL-001',
    specCode: 'SPC-EL-6.6KV',
    discipline: 'ELECTRICAL_CABLE',
    disciplineLabelKo: SPEC_DISCIPLINE_LABELS.ELECTRICAL_CABLE,
    titleKo: '6.6kV 고압 모터 케이블 정격 등급 (6/10kV CJPF/SC)',
    standardRequired: 'IEC 60092-354 · 선박 6.6kV 계통 6/10kV 등급 난연·차폐 케이블(CJPF/SC)',
    observedDrawingState: 'EL-000-DIA-0001 도면 내 "6.6kV Motor Cable" 표기 및 Booster PB 문구 오타 잔존',
    status: 'NON_COMPLIANT',
    severity: 'CRITICAL',
    affectedTags: ['EL-000-DIA-0001', '200-P-101A~E', '6.6kV MCC'],
    evidenceRef: 'EL-000-DIA-0001 p.1',
    drawingId: 'CI-000-DIA-0001',
    pageNum: 42,
    recommendationKo: '케이블 스펙을 6/10kV 등급으로 정정하고 Booster PB 오타 수정 후 FOR WORKING 출도',
    posClauseSuggestion: '6.6kV 모터 인입 전원 케이블은 선급 공인 6/10kV CJPF/SC 난연·차폐 등급을 적용한다.',
  });

  // 2. Power W/D <-> C&I 30C Control Cable Interface
  rawChecks.push({
    id: 'SPEC-EL-002',
    specCode: 'SPC-EL-30C',
    discipline: 'ELECTRICAL_CABLE',
    disciplineLabelKo: SPEC_DISCIPLINE_LABELS.ELECTRICAL_CABLE,
    titleKo: 'Power SLD ↔ C&I W/D 30C 통합제어 케이블 인터페이스',
    standardRequired: '단선도(SLD)와 제어 결선도(DIA-0001/0002) 간 Multi-Core 30C 케이블 및 표준 기호 일치',
    observedDrawingState: 'DIA-0001 p.43~45 · DIA-0002 p.49~50 DIN 표기 혼재 및 앞단 W/D 누락',
    status: 'NON_COMPLIANT',
    severity: 'WARNING',
    affectedTags: ['200-PMSD-101D', '30C-CTRL', 'FR-E-100-MCC-003'],
    evidenceRef: 'DIA-0001 p.43 / DIA-0002 p.49',
    drawingId: 'CI-000-DIA-0002',
    pageNum: 49,
    recommendationKo: '30C 제어 케이블 인터페이스 및 DIN 심볼을 표준 규격으로 통일하고 앞단 W/D 추가',
    posClauseSuggestion: 'MCC ↔ PSDS/iCAMS 간 30C 제어 케이블 단자 배열은 IEC 표준 심볼 기준으로 단일화한다.',
  });

  // 3. Instrumentation Cable Spec Consistency (L-MPYCYS-27 vs LFMTY10S)
  rawChecks.push({
    id: 'SPEC-EL-003',
    specCode: 'SPC-CBL-SPEC',
    discipline: 'ELECTRICAL_CABLE',
    disciplineLabelKo: SPEC_DISCIPLINE_LABELS.ELECTRICAL_CABLE,
    titleKo: '계장 케이블 블록도 ↔ 결선표 형명 통일 및 Mark B/C 미할당 해소',
    standardRequired: '블록도와 결선표 케이블 규격(L-MPYCYS-27) 일치 및 전 루프 케이블 번호 100% 할당',
    observedDrawingState: `GAR Mark B/C·미할당 ${missingCableRows.filter((r) => r.issueType === 'CABLE_MISSING' || r.issueType === 'UNASSIGNED_HOLD').length}건 및 LFMTY10S 불일치 존재`,
    status: 'NON_COMPLIANT',
    severity: 'CRITICAL',
    affectedTags: ['100-SDV-254A', '100-SDV-202A', '100-TCV-252A', '100-UV-250A'],
    evidenceRef: 'DIA-0001 p.10 / DIA-0002 p.29',
    drawingId: 'CI-000-DIA-0002',
    pageNum: 29,
    recommendationKo: 'Mark B/C 루프에 정식 케이블 번호 부여 및 L-MPYCYS-27 형명으로 블록도-결선표 통일',
    posClauseSuggestion: '계장 케이블(IS/Non-IS)은 L-MPYCYS / TPYC 난연·개별차폐 선박용 케이블 규격으로 발주한다.',
  });

  // 4. EL-100-GAR Equipment Tag & Elevation Completeness
  rawChecks.push({
    id: 'SPEC-EL-004',
    specCode: 'SPC-EL-GAR',
    discipline: 'ELECTRICAL_CABLE',
    disciplineLabelKo: SPEC_DISCIPLINE_LABELS.ELECTRICAL_CABLE,
    titleKo: '전장 장비 배치도(EL-100-GAR) 고유 Tag · Cable No. · Elevation 표기',
    standardRequired: 'Motor, JB(ISJB/NISJB/GDJB), PB, Lighting, GD/FD 전체 Tag·Cable·Elevation 명시',
    observedDrawingState: 'EL-100-GAR-0001 배치도에 심볼만 표기되고 Tag·Cable No.·Elevation 전면 누락',
    status: 'NON_COMPLIANT',
    severity: 'CRITICAL',
    affectedTags: ['EL-100-GAR-0001', '100-ISJB-001', '100-NISJB-001'],
    evidenceRef: 'PD-100-GAR p.8 / PD-200-GAR p.6',
    drawingId: 'PD-100-GAR-0001',
    pageNum: 8,
    recommendationKo: '전장 배치도 전 장비에 고유 Tag, Cable No., 설치 Elevation 좌표 일괄 반영',
    posClauseSuggestion: '전장 기기/JB 납품 시 EL-GAR 기준 설치 Elevation 및 Cable Gland 방향 정보를 포함한다.',
  });

  // 5. 300-FCV-001 TYP.2 Solenoid & Fail-Close Limit Switch
  rawChecks.push({
    id: 'SPEC-INST-001',
    specCode: 'SPC-INST-TYP2',
    discipline: 'INSTRUMENT_EX',
    disciplineLabelKo: SPEC_DISCIPLINE_LABELS.INSTRUMENT_EX,
    titleKo: '300-FCV-001 (TYP.2) Solenoid Valve & Fail-Close LS 회로 완비',
    standardRequired: 'TYP.2 제어밸브 사양상 Positioner(AO/AI) + Solenoid(DO) + Fail-Close LS(DI) 완비',
    observedDrawingState: 'DIA-0001 Sheet 17/22(p.40)에 Solenoid 및 Fail-Close LS 케이블/채널 누락',
    status: 'NON_COMPLIANT',
    severity: 'CRITICAL',
    affectedTags: ['300-FCV-001', '300-FY-001', '300-FY-003'],
    evidenceRef: 'PR-300-PID p.1 / DIA-0001 p.40',
    drawingId: 'CI-000-DIA-0001',
    pageNum: 40,
    recommendationKo: '300-FY-001/003 대조 확정 후 TYP.2 Solenoid(DO) 및 Fail-Close LS(DI) 채널·케이블 추가',
    posClauseSuggestion: '300-FCV-001 (TYP.2) 발주 시 Fail-Close Solenoid(24VDC Ex ia/d) 및 Limit Switch를 일체형으로 공급한다.',
  });

  // 6. Intrinsic Safety Barrier & PSDS Relay Single-Allocation Rule
  rawChecks.push({
    id: 'SPEC-INST-002',
    specCode: 'SPC-EX-IS',
    discipline: 'INSTRUMENT_EX',
    disciplineLabelKo: SPEC_DISCIPLINE_LABELS.INSTRUMENT_EX,
    titleKo: '본질안전 배리어(IS-AI-97) 및 PSDS 릴레이(R76) 단일 할당 검증',
    standardRequired: 'IEC 60079-11 본질안전 루프당 1:1 독립 배리어·릴레이 할당 (중복 결선 금지)',
    observedDrawingState: 'DIA-0001 p.42 IS-AI-97 중복(300-PIT-611 ↔ 400-TIT-611) 및 DIA-0002 R76 3중 할당',
    status: 'NON_COMPLIANT',
    severity: 'CRITICAL',
    affectedTags: ['300-PIT-611A~C', '400-TIT-611A~C', '200-PMSD-101D', 'IS-AI-97'],
    evidenceRef: 'DIA-0001 p.42 / DIA-0002 p.46',
    drawingId: 'CI-000-DIA-0001',
    pageNum: 42,
    recommendationKo: 'IS-AI-97/98/99 및 R76 릴레이 채널 분리 할당 및 300-PIT-611A~C P&ID 원천 정정',
    posClauseSuggestion: '본질안전 배리어 및 안전 릴레이 판넬은 루프당 1:1 독립 채널 + 15% Spare 기준으로 제작한다.',
  });

  // 7. 300-SDV ZSO/ZSC 4-Wire Separation & W/D Sheet
  rawChecks.push({
    id: 'SPEC-INST-003',
    specCode: 'SPC-SDV-4W',
    discipline: 'INSTRUMENT_EX',
    disciplineLabelKo: SPEC_DISCIPLINE_LABELS.INSTRUMENT_EX,
    titleKo: '300-SDV-001~006 ZSO/ZSC 4선식 분리 및 모듈 300 W/D 블록도',
    standardRequired: 'ESD 밸브 Open/Close 리미트 스위치 4선식 개별 배선 및 시스템 W/D 블록도 작성',
    observedDrawingState: 'DIA-0002 p.43~48 모듈 300 W/D 시트 누락, ZSO 미분리 및 Vendor 케이블 사양 HOLD',
    status: 'HOLD_REQUIRED',
    severity: 'WARNING',
    affectedTags: ['300-SDV-001', '300-SDY-001', '300-EDJB-002', '300-EAJB-001'],
    evidenceRef: 'DIA-0002 p.44',
    drawingId: 'CI-000-DIA-0002',
    pageNum: 44,
    recommendationKo: '모듈 300 W/D 시트 신설, ZSO/ZSC 4선식 분리 표기 및 Vendor 케이블 HOLD 해제',
    posClauseSuggestion: '300-SDV-001~006 밸브 액추에이터 내 ZSO/ZSC 리미트 스위치는 4선식 분리 단자로 구성한다.',
  });

  // 8. Process / Piping Tag & Unit Prefix Standard (100/200/300/400)
  const matchedLoopsCount = evaluatedLoops.filter((l) => l.status === 'MATCHED').length;
  rawChecks.push({
    id: 'SPEC-MECH-001',
    specCode: 'SPC-PID-TAG',
    discipline: 'MECHANICAL_PROCESS',
    disciplineLabelKo: SPEC_DISCIPLINE_LABELS.MECHANICAL_PROCESS,
    titleKo: 'P&ID Rev.D ↔ GAR ↔ 전장 도면 유닛·장비 태그 정합성',
    standardRequired: '모듈 접두사(100/200/300/400) 일치 및 P&ID 최신 Rev. 기준 100% 동기화',
    observedDrawingState: `전체 ${evaluatedLoops.length}개 루프 중 ${matchedLoopsCount}건 정상 매칭, 110-P/E-201A/LCV-001 등 불일치 존재`,
    status: matchedLoopsCount === evaluatedLoops.length ? 'PASS' : 'NON_COMPLIANT',
    severity: 'WARNING',
    affectedTags: ['300-LCV-002', '200-P-101A~E', '100-E-202A'],
    evidenceRef: 'PR-300-PID p.1 / PD-200-GAR p.6',
    drawingId: 'PR-300-PID-0001',
    pageNum: 1,
    recommendationKo: 'GAR 110-P→200-P, E-201A→E-202A 및 DIA-0001 300-LCV-001→LCV-002 태그 일괄 정정',
    posClauseSuggestion: '납품 기기 및 밸브의 Tag No.는 최신 승인 P&ID(Rev.D) 기준으로 명판 각인한다.',
  });

  // 9. Recondenser 300-V-001 Line Spec & Operating Envelope (PASS baseline check)
  rawChecks.push({
    id: 'SPEC-MECH-002',
    specCode: 'SPC-300-LINE',
    discipline: 'MECHANICAL_PROCESS',
    disciplineLabelKo: SPEC_DISCIPLINE_LABELS.MECHANICAL_PROCESS,
    titleKo: 'Recondenser (300-V-001) 극저온 배관 스펙(ZEA-C80 / 1GA-N) 확인',
    standardRequired: 'LNG 라인 ZEA-C80(극저온 스테인리스) 및 NG Padding 라인 1GA-N 스펙 부합',
    observedDrawingState: 'PR-300-PID-0001 p.10/10 상 6"-300-LN-001-ZEA-C80, 2"-300-NG-001-1GA-N 정상 확인',
    status: 'PASS',
    severity: 'INFO',
    affectedTags: ['300-V-001', '6"-300-LN-001-ZEA-C80', '2"-300-NG-001-1GA-N'],
    evidenceRef: 'PR-300-PID p.1',
    drawingId: 'PR-300-PID-0001',
    pageNum: 1,
    recommendationKo: '극저온 밸브/계기 사양서(POS) 작성 시 ZEA-C80 배관 재질 및 설계 온도(-163°C) 기준 유지',
    posClauseSuggestion: 'Recondenser 인입 LNG 배관(ZEA-C80) 연계 밸브·계기는 -196°C~+65°C 극저온(Extended Bonnet) 사양으로 공급한다.',
  });

  // 10. Maker / Vendor Package Boundary (300-DAJB/EAJB/EDJB HOLD)
  rawChecks.push({
    id: 'SPEC-MKR-001',
    specCode: 'SPC-MKR-300JB',
    discipline: 'MAKER_PACKAGE',
    disciplineLabelKo: SPEC_DISCIPLINE_LABELS.MAKER_PACKAGE,
    titleKo: '모듈 300 Vendor JB (DAJB-001/002, EAJB-001, EDJB-002) 트렁크 및 단자 확정',
    standardRequired: 'BY VENDOR 공급 JB와 Yard 트렁크 케이블(Spec·Pair·Gland) 발주 전 100% 확정',
    observedDrawingState: 'DIA-0001 p.39~42 및 DIA-0002 p.43~48 상 Trunk Cable Spec HOLD 및 2선식 결선 미확정',
    status: 'HOLD_REQUIRED',
    severity: 'CRITICAL',
    affectedTags: ['300-DAJB-001', '300-DAJB-002', '300-EAJB-001', '300-EDJB-002'],
    evidenceRef: 'DIA-0001 p.39 / DIA-0002 p.43',
    drawingId: 'CI-000-DIA-0001',
    pageNum: 39,
    recommendationKo: 'Recondenser 패키지 Vendor로부터 JB 내부 Terminal List·케이블 Spec 승인본 수령 후 HOLD 해제',
    posClauseSuggestion: 'Vendor 공급 JB(DAJB/EAJB/EDJB)는 Ex e/ia 인증품으로 공급하며, Yard 트렁크 인입용 Spare Gland 20% 및 단자도를 제출한다.',
  });

  // 11. Dynamic Uploaded Drawing / Maker Profile Checks (from DrawingOcrAnalyzer live scan)
  if (analysisReport?.makerProfiles && analysisReport.makerProfiles.length > 0) {
    for (const mp of analysisReport.makerProfiles) {
      const holdCount = mp.scopeNotes.filter((n) => n.owner === 'HOLD').length;
      const isHold = holdCount > 0 || mp.interfacePoints.length === 0;
      rawChecks.push({
        id: `SPEC-MKR-DYN-${mp.drawingId}`,
        specCode: `SPC-VDR-${mp.drawingId.slice(0, 10).toUpperCase()}`,
        discipline: 'MAKER_PACKAGE',
        disciplineLabelKo: SPEC_DISCIPLINE_LABELS.MAKER_PACKAGE,
        titleKo: `업로드 메이커 도면 [${mp.vendorOrPackageHint || mp.displayName}] 사양·인터페이스 검토`,
        standardRequired: '전원/신호 규격 명시, Yard↔Maker 매핑 완료, HOLD 0건',
        observedDrawingState: `인터페이스 ${mp.interfacePoints.length}건 · Yard↔Maker 매핑 ${mp.yardToMakerMappings.length}건 · 전원(${mp.powerSpecs.join(', ') || '미검출'}) · HOLD ${holdCount}건`,
        status: isHold ? 'HOLD_REQUIRED' : 'PASS',
        severity: isHold ? 'CRITICAL' : 'INFO',
        affectedTags: [
          mp.displayName,
          ...mp.yardToMakerMappings.slice(0, 3).map((m) => m.yardTag),
        ],
        evidenceRef: `${mp.displayName} p.1`,
        drawingId: mp.drawingId,
        pageNum: 1,
        recommendationKo: isHold
          ? '메이커 도면 내 HOLD 표기 해소 및 Yard↔Maker 단자 인터페이스 확정 후 POS 발주'
          : '추출된 전원/신호 규격 및 인터페이스 포인트를 POS 구매사양서에 자동 수록',
        posClauseSuggestion: `${mp.vendorOrPackageHint || mp.displayName} 패키지는 전원(${mp.powerSpecs.join('/') || '도면기준'}) 및 신호(${mp.signalStandards.join('/') || '4-20mA/Dry Contact'}) 인터페이스 규격을 준수한다.`,
      });
    }
  }

  // Attach matching learned rule IDs to each spec check
  const checks: SpecCheckItem[] = rawChecks.map((item) => {
    const scanText = `${item.specCode} ${item.titleKo} ${item.observedDrawingState} ${item.affectedTags.join(' ')}`;
    return {
      ...item,
      matchedLearnedRuleIds: findMatchingLearnedRuleIds(scanText, learnedRules),
    };
  });

  const total = checks.length;
  const passed = checks.filter((c) => c.status === 'PASS').length;
  const nonCompliant = checks.filter((c) => c.status === 'NON_COMPLIANT').length;
  const holdRequired = checks.filter((c) => c.status === 'HOLD_REQUIRED').length;

  return {
    checks,
    summary: {
      total,
      passed,
      nonCompliant,
      holdRequired,
      complianceRatePct: total > 0 ? Math.round((passed / total) * 100) : 0,
    },
  };
}
