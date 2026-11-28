import {
  DrawingContentAnalysisReport,
  EvaluatedLoopMatch,
  ParallelAuditTrackResult,
} from '../types/diagram';

export type EngineeringUnit =
  | 'bar'
  | 'kPa'
  | 'MPa'
  | 'psi'
  | 'C'
  | 'F'
  | 'K'
  | 'kW'
  | 'HP'
  | 'DN'
  | 'NPS'
  | 'mm2'
  | 'AWG';

export interface UnitConversionResult {
  inputValue: number;
  fromUnit: EngineeringUnit;
  toUnit: EngineeringUnit;
  outputValue: number;
  siCanonicalValue: number;
  siCanonicalUnit: string;
  formulaNote: string;
}

const NPS_TO_DN: Record<number, number> = {
  0.5: 15,
  0.75: 20,
  1: 25,
  1.5: 40,
  2: 50,
  3: 80,
  4: 100,
  6: 150,
  8: 200,
  10: 250,
  12: 300,
  14: 350,
  16: 400,
  18: 450,
  20: 500,
  24: 600,
};

const AWG_TO_MM2: Record<number, number> = {
  18: 0.82,
  16: 1.31,
  14: 2.08,
  12: 3.31,
  10: 5.26,
  8: 8.37,
  6: 13.3,
  4: 21.2,
  2: 33.6,
};

/**
 * Directive #25: SI Unit Normalization & Cross-Standard Engineering Converter
 */
export function convertEngineeringUnit(
  value: number,
  fromUnit: EngineeringUnit,
  toUnit: EngineeringUnit
): UnitConversionResult {
  if (!Number.isFinite(value)) {
    throw new Error('유효한 숫자를 입력해 주세요.');
  }

  // Pressure -> canonical kPa
  const pressureToKpa: Partial<Record<EngineeringUnit, number>> = {
    kPa: 1,
    bar: 100,
    MPa: 1000,
    psi: 6.894757,
  };
  if (pressureToKpa[fromUnit] && pressureToKpa[toUnit]) {
    const kpa = value * pressureToKpa[fromUnit]!;
    const out = +(kpa / pressureToKpa[toUnit]!).toFixed(4);
    return {
      inputValue: value,
      fromUnit,
      toUnit,
      outputValue: out,
      siCanonicalValue: +kpa.toFixed(4),
      siCanonicalUnit: 'kPa',
      formulaNote: '1 bar = 100 kPa = 0.1 MPa = 14.5038 psi',
    };
  }

  // Temperature -> canonical K
  const tempUnits: EngineeringUnit[] = ['C', 'F', 'K'];
  if (tempUnits.includes(fromUnit) && tempUnits.includes(toUnit)) {
    const celsius =
      fromUnit === 'C'
        ? value
        : fromUnit === 'K'
          ? value - 273.15
          : (value - 32) * (5 / 9);
    const out =
      toUnit === 'C'
        ? celsius
        : toUnit === 'K'
          ? celsius + 273.15
          : celsius * (9 / 5) + 32;
    return {
      inputValue: value,
      fromUnit,
      toUnit,
      outputValue: +out.toFixed(3),
      siCanonicalValue: +(celsius + 273.15).toFixed(3),
      siCanonicalUnit: 'K',
      formulaNote: 'T(K) = T(°C) + 273.15, T(°F) = T(°C)×1.8 + 32',
    };
  }

  // Power -> canonical kW
  if ((fromUnit === 'kW' || fromUnit === 'HP') && (toUnit === 'kW' || toUnit === 'HP')) {
    const kw = fromUnit === 'kW' ? value : value * 0.74569987;
    const out = toUnit === 'kW' ? kw : kw / 0.74569987;
    return {
      inputValue: value,
      fromUnit,
      toUnit,
      outputValue: +out.toFixed(4),
      siCanonicalValue: +kw.toFixed(4),
      siCanonicalUnit: 'kW',
      formulaNote: '1 HP (mechanical) = 0.7457 kW',
    };
  }

  // Pipe Diameter DN <-> NPS
  if ((fromUnit === 'DN' || fromUnit === 'NPS') && (toUnit === 'DN' || toUnit === 'NPS')) {
    let dn = value;
    if (fromUnit === 'NPS') {
      dn = NPS_TO_DN[value] ?? Math.round(value * 25.4);
    }
    let out = dn;
    if (toUnit === 'NPS') {
      const entry = Object.entries(NPS_TO_DN).find(([, d]) => Math.abs(d - dn) <= 3);
      out = entry ? Number(entry[0]) : +(dn / 25.4).toFixed(2);
    }
    return {
      inputValue: value,
      fromUnit,
      toUnit,
      outputValue: out,
      siCanonicalValue: dn,
      siCanonicalUnit: 'DN (mm)',
      formulaNote: 'ASME B36.10 / ISO 6708 공칭경 매핑',
    };
  }

  // Conductor Cross-section mm2 <-> AWG
  if ((fromUnit === 'mm2' || fromUnit === 'AWG') && (toUnit === 'mm2' || toUnit === 'AWG')) {
    const mm2 =
      fromUnit === 'mm2'
        ? value
        : AWG_TO_MM2[Math.round(value)] ?? +(0.012668 * Math.pow(92, (36 - value) / 19.5)).toFixed(2);
    let out = mm2;
    if (toUnit === 'AWG') {
      let bestAwg = 16;
      let bestDiff = Infinity;
      for (const [awg, area] of Object.entries(AWG_TO_MM2)) {
        const diff = Math.abs(area - mm2);
        if (diff < bestDiff) {
          bestDiff = diff;
          bestAwg = Number(awg);
        }
      }
      out = bestAwg;
    }
    return {
      inputValue: value,
      fromUnit,
      toUnit,
      outputValue: +out.toFixed(2),
      siCanonicalValue: +mm2.toFixed(2),
      siCanonicalUnit: 'mm²',
      formulaNote: 'IEC 60228 mm² ↔ ASTM B258 AWG 근사 환산',
    };
  }

  throw new Error(`호환되지 않는 단위 변환입니다: ${fromUnit} → ${toUnit}`);
}

export interface ParsedLineNumber {
  raw: string;
  valid: boolean;
  sizeInch?: string;
  unitCode?: string;
  fluidCode?: string;
  sequenceNo?: string;
  pipeSpec?: string;
  insulationCode?: string;
  reason?: string;
}

/**
 * Directive #24 & #35: Configurable Piping Line Number Grammar Parser
 * Example: 6"-300-LN-003-ZEA-C80 or 18"-100-GW-254-1GA-H
 */
export function parseConfigurableLineNumber(
  lineNo: string,
  customPattern?: string
): ParsedLineNumber {
  const clean = lineNo.trim();
  const regex = customPattern
    ? new RegExp(customPattern, 'i')
    : /^(\d+(?:[./]\d+)?)["”']?-(\d{3})-([A-Z]{1,4})-(\d{2,4}[A-Z]?)-([A-Z0-9]{2,5})(?:-([A-Z0-9]{1,5}))?$/i;

  const m = clean.match(regex);
  if (!m) {
    return {
      raw: clean,
      valid: false,
      reason: '표준 라인 번호 문법(Size"-Unit-Fluid-Seq-Spec[-Insul])과 불일치',
    };
  }
  return {
    raw: clean,
    valid: true,
    sizeInch: m[1],
    unitCode: m[2],
    fluidCode: m[3]?.toUpperCase(),
    sequenceNo: m[4]?.toUpperCase(),
    pipeSpec: m[5]?.toUpperCase(),
    insulationCode: m[6]?.toUpperCase(),
  };
}

export interface B313PipeClassRating {
  pipeClass: string;
  ratingClass: '150#' | '300#' | '600#';
  material: string;
  minTempC: number;
  maxTempC: number;
  maxPressureBarAtDesign: number;
  corrosionAllowanceMm: number;
}

export const H042_PIPE_CLASS_TABLE: Record<string, B313PipeClassRating> = {
  '1GA': {
    pipeClass: '1GA',
    ratingClass: '150#',
    material: 'ASTM A312 TP316L (SS) / A106 Gr.B',
    minTempC: -46,
    maxTempC: 200,
    maxPressureBarAtDesign: 19.0,
    corrosionAllowanceMm: 1.5,
  },
  '3EA': {
    pipeClass: '3EA',
    ratingClass: '300#',
    material: 'ASTM A312 TP304L (Cryogenic)',
    minTempC: -196,
    maxTempC: 150,
    maxPressureBarAtDesign: 49.6,
    corrosionAllowanceMm: 0.0,
  },
  ZEA: {
    pipeClass: 'ZEA',
    ratingClass: '600#',
    material: 'ASTM A312 TP304L / 316L High-Pressure LNG',
    minTempC: -196,
    maxTempC: 120,
    maxPressureBarAtDesign: 99.3,
    corrosionAllowanceMm: 0.0,
  },
};

export interface B313CheckResult {
  pipeClass: string;
  compliant: boolean;
  rating?: B313PipeClassRating;
  utilizationPct: number;
  messages: string[];
}

/**
 * Directive #35: ASME B31.3 Piping Class Pressure-Temperature (P-T) Rating Check
 */
export function checkB313PressureTemp(
  pipeClass: string,
  designPressureBar: number,
  designTempC: number
): B313CheckResult {
  const key = pipeClass.trim().toUpperCase();
  const rating = H042_PIPE_CLASS_TABLE[key];
  if (!rating) {
    return {
      pipeClass: key,
      compliant: false,
      utilizationPct: 0,
      messages: [`PMS DB에 미등록된 배관 스펙 클래스(${key})입니다.`],
    };
  }

  const messages: string[] = [];
  let compliant = true;

  if (designPressureBar > rating.maxPressureBarAtDesign) {
    compliant = false;
    messages.push(
      `설계압력 ${designPressureBar} bar가 ${key}(${rating.ratingClass}) 허용한계 ${rating.maxPressureBarAtDesign} bar를 초과합니다.`
    );
  }
  if (designTempC < rating.minTempC || designTempC > rating.maxTempC) {
    compliant = false;
    messages.push(
      `설계온도 ${designTempC}°C가 ${key} 허용 온도범위(${rating.minTempC}°C ~ ${rating.maxTempC}°C)를 벗어납니다.`
    );
  }

  const utilizationPct = +((designPressureBar / rating.maxPressureBarAtDesign) * 100).toFixed(1);
  if (compliant) {
    messages.push(
      `ASME B31.3 ${rating.ratingClass} (${rating.material}) P-T 정격 적합 — 압력 여유율 ${(100 - utilizationPct).toFixed(1)}%`
    );
  }

  return {
    pipeClass: key,
    compliant,
    rating,
    utilizationPct,
    messages,
  };
}

export interface VoltageDropInput {
  systemVoltageV: number;
  phases: 1 | 3;
  loadPowerKw: number;
  powerFactor: number;
  cableLengthM: number;
  conductorAreaMm2: number;
  ratedAmpacityA: number;
  maxAllowedDropPct?: number;
  ambientTempC?: number;
}

export interface VoltageDropResult {
  loadCurrentA: number;
  voltageDropV: number;
  voltageDropPct: number;
  ampacityUtilizationPct: number;
  dropPass: boolean;
  ampacityPass: boolean;
  overallPass: boolean;
  limitPct: number;
  notes: string[];
}

/**
 * Directive #46 & #48: Marine Electrical Cable Sizing, Voltage Drop (IEC 61892-6 / IEC 60092-354)
 */
export function calculateCableVoltageDrop(input: VoltageDropInput): VoltageDropResult {
  const {
    systemVoltageV,
    phases,
    loadPowerKw,
    powerFactor,
    cableLengthM,
    conductorAreaMm2,
    ratedAmpacityA,
    maxAllowedDropPct = 5.0,
    ambientTempC = 45,
  } = input;

  if (systemVoltageV <= 0 || conductorAreaMm2 <= 0 || powerFactor <= 0 || powerFactor > 1) {
    throw new Error('전압, 도체 단면적, 역률(0<PF≤1) 입력값을 확인해 주세요.');
  }

  const pf = Math.max(0.1, Math.min(1, powerFactor));
  const sinPhi = Math.sqrt(Math.max(0, 1 - pf * pf));

  // Copper resistivity at 75°C operating temp (~0.0217 ohm·mm²/m), small reactance ~0.00008 ohm/m
  const rhoCopper = ambientTempC > 45 ? 0.0225 : 0.0217;
  const rPerMeter = rhoCopper / conductorAreaMm2;
  const xPerMeter = 0.00008;

  const loadCurrentA =
    phases === 3
      ? (loadPowerKw * 1000) / (Math.sqrt(3) * systemVoltageV * pf)
      : (loadPowerKw * 1000) / (systemVoltageV * pf);

  const factor = phases === 3 ? Math.sqrt(3) : 2;
  const voltageDropV =
    factor * loadCurrentA * cableLengthM * (rPerMeter * pf + xPerMeter * sinPhi);
  const voltageDropPct = (voltageDropV / systemVoltageV) * 100;

  // Ambient temp derating factor if > 45C
  const derate = ambientTempC > 45 ? 0.91 : 1.0;
  const effectiveAmpacity = ratedAmpacityA * derate;
  const ampacityUtilizationPct = (loadCurrentA / Math.max(1, effectiveAmpacity)) * 100;

  const dropPass = voltageDropPct <= maxAllowedDropPct;
  const ampacityPass = loadCurrentA <= effectiveAmpacity;
  const overallPass = dropPass && ampacityPass;

  const notes: string[] = [];
  if (!dropPass) {
    notes.push(
      `전압강하 ${voltageDropPct.toFixed(2)}% > 선급 허용 기준 ${maxAllowedDropPct.toFixed(1)}% (케이블 굵기 상향 필요)`
    );
  }
  if (!ampacityPass) {
    notes.push(
      `부하전류 ${loadCurrentA.toFixed(1)}A > 보정 허용전류 ${effectiveAmpacity.toFixed(1)}A (도체 과열 위험)`
    );
  }
  if (overallPass) {
    notes.push(
      `IEC 60092 기준 적합: ΔV=${voltageDropPct.toFixed(2)}% (≤${maxAllowedDropPct}%), 전류 부하율 ${ampacityUtilizationPct.toFixed(1)}%`
    );
  }

  return {
    loadCurrentA: +loadCurrentA.toFixed(2),
    voltageDropV: +voltageDropV.toFixed(2),
    voltageDropPct: +voltageDropPct.toFixed(2),
    ampacityUtilizationPct: +ampacityUtilizationPct.toFixed(1),
    dropPass,
    ampacityPass,
    overallPass,
    limitPct: maxAllowedDropPct,
    notes,
  };
}

export interface IsBarrierParams {
  uoV: number;
  ioMa: number;
  poW: number;
  coNf: number;
  loMh: number;
}

export interface IsFieldInstrumentParams {
  uiV: number;
  iiMa: number;
  piW: number;
  ciNf: number;
  liMh: number;
}

export interface IsCableParams {
  lengthM: number;
  ccNfPerM: number;
  lcMhPerM: number;
}

export interface IsLoopVerificationResult {
  compliant: boolean;
  checks: Array<{
    parameter: string;
    formula: string;
    barrierOrLimit: string;
    fieldTotal: string;
    pass: boolean;
  }>;
  totalCcNf: number;
  totalLcMh: number;
}

/**
 * Directive #52: IEC 60079-11 Intrinsic Safety (Ex ia / Ex ib) Entity Parameter Verification
 */
export function verifyIntrinsicSafetyLoop(
  barrier: IsBarrierParams,
  instrument: IsFieldInstrumentParams,
  cable: IsCableParams
): IsLoopVerificationResult {
  const totalCcNf = +(cable.lengthM * cable.ccNfPerM).toFixed(2);
  const totalLcMh = +(cable.lengthM * cable.lcMhPerM).toFixed(4);
  const combinedCNf = +(instrument.ciNf + totalCcNf).toFixed(2);
  const combinedLMh = +(instrument.liMh + totalLcMh).toFixed(4);

  const checks = [
    {
      parameter: '최대 출력 전압 (Voltage)',
      formula: 'Uo ≤ Ui',
      barrierOrLimit: `${barrier.uoV} V`,
      fieldTotal: `${instrument.uiV} V`,
      pass: barrier.uoV <= instrument.uiV,
    },
    {
      parameter: '최대 출력 전류 (Current)',
      formula: 'Io ≤ Ii',
      barrierOrLimit: `${barrier.ioMa} mA`,
      fieldTotal: `${instrument.iiMa} mA`,
      pass: barrier.ioMa <= instrument.iiMa,
    },
    {
      parameter: '최대 출력 전력 (Power)',
      formula: 'Po ≤ Pi',
      barrierOrLimit: `${barrier.poW} W`,
      fieldTotal: `${instrument.piW} W`,
      pass: barrier.poW <= instrument.piW,
    },
    {
      parameter: '총 정전용량 (Capacitance)',
      formula: 'Co ≥ Ci + Cc',
      barrierOrLimit: `${barrier.coNf} nF`,
      fieldTotal: `${combinedCNf} nF (Ci:${instrument.ciNf} + Cc:${totalCcNf})`,
      pass: barrier.coNf >= combinedCNf,
    },
    {
      parameter: '총 인덕턴스 (Inductance)',
      formula: 'Lo ≥ Li + Lc',
      barrierOrLimit: `${barrier.loMh} mH`,
      fieldTotal: `${combinedLMh} mH (Li:${instrument.liMh} + Lc:${totalLcMh})`,
      pass: barrier.loMh >= combinedLMh,
    },
  ];

  return {
    compliant: checks.every((c) => c.pass),
    checks,
    totalCcNf,
    totalLcMh,
  };
}

export interface CitationAuditSummary {
  totalFindings: number;
  groundedCount: number;
  ungroundedCount: number;
  groundingRatePct: number;
  ungroundedTags: string[];
}

/**
 * Directive #61: Spec & Drawing Citation Guardrail Verifier
 * Ensures every AI finding contains explicit sourceEvidence (drawing ID, sheet/page, or clause).
 */
export function verifyCitationGuardrail(
  tracks: ParallelAuditTrackResult[]
): CitationAuditSummary {
  let totalFindings = 0;
  let groundedCount = 0;
  const ungroundedTags: string[] = [];

  const citationPattern =
    /(PR-|PD-|CI-|EL-|DIA-|PID|GAR|PSDS|ICAMS|IEC|ASME|SHEET|P\.\d+|MARK|R-\d+|H-\d+)/i;

  for (const track of tracks) {
    for (const f of track.findings || []) {
      totalFindings += 1;
      const evidence = (f.sourceEvidence || '').trim();
      if (evidence.length >= 4 && citationPattern.test(evidence)) {
        groundedCount += 1;
      } else {
        ungroundedTags.push(f.tag || 'UNKNOWN');
      }
    }
  }

  return {
    totalFindings,
    groundedCount,
    ungroundedCount: totalFindings - groundedCount,
    groundingRatePct:
      totalFindings === 0 ? 100 : Math.round((groundedCount / totalFindings) * 100),
    ungroundedTags,
  };
}

/**
 * Directive #23: DEXPI 2.0.1 / CFIHOS Compatible Engineering Topology JSON Exporter
 */
export function exportDexpiSummaryJson(
  loops: EvaluatedLoopMatch[],
  analysisReport?: DrawingContentAnalysisReport | null
): string {
  const payload = {
    schema: 'DEXPI-2.0.1-CFIHOS-Bridge',
    exportedAt: new Date().toISOString(),
    project: 'H042 FGSS Marine Engineering',
    plantBreakdown: {
      units: ['100', '200', '300', '400'],
      documentsScanned: analysisReport?.drawingsAnalyzed ?? 7,
    },
    ProcessInstrumentationFunctions: loops.map((loop) => ({
      id: loop.id,
      TagName: loop.canonicalTag,
      UnitCode: loop.unitCode,
      Module: loop.moduleName,
      ServiceDescription: loop.serviceName,
      AssociatedEquipmentTag: loop.equipmentTag,
      PipingReference: {
        Drawing: `PR-${loop.unitCode === '300' ? '300' : loop.unitCode === '100' ? '100' : '200'}-PID-0001`,
        Sheet: loop.pid.sheet,
        LineNumber: loop.pid.lineNo || null,
        PipeSpec: loop.pid.pipeSpec || null,
      },
      ElectricalConnections: loop.electricalPaths.map((ep) => ({
        System: ep.system,
        ElectricalTag: ep.electricalTag,
        FieldCable: ep.fieldCableNo,
        FieldCableSpec: ep.fieldCableSpec,
        JunctionBox: ep.junctionBox,
        TrunkCable: ep.trunkCableNo,
        Cabinet: ep.rackRoomCabinet,
      })),
      VerificationStatus: loop.status,
      CompletenessScore: loop.completenessScore,
      DiscrepancyCount: loop.discrepancies.length,
    })),
  };
  return JSON.stringify(payload, null, 2);
}
