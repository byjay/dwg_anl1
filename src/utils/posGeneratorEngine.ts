import {
  DrawingContentAnalysisReport,
  EvaluatedLoopMatch,
  LearnedEngineeringRule,
  PosLineItem,
  PosPackageId,
  PosScopeSplitRow,
  PurchaseOrderSpecDoc,
  SpecCheckItem,
  SpecReviewReport,
} from '../types/diagram';

export interface PosPackageTemplateMeta {
  id: PosPackageId;
  titleKo: string;
  materialGroup: string;
  defaultVendor: string;
  targetModule: string;
  prPrefix: string;
}

export const POS_PACKAGE_TEMPLATES: PosPackageTemplateMeta[] = [
  {
    id: 'POS-300-PKG',
    titleKo: '모듈 300 Recondenser (300-V-001) 계장·밸브·Vendor JB 일괄 POS',
    materialGroup: 'EQ-300-RECOND',
    defaultVendor: 'Recondenser Skid Package Vendor (TBD)',
    targetModule: '300 (Recondenser)',
    prPrefix: 'PR-H042-3001',
  },
  {
    id: 'POS-VALVE-PKG',
    titleKo: 'SDV / FCV / LCV / UV 극저온 자동제어·긴급차단 밸브 패키지 POS',
    materialGroup: 'VL-100-300-EX',
    defaultVendor: 'Marine Cryogenic Valve Maker',
    targetModule: '100 · 200 · 300',
    prPrefix: 'PR-H042-2040',
  },
  {
    id: 'POS-EL-CABLE',
    titleKo: '방폭 전장·계장 케이블 (6/10kV Power · iCAMS · PSDS) 및 JB POS',
    materialGroup: 'EL-CBL-MAR-EX',
    defaultVendor: 'Marine Cable & Ex-JB Supplier',
    targetModule: '000 · 100 · 200 · 300',
    prPrefix: 'PR-H042-5010',
  },
  {
    id: 'POS-INST-TX',
    titleKo: '공정 계장 트랜스미터 · 가스감지기(GD) · 진동센서(VE) 일괄 POS',
    materialGroup: 'IN-TX-EXIA',
    defaultVendor: 'Process Instrumentation Supplier',
    targetModule: '100 · 200 · 300 · 400',
    prPrefix: 'PR-H042-4020',
  },
  {
    id: 'POS-UPLOADED-PKG',
    titleKo: '업로드 도면·메이커 분석 기반 맞춤형 발주사양서 (Dynamic POS)',
    materialGroup: 'DYN-MKR-PKG',
    defaultVendor: 'Uploaded Maker / Yard Package Vendor',
    targetModule: '업로드 도면 기준',
    prPrefix: 'PR-H042-9001',
  },
];

function findSpecStatusForTags(tags: string[], checks: SpecCheckItem[]): SpecCheckItem['status'] {
  const matched = checks.filter((c) =>
    c.affectedTags.some((t) => tags.some((tag) => t.toUpperCase().includes(tag.toUpperCase()) || tag.toUpperCase().includes(t.toUpperCase())))
  );
  if (matched.some((m) => m.status === 'HOLD_REQUIRED')) return 'HOLD_REQUIRED';
  if (matched.some((m) => m.status === 'NON_COMPLIANT')) return 'NON_COMPLIANT';
  return 'PASS';
}

function buildSeedLinesForPackage(
  packageId: PosPackageId,
  evaluatedLoops: EvaluatedLoopMatch[],
  specChecks: SpecCheckItem[],
  analysisReport?: DrawingContentAnalysisReport | null
): { lines: PosLineItem[]; scopeMatrix: PosScopeSplitRow[] } {
  if (packageId === 'POS-300-PKG') {
    const lines: PosLineItem[] = [
      {
        itemNo: '0010',
        materialCode: 'MAT-300-LCV002',
        tagRef: '300-LCV-002',
        description: 'NG Padding Gas Level/Pressure Control Valve (Positioner + Extended Bonnet)',
        qty: 1,
        unit: 'SET',
        technicalSpec: '2"-300-NG-001-1GA-N · 4-20mA HART · Ex ia IIC T4 · Tag LCV-002(List LCV-001 정정)',
        drawingRef: 'PR-300-PID p.1 / DIA-0001 p.39',
        specStatus: findSpecStatusForTags(['300-LCV-002'], specChecks),
        appliedRuleNote: 'LRN-006 (P&ID Rev.D 태그 각인)',
      },
      {
        itemNo: '0020',
        materialCode: 'MAT-300-FCV001',
        tagRef: '300-FCV-001',
        description: 'Recondenser LNG Inlet Flow Control Valve (TYP.2 Positioner + Solenoid + Fail-Close LS)',
        qty: 1,
        unit: 'SET',
        technicalSpec: '6"-300-LN-003-ZEA-C80 · -163°C 극저온 · AO/AI + 24VDC Solenoid(300-FY-001/003) + Fail-Close LS',
        drawingRef: 'PR-300-PID p.1 / DIA-0001 p.40',
        specStatus: findSpecStatusForTags(['300-FCV-001'], specChecks),
        appliedRuleNote: 'LRN-002 (TYP.2 Solenoid & LS 포함)',
      },
      {
        itemNo: '0030',
        materialCode: 'MAT-300-SDV001',
        tagRef: '300-SDV-001~006',
        description: 'Recondenser Emergency Shutdown Valves (Pneumatic Spring Return + 4-Wire ZSO/ZSC)',
        qty: 6,
        unit: 'SET',
        technicalSpec: '6"-300-LN-001-ZEA-C80 · Fail-Close · 24VDC SOV + ZSO/ZSC 4선식 분리 단자',
        drawingRef: 'PR-300-PID p.1 / DIA-0002 p.44',
        specStatus: findSpecStatusForTags(['300-SDV-001'], specChecks),
        appliedRuleNote: 'LRN-003 (ZSO/ZSC 4선식 분리)',
      },
      {
        itemNo: '0040',
        materialCode: 'MAT-300-PIT611',
        tagRef: '300-PIT-611A~C',
        description: 'Recondenser PSD-611 2oo3 Voting Pressure Transmitters (Cryogenic Impulse)',
        qty: 3,
        unit: 'EA',
        technicalSpec: '4-20mA HART · Ex ia IIC T4 · 독립 배리어(IS-AI-97 중복 해소 후 배정)',
        drawingRef: 'DIA-0002 p.46 / DIA-0001 p.42',
        specStatus: findSpecStatusForTags(['300-PIT-611A~C'], specChecks),
        appliedRuleNote: 'LRN-004 (배리어 1:1 독립 할당)',
      },
      {
        itemNo: '0050',
        materialCode: 'MAT-300-JB-PKG',
        tagRef: '300-DAJB-001/002 · EAJB-001 · EDJB-002',
        description: 'Recondenser Skid Ex-e/ia Field Junction Boxes (with 20% Spare Terminals/Glands)',
        qty: 4,
        unit: 'EA',
        technicalSpec: 'SUS316L IP66/67 · Ex e IIC T6 · Yard Trunk Cable Spec(BY VENDOR) 확정 전 HOLD',
        drawingRef: 'DIA-0001 p.39~42 / DIA-0002 p.43~48',
        specStatus: findSpecStatusForTags(['300-DAJB-001'], specChecks),
        appliedRuleNote: 'LRN-003 (Vendor JB HOLD 선결)',
      },
    ];

    const scopeMatrix: PosScopeSplitRow[] = [
      {
        area: '모듈 300 밸브/계기 (FCV/LCV/SDV/PIT/TIT)',
        yardScope: 'Yard ↔ Vendor JB 간 Trunk Cable 포설 및 iCAMS/PSDS Rack 결선',
        makerScope: 'Skid 내 밸브·계기·Solenoid·ZSO/ZSC 및 Vendor JB(DAJB/EAJB/EDJB) 내부 결선 완료',
        interfaceBoundary: 'Vendor JB 인입 Terminal Block & Cable Gland (Spec 확정 필요)',
      },
      {
        area: '문서 및 승인 도면 (W/D · Loop Diagram)',
        yardScope: 'iCAMS(DIA-0001) / PSDS(DIA-0002) W/D 시트 반영',
        makerScope: 'Skid I/O List, JB Wiring Diagram, TYP.2 Solenoid/LS Hook-up 제출',
        interfaceBoundary: 'PO 발행 후 14일 내 Vendor For-Approval 도면 제출',
      },
    ];
    return { lines, scopeMatrix };
  }

  if (packageId === 'POS-EL-CABLE') {
    const lines: PosLineItem[] = [
      {
        itemNo: '0010',
        materialCode: 'CBL-HV-610KV',
        tagRef: 'EL-000-DIA-0001 (6.6kV Motors)',
        description: '6/10kV Armoured Flame-Retardant Power Cable (CJPF/SC) for HP/Booster Pump Motors',
        qty: 420,
        unit: 'M',
        technicalSpec: '6/10kV (6.6kV 계통 정정 등급) · IEC 60092-354 · SHF2 · 편조 차폐(SC)',
        drawingRef: 'EL-000-DIA-0001 p.1',
        specStatus: findSpecStatusForTags(['EL-000-DIA-0001'], specChecks),
        appliedRuleNote: 'LRN-001 (6/10kV 등급 통일)',
      },
      {
        itemNo: '0020',
        materialCode: 'CBL-CI-30C',
        tagRef: 'Power W/D ↔ C&I 30C',
        description: 'Multi-Core Control Cable (30C x 1.5mm², MPYCYS / L-MPYCYS-27) for MCC-PSDS Interface',
        qty: 280,
        unit: 'M',
        technicalSpec: '150/250V · 30C Control · EXMAR MCC ↔ PSDS Cabinet 직결용',
        drawingRef: 'DIA-0001 p.43 / DIA-0002 p.49',
        specStatus: findSpecStatusForTags(['30C-CTRL'], specChecks),
        appliedRuleNote: 'LRN-005 (30C 규격 통일)',
      },
      {
        itemNo: '0030',
        materialCode: 'CBL-IS-PAIR',
        tagRef: '100-SDV-254A / 202A / TCV-252A / UV-250A',
        description: 'Intrinsic Safety & PSDS Instrumentation Pair Cable (TPYC / L-MPYCYS, Blue Jacket)',
        qty: 1250,
        unit: 'M',
        technicalSpec: '150/250V · 1P/2P x 1.5mm² · Ex ia 청색 시스 · GAR Mark B/C 미할당 물량 포함',
        drawingRef: 'PD-100-GAR p.5 / DIA-0002 p.29',
        specStatus: findSpecStatusForTags(['100-SDV-254A'], specChecks),
        appliedRuleNote: 'LRN-005 (Mark B/C 누락분 반영)',
      },
      {
        itemNo: '0040',
        materialCode: 'JB-EX-NISJB',
        tagRef: '100-NISJB-001 / 200-NISJB-001 / GDJB-001',
        description: 'Marine Ex-e Instrumentation & Gas Detector Field Junction Boxes (SUS316L)',
        qty: 6,
        unit: 'EA',
        technicalSpec: 'IP66/67 · Ex e IIC T6 · EL-100-GAR 고유 Tag 및 Elevation 도면 확정 반영',
        drawingRef: 'EL-100-GAR-0001 / DIA-0001 p.15',
        specStatus: findSpecStatusForTags(['100-NISJB-001'], specChecks),
        appliedRuleNote: 'LRN-006 (EL-GAR Tag/Elevation 명기)',
      },
    ];
    return {
      lines,
      scopeMatrix: [
        {
          area: '케이블 제작 및 드럼 공급',
          yardScope: '포설 길이 최종 마진(+15%) 확정 및 선내 트레이 포설',
          makerScope: '선급(KR/DNV/ABS) 승인 성적서 포함 난연·저독성 케이블 공급',
          interfaceBoundary: '조선소 자재창고 납품 및 드럼별 Tagging',
        },
      ],
    };
  }

  if (packageId === 'POS-VALVE-PKG') {
    const valveLoops = evaluatedLoops.filter(
      (l) =>
        l.pid.signalCategory === 'SHUTDOWN_VALVE' ||
        l.pid.signalCategory === 'CONTROL_VALVE' ||
        l.pid.signalCategory === 'ON_OFF_VALVE'
    );
    const lines: PosLineItem[] = valveLoops.slice(0, 8).map((l, idx) => ({
      itemNo: String((idx + 1) * 10).padStart(4, '0'),
      materialCode: `VLV-${l.unitCode}-${l.canonicalTag.replace(/[^A-Z0-9]/g, '')}`,
      tagRef: l.canonicalTag,
      description: `${l.serviceName} (${l.pid.signalCategory})`,
      qty: 1,
      unit: 'SET',
      technicalSpec: `${l.pid.pipeSpec || l.pid.lineNo || 'ZEA-C80'} · Cable ${l.primaryCableNo} · JB ${l.primaryJunctionBox}`,
      drawingRef: `P&ID ${l.pid.sheet} · ${l.primarySystem}`,
      specStatus: l.status === 'MATCHED' ? 'PASS' : l.status === 'CABLE_MISSING' ? 'HOLD_REQUIRED' : 'NON_COMPLIANT',
      appliedRuleNote: l.discrepancies[0]?.title || '표준 밸브 사양 부합',
    }));
    return {
      lines,
      scopeMatrix: [
        {
          area: '극저온 자동·긴급차단 밸브 일체',
          yardScope: '플랜지 볼팅, 계장 에어 튜브 및 Ex 케이블 글랜드 결선',
          makerScope: 'Valve Body + Actuator + Solenoid + Positioner + ZSO/ZSC(4-Wire) 조립·FAT 시험',
          interfaceBoundary: 'Actuator Control Junction Box Terminal',
        },
      ],
    };
  }

  if (packageId === 'POS-INST-TX') {
    const txLoops = evaluatedLoops.filter(
      (l) =>
        l.pid.signalCategory === 'ANALOG_TX' ||
        l.pid.signalCategory === 'GAS_DETECTOR' ||
        l.pid.signalCategory === 'VIBRATION'
    );
    const lines: PosLineItem[] = txLoops.slice(0, 8).map((l, idx) => ({
      itemNo: String((idx + 1) * 10).padStart(4, '0'),
      materialCode: `INST-${l.unitCode}-${l.canonicalTag.replace(/[^A-Z0-9]/g, '')}`,
      tagRef: l.canonicalTag,
      description: `${l.serviceName}`,
      qty: 1,
      unit: 'EA',
      technicalSpec: `Ex ia/d IIC T4 · 4-20mA HART / Gas / Vibration · JB ${l.primaryJunctionBox}`,
      drawingRef: `P&ID ${l.pid.sheet} · ${l.primarySystem}`,
      specStatus: l.status === 'MATCHED' ? 'PASS' : 'NON_COMPLIANT',
      appliedRuleNote: l.discrepancies[0]?.title || '단일 채널 기준 부합',
    }));
    return {
      lines,
      scopeMatrix: [
        {
          area: '트랜스미터·감지기·진동센서',
          yardScope: '현장 브라켓 취부 및 IS 배리어 경유 iCAMS/PSDS 결선',
          makerScope: '센서 본체, 교정성적서(Calibration Cert.), 선급 방폭인증서 납품',
          interfaceBoundary: '계기 케이블 인입 1/2" NPT 또는 M20 글랜드',
        },
      ],
    };
  }

  // POS-UPLOADED-PKG: generated dynamically from analysisReport equipment/cables/maker profiles
  const dynLines: PosLineItem[] = [];
  if (analysisReport?.equipmentRecords) {
    analysisReport.equipmentRecords.slice(0, 6).forEach((eq, idx) => {
      dynLines.push({
        itemNo: String((idx + 1) * 10).padStart(4, '0'),
        materialCode: `EQ-${eq.normalizedTag.replace(/[^A-Z0-9]/g, '')}`,
        tagRef: eq.tag,
        description: eq.description || `${eq.category} Equipment`,
        qty: 1,
        unit: 'SET',
        technicalSpec: eq.ratingSpec || '도면 추출 사양 확인 필요',
        drawingRef: `${eq.drawingId} p.${eq.pageNum}`,
        specStatus: eq.ratingSpec ? 'PASS' : 'HOLD_REQUIRED',
        appliedRuleNote: '도면·OCR 자동 추출 반영',
      });
    });
  }
  if (analysisReport?.cableRecords) {
    analysisReport.cableRecords.slice(0, 4).forEach((cbl, idx) => {
      dynLines.push({
        itemNo: String((dynLines.length + idx + 1) * 10).padStart(4, '0'),
        materialCode: `CBL-${cbl.normalizedCableNo.replace(/[^A-Z0-9]/g, '')}`,
        tagRef: cbl.cableNo,
        description: `Cable (${cbl.signalCategory}) ${cbl.fromEndpoint} → ${cbl.toEndpoint}`,
        qty: 100,
        unit: 'M',
        technicalSpec: cbl.cableSpec || '선박용 난연 케이블 규격 확정 필요',
        drawingRef: `${cbl.drawingId} p.${cbl.pageNum}`,
        specStatus: cbl.signalCategory === 'UNASSIGNED' ? 'HOLD_REQUIRED' : 'PASS',
        appliedRuleNote: '도면 케이블 추출',
      });
    });
  }
  if (dynLines.length === 0) {
    dynLines.push({
      itemNo: '0010',
      materialCode: 'DYN-PENDING-01',
      tagRef: 'UPLOAD-REQUIRED',
      description: '업로드된 도면·메이커 PDF 스캔 실행 시 장비/케이블 품목이 자동 생성됩니다.',
      qty: 1,
      unit: 'LOT',
      technicalSpec: 'CV03N (도면·OCR 분석)에서 외부 도면 전체 스캔 실행 필요',
      drawingRef: '미스캔',
      specStatus: 'HOLD_REQUIRED',
      appliedRuleNote: '스캔 후 자동 채움',
    });
  }
  const dynScope: PosScopeSplitRow[] =
    analysisReport?.makerProfiles && analysisReport.makerProfiles.length > 0
      ? analysisReport.makerProfiles.map((mp) => ({
          area: mp.vendorOrPackageHint || mp.displayName,
          yardScope: 'Yard ↔ Maker 경계 케이블 포설 및 시스템 결선',
          makerScope: `내부 패키지 공급 (${mp.interfacePoints.length} I/O, 전원: ${mp.powerSpecs.join(', ') || '도면참조'})`,
          interfaceBoundary: `매핑 태그 ${mp.yardToMakerMappings.length}건 · HOLD ${mp.scopeNotes.filter((n) => n.owner === 'HOLD').length}건`,
        }))
      : [
          {
            area: '업로드 도면 패키지',
            yardScope: '조선소 배관/전장 인터페이스 연결',
            makerScope: '벤더 도면 기준 장비 및 단자 공급',
            interfaceBoundary: '도면 스캔 완료 후 자동 산출',
          },
        ];
  return { lines: dynLines, scopeMatrix: dynScope };
}

/**
 * Pure Purchase Order Specification (POS) builder (SAP ME21N equivalent).
 * Synthesizes drawing analysis + maker profiles + spec review + active learned rules into a structured POS.
 */
export function buildPurchaseOrderSpec(params: {
  packageId: PosPackageId;
  evaluatedLoops: EvaluatedLoopMatch[];
  specReport: SpecReviewReport;
  learnedRules: LearnedEngineeringRule[];
  analysisReport?: DrawingContentAnalysisReport | null;
  customVendor?: string;
  customRevision?: string;
  extraLines?: PosLineItem[];
}): PurchaseOrderSpecDoc {
  const {
    packageId,
    evaluatedLoops,
    specReport,
    learnedRules,
    analysisReport,
    customVendor,
    customRevision,
    extraLines = [],
  } = params;

  const tpl =
    POS_PACKAGE_TEMPLATES.find((t) => t.id === packageId) || POS_PACKAGE_TEMPLATES[0];

  const { lines, scopeMatrix } = buildSeedLinesForPackage(
    packageId,
    evaluatedLoops,
    specReport.checks,
    analysisReport
  );
  const allLines = [...lines, ...extraLines];

  const enabledLearned = learnedRules.filter((lr) => lr.enabled);
  const learnedClauses = enabledLearned.map((lr) => ({
    ruleCode: lr.code,
    titleKo: lr.titleKo,
    clauseText: lr.posRequirementClause,
    origin: lr.tCodeOrigin,
  }));

  const relevantHolds = specReport.checks.filter((c) => {
    if (c.status === 'PASS') return false;
    if (packageId === 'POS-300-PKG') {
      return c.affectedTags.some((t) => t.includes('300-')) || c.discipline === 'MAKER_PACKAGE';
    }
    if (packageId === 'POS-EL-CABLE') {
      return c.discipline === 'ELECTRICAL_CABLE' || c.specCode === 'SPC-MKR-300JB';
    }
    if (packageId === 'POS-VALVE-PKG') {
      return c.affectedTags.some((t) => /SDV|FCV|LCV|UV/i.test(t));
    }
    if (packageId === 'POS-INST-TX') {
      return c.discipline === 'INSTRUMENT_EX';
    }
    return true;
  });

  const openHoldConditions = relevantHolds.map((c) => ({
    specCode: c.specCode,
    severity: c.severity,
    titleKo: c.titleKo,
    requiredAction: c.recommendationKo,
    evidenceRef: c.evidenceRef,
  }));

  const hasCriticalHold = openHoldConditions.some(
    (h) => h.severity === 'CRITICAL'
  );
  const readinessStatus = hasCriticalHold ? 'HOLD_PENDING' : 'RELEASE_READY';
  const readinessSummaryKo = hasCriticalHold
    ? `발주 전 선결 필요한 중대 스펙/도면 불일치 ${openHoldConditions.filter((h) => h.severity === 'CRITICAL').length}건이 있어 조건부(HOLD) 사양서로 생성되었습니다.`
    : '스펙 검증 및 학습된 엔지니어링 기준이 모두 반영되어 정식 발주(Release) 가능합니다.';

  const today = new Date().toISOString().slice(0, 10);

  return {
    posNo: `POS-${packageId.replace('POS-', '')}-H042`,
    packageId,
    packageTitleKo: tpl.titleKo,
    prNo: `${tpl.prPrefix}-01`,
    sapMaterialGroup: tpl.materialGroup,
    targetModule: tpl.targetModule,
    vendorName: customVendor?.trim() || tpl.defaultVendor,
    revision: customRevision?.trim() || 'Rev.0 (Draft for Engineering Release)',
    createdDate: today,
    readinessStatus,
    readinessSummaryKo,
    lineItems: allLines,
    scopeMatrix,
    learnedClauses,
    openHoldConditions,
    sourceStats: {
      loopsEvaluated: evaluatedLoops.length,
      makerProfilesCount: 1 + (analysisReport?.makerProfiles?.length ?? 0),
      specChecksTotal: specReport.checks.length,
      learnedRulesApplied: enabledLearned.length,
    },
  };
}

function esc(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function buildPosHtmlDocument(pos: PurchaseOrderSpecDoc): string {
  const lineRowsHtml = pos.lineItems
    .map(
      (item) => `
      <tr>
        <td class="mono">${esc(item.itemNo)}</td>
        <td class="mono">${esc(item.materialCode)}</td>
        <td class="mono bold">${esc(item.tagRef)}</td>
        <td>${esc(item.description)}</td>
        <td class="mono num">${item.qty} ${esc(item.unit)}</td>
        <td>${esc(item.technicalSpec)}</td>
        <td class="mono">${esc(item.drawingRef)}</td>
        <td class="status-${item.specStatus.toLowerCase()}">${esc(item.specStatus)}</td>
      </tr>`
    )
    .join('');

  const scopeRowsHtml = pos.scopeMatrix
    .map(
      (row) => `
      <tr>
        <td class="bold">${esc(row.area)}</td>
        <td>${esc(row.yardScope)}</td>
        <td>${esc(row.makerScope)}</td>
        <td>${esc(row.interfaceBoundary)}</td>
      </tr>`
    )
    .join('');

  const clausesHtml = pos.learnedClauses
    .map(
      (cl) => `
      <li>
        <strong>[${esc(cl.ruleCode)}] ${esc(cl.titleKo)}</strong> (${esc(cl.origin)}):
        ${esc(cl.clauseText)}
      </li>`
    )
    .join('');

  const holdsHtml =
    pos.openHoldConditions.length > 0
      ? pos.openHoldConditions
          .map(
            (h) => `
      <tr>
        <td class="mono">${esc(h.specCode)}</td>
        <td class="sev-${h.severity.toLowerCase()}">${esc(h.severity)}</td>
        <td>${esc(h.titleKo)}</td>
        <td>${esc(h.requiredAction)}</td>
        <td class="mono">${esc(h.evidenceRef)}</td>
      </tr>`
          )
          .join('')
      : `<tr><td colspan="5">발주 전 선결 HOLD 조건 없음 (Release Ready)</td></tr>`;

  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <title>${esc(pos.posNo)} - ${esc(pos.packageTitleKo)}</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; padding: 28px; font-family: 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif; color: #0f172a; background: #f1f5f9; }
    .doc { max-width: 1120px; margin: 0 auto; background: #fff; border: 1px solid #cbd5e1; padding: 28px 32px; }
    .top-bar { height: 8px; background: #103258; margin: -28px -32px 20px; }
    h1 { margin: 0 0 6px; font-size: 20px; color: #103258; }
    .meta { font-size: 12px; color: #475569; margin-bottom: 18px; }
    .kv-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; border: 1px solid #cbd5e1; padding: 12px; background: #f8fafc; font-size: 12px; margin-bottom: 18px; }
    h2 { font-size: 14px; color: #103258; border-bottom: 2px solid #006b8f; padding-bottom: 4px; margin: 22px 0 10px; }
    table { width: 100%; border-collapse: collapse; font-size: 11.5px; margin-bottom: 12px; }
    th, td { border: 1px solid #cbd5e1; padding: 6px 8px; text-align: left; vertical-align: top; }
    th { background: #f1f5f9; font-weight: 700; }
    .mono { font-family: Consolas, monospace; font-size: 11px; }
    .bold { font-weight: 700; }
    .num { text-align: right; white-space: nowrap; }
    .status-pass { color: #15803d; font-weight: 700; }
    .status-non_compliant, .sev-critical { color: #b91c1c; font-weight: 700; }
    .status-hold_required, .sev-warning { color: #b45309; font-weight: 700; }
    .clause-box { border: 1px solid #bae6fd; background: #f0f9ff; padding: 12px 18px; font-size: 12px; line-height: 1.6; }
    .clause-box ul { margin: 6px 0 0; padding-left: 18px; }
    @media print { body { background: #fff; padding: 0; } .doc { border: none; } }
  </style>
</head>
<body>
  <div class="doc">
    <div class="top-bar"></div>
    <h1>SAP 구매발주사양서 (POS) — ${esc(pos.packageTitleKo)}</h1>
    <div class="meta">문서번호: ${esc(pos.posNo)} · 구매요청(PR): ${esc(pos.prNo)} · 작성일: ${esc(pos.createdDate)} · 상태: ${esc(pos.readinessStatus)}</div>

    <div class="kv-grid">
      <div><strong>프로젝트 / 호선:</strong> H042 LNG 재기화·재응축</div>
      <div><strong>대상 모듈:</strong> ${esc(pos.targetModule)}</div>
      <div><strong>자재그룹 (SAP MatGrp):</strong> ${esc(pos.sapMaterialGroup)}</div>
      <div><strong>대상 벤더/메이커:</strong> ${esc(pos.vendorName)}</div>
      <div><strong>리비전:</strong> ${esc(pos.revision)}</div>
      <div><strong>적용 검증기준:</strong> 루프 ${pos.sourceStats.loopsEvaluated}건 · 스펙 ${pos.sourceStats.specChecksTotal}건 · 학습규칙 ${pos.sourceStats.learnedRulesApplied}건</div>
    </div>

    <h2>1. 발주 품목 및 기술 사양 (Bill of Materials & Specification)</h2>
    <table>
      <thead>
        <tr>
          <th>항목</th>
          <th>SAP 자재코드</th>
          <th>Tag No.</th>
          <th>품명 (Description)</th>
          <th>수량</th>
          <th>필수 기술 사양 (Spec & Rating)</th>
          <th>근거 도면</th>
          <th>스펙상태</th>
        </tr>
      </thead>
      <tbody>${lineRowsHtml}</tbody>
    </table>

    <h2>2. 공급 범위 경계 (Yard vs Maker Scope Split)</h2>
    <table>
      <thead>
        <tr>
          <th>구분 영역</th>
          <th>조선소(Yard) 범위</th>
          <th>메이커(Maker/Vendor) 범위</th>
          <th>인터페이스 경계 조건</th>
        </tr>
      </thead>
      <tbody>${scopeRowsHtml}</tbody>
    </table>

    <h2>3. 학습된 엔지니어링 지식 기반 필수 반영 조항 (Learned Knowledge Clauses)</h2>
    <div class="clause-box">
      <div>과거 도면·메이커·스펙 검증을 통해 학습된 규칙 ${pos.learnedClauses.length}건이 발주 필수 조항으로 자동 반영되었습니다.</div>
      <ul>${clausesHtml}</ul>
    </div>

    <h2>4. 발주 전 선결 필요 HOLD · 도면 보완 조건</h2>
    <table>
      <thead>
        <tr>
          <th>스펙코드</th>
          <th>심각도</th>
          <th>점검 항목</th>
          <th>선결 조치사항</th>
          <th>근거 페이지</th>
        </tr>
      </thead>
      <tbody>${holdsHtml}</tbody>
    </table>
  </div>
</body>
</html>`;
}
