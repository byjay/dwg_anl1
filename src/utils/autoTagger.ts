import { PidRecord, UnitCode } from '../types/diagram';
import { deriveExpectedElectricalTags, normalizeTag } from './diagramMatcher.ts';

export interface AutoTagSuggestion {
  unitCode: UnitCode;
  moduleName: string;
  pidDrawingNo: string;
  pidSheet: string;
  garDrawingNo: string;
  garSheet: string;
  electricalSystem: 'ICAMS' | 'PSDS' | 'ESD_MCC';
  electricalDrawingNo: string;
  blockSheet: string;
  connectionSheet: string;
  suggestedPidTag: string;
  suggestedElectricalTag: string;
  suggestedEquipmentTag: string;
  suggestedLinePrefix: string;
  suggestedCablePrefix: string;
  suggestedJunctionBox: string;
  suggestedSignalCategory: PidRecord['signalCategory'];
  confidence: 'HIGH' | 'MEDIUM' | 'BASE';
  matchedSignals: string[];
  rationale: string;
}

function detectTrainLetter(text: string): 'A' | 'B' | 'C' | 'D' | 'E' | null {
  const m =
    text.match(/\b(?:PUMP|VAPORIZER|HEATER|TRAIN|LINE)\s*[-#]?\s*([A-E])\b/i) ||
    text.match(/[-_ ]([A-E])호기/i) ||
    text.match(/\b([A-E])\b(?:\s*(?:SUCTION|DISCHARGE|INLET|OUTLET|POT|STRAINER|MIN))/i) ||
    text.match(/-(?:101|111|112|201|202|250|251|252|254|256)([A-E])\b/i);
  if (m) {
    return m[1].toUpperCase() as 'A' | 'B' | 'C' | 'D' | 'E';
  }
  return null;
}

/**
 * Suggests relevant P&ID, GAR, and Electrical (iCAMS / PSDS / ESD) drawing references,
 * sheet numbers, tags, junction boxes, and cable prefixes based on unitCode and serviceName.
 */
export function suggestLoopReferences(
  unitCode: UnitCode,
  serviceName: string,
  rawTagInput = ''
): AutoTagSuggestion {
  const text = `${serviceName} ${rawTagInput}`.trim();
  const upper = text.toUpperCase();
  const matchedSignals: string[] = [];

  const trainLetter = detectTrainLetter(text);
  const trainIndexMap: Record<string, number> = { A: 1, B: 2, C: 3, D: 4, E: 5 };
  const trainIdx = trainLetter ? trainIndexMap[trainLetter] : 1;

  // 1. Classify Signal Category & Electrical System
  const isShutdown =
    /\b(SDV|SDY|BDV|BDY|PSDS|ESD|SHUTDOWN|TRIP|EMERGENCY|RUPTURE|ZSO|ZSC|PMSD)\b/i.test(text) ||
    /긴급|차단|트립|파열/.test(text);
  const isVibration = /\b(VE-|VIB|VIBRATION)\b/i.test(text) || /진동/.test(text);
  const isGasDetector = /\b(GD-|GAS\s*DETECTOR)\b/i.test(text) || /가스\s*감지/.test(text);
  const isControlValve = /\b(FCV|TCV|HV|PCV|LCV|CONTROL\s*VALVE|POSITIONER|MIN\w*\s*FLOW)\b/i.test(text) || /조절\s*밸브/.test(text);
  const isOnOffValve = /\b(UV-|UY-|UZSO|ON\/?OFF|ISOLATION\s*VALVE)\b/i.test(text) || /격리\s*밸브/.test(text);
  const isLocalSwitch = /\b(HS-|XL-|XA-|LOCAL\s*SWITCH|START\/?STOP)\b/i.test(text) || /로컬\s*스위치/.test(text);

  let suggestedSignalCategory: PidRecord['signalCategory'] = 'ANALOG_TX';
  let electricalSystem: 'ICAMS' | 'PSDS' | 'ESD_MCC' = 'ICAMS';

  if (isGasDetector) {
    suggestedSignalCategory = 'GAS_DETECTOR';
    electricalSystem = 'ESD_MCC';
    matchedSignals.push('Gas Detector / ESD');
  } else if (isVibration) {
    suggestedSignalCategory = 'VIBRATION';
    electricalSystem = 'PSDS';
    matchedSignals.push('Vibration Monitoring (PSDS)');
  } else if (isShutdown) {
    suggestedSignalCategory = 'SHUTDOWN_VALVE';
    electricalSystem = 'PSDS';
    matchedSignals.push('Shutdown / ESD (PSDS)');
  } else if (isControlValve) {
    suggestedSignalCategory = 'CONTROL_VALVE';
    electricalSystem = 'ICAMS';
    matchedSignals.push('Modulating Control Valve (iCAMS)');
  } else if (isOnOffValve) {
    suggestedSignalCategory = 'ON_OFF_VALVE';
    electricalSystem = 'ICAMS';
    matchedSignals.push('On/Off Isolation Valve (iCAMS)');
  } else if (isLocalSwitch) {
    suggestedSignalCategory = 'LOCAL_SWITCH';
    electricalSystem = 'ESD_MCC';
    matchedSignals.push('Local MCC / Hand Switch');
  } else if (/\b(LEVEL|LIT|POT)\b/i.test(text) && unitCode === '200') {
    suggestedSignalCategory = 'ANALOG_TX';
    electricalSystem = 'PSDS';
    matchedSignals.push('HP Pump Pot Level Trip (PSDS)');
  } else if (/\b(PIT|TIT|FIT|PDIT|LIT|PRESSURE|TEMP|FLOW|LEVEL|압력|온도|유량|레벨)\b/i.test(text)) {
    suggestedSignalCategory = 'ANALOG_TX';
    electricalSystem = 'ICAMS';
    matchedSignals.push('Process Analog Transmitter (iCAMS)');
  }

  // Determine suggested P&ID Tag prefix if rawTagInput is empty
  let inferredPrefix = 'PIT';
  if (isGasDetector) inferredPrefix = 'GD';
  else if (isVibration) inferredPrefix = 'VE';
  else if (isShutdown) inferredPrefix = /\bBDV\b/i.test(text) ? 'BDV' : 'SDV';
  else if (isControlValve) {
    inferredPrefix = /\bTEMP|온도|TCV\b/i.test(text) ? 'TCV' : 'FCV';
  } else if (isOnOffValve) inferredPrefix = 'UV';
  else if (isLocalSwitch) inferredPrefix = 'HS';
  else if (/\b(PDIT|DIFF|차압|STRAINER)\b/i.test(text)) inferredPrefix = 'PDIT';
  else if (/\b(FLOW|유량|FIT)\b/i.test(text)) inferredPrefix = 'FIT';
  else if (/\b(TEMP|온도|TIT)\b/i.test(text)) inferredPrefix = 'TIT';
  else if (/\b(LEVEL|레벨|LIT)\b/i.test(text)) inferredPrefix = 'LIT';

  // 2. Unit-specific Drawing, Sheet, Equipment, Junction Box & Cable Prefix Resolution
  const letter = trainLetter || 'A';

  if (unitCode === '100') {
    const isGwHeater = /\b(HEATER|E-202)\b/i.test(text) || /히터/.test(text);
    const isGwPump = /\b(GW\s*PUMP|CIRC|P-201)\b/i.test(text) || /순환\s*펌프/.test(text);
    const isTankOrVent = /\b(TANK|VENT|T-201|VT-201)\b/i.test(text) || /팽창|벤트/.test(text);
    const isMainHeader = /\b(MAIN|COMMON|HEADER)\b/i.test(text) && !trainLetter;

    let pidSheet = `${9 + trainIdx}/17`;
    let garSheet = trainIdx <= 3 ? '03/07' : '04/07';
    let suggestedEquipmentTag = `100-E-201${letter}`;
    let suggestedLinePrefix = `8"-100-LN-10${trainIdx}-4EX-C75`;

    if (isGwHeater) {
      pidSheet = '16/17';
      garSheet = '06/07';
      suggestedEquipmentTag = `100-E-202${trainLetter || 'A'}`;
      suggestedLinePrefix = '10"-100-GW-301-1GA-C50';
      matchedSignals.push('GW Heater (100-E-202)');
    } else if (isGwPump) {
      pidSheet = '15/17';
      garSheet = '05/07';
      suggestedEquipmentTag = `100-P-201${trainLetter || 'A'}`;
      suggestedLinePrefix = '8"-100-GW-201-1GA-C50';
      matchedSignals.push('GW Circ. Pump (100-P-201)');
    } else if (isTankOrVent) {
      pidSheet = '17/17';
      garSheet = '07/07';
      suggestedEquipmentTag = /VENT|VT/i.test(text) ? '100-VT-201' : '100-T-201';
      suggestedLinePrefix = '4"-100-NT-401-1GA-N';
      matchedSignals.push('GW Tank / Vent Mast');
    } else if (isMainHeader) {
      pidSheet = '10/17';
      garSheet = '03/07';
      matchedSignals.push('Regastainer Main Header');
    } else if (trainLetter) {
      matchedSignals.push(`LNG Vaporizer ${trainLetter} (100-E-201${trainLetter})`);
    }

    const numBase = inferredPrefix === 'SDV' ? '202' : inferredPrefix === 'FCV' || inferredPrefix === 'TCV' ? '252' : '201';
    const suggestedPidTag = rawTagInput.trim()
      ? rawTagInput.trim().toUpperCase()
      : `${inferredPrefix}-${numBase}${letter}`;

    const isNonIsValve =
      suggestedSignalCategory === 'SHUTDOWN_VALVE' || suggestedSignalCategory === 'ON_OFF_VALVE';

    let electricalDrawingNo = 'H042-CI-000-DIA-0001';
    let blockSheet = `R-0${Math.min(7, trainIdx)}`;
    let connectionSheet = `${Math.min(7, trainIdx)}/22`;
    let suggestedCablePrefix = `RC0${Math.min(7, trainIdx)}01`;
    let suggestedJunctionBox = isNonIsValve ? '100-NISJB-001' : `100-ISJB-00${trainIdx}`;

    if (electricalSystem === 'PSDS') {
      electricalDrawingNo = 'H042-CI-000-DIA-0002';
      blockSheet = isNonIsValve ? `R-0${4 + Math.min(6, trainIdx)}` : `R-0${Math.min(4, trainIdx)}`;
      connectionSheet = isNonIsValve ? `${4 + Math.min(6, trainIdx)}/23` : `${Math.min(4, trainIdx)}/23`;
      suggestedCablePrefix = `RS0${isNonIsValve ? 4 + Math.min(5, trainIdx) : trainIdx}01`;
      suggestedJunctionBox = isNonIsValve ? '100-NISJB-001' : `100-ISJB-00${trainIdx}`;
    } else if (electricalSystem === 'ESD_MCC') {
      electricalDrawingNo = isGasDetector ? 'H042-CI-000-DIA-0001' : 'H042-CI-000-DIA-0002';
      blockSheet = isGasDetector ? 'E-01' : 'R-10';
      connectionSheet = isGasDetector ? '13/22' : '20/23';
      suggestedCablePrefix = isGasDetector ? 'RE0101' : 'FR-E-100-MCC-001';
      suggestedJunctionBox = isGasDetector ? '100-GDJB-001' : 'EXMAR MCC';
    }

    const expectedElecTags = deriveExpectedElectricalTags(suggestedPidTag, unitCode);
    const confidence =
      matchedSignals.length >= 2 ? 'HIGH' : matchedSignals.length === 1 ? 'MEDIUM' : 'BASE';

    return {
      unitCode,
      moduleName: 'Regastainer Module',
      pidDrawingNo: 'H042-PR-100-PID-0001',
      pidSheet,
      garDrawingNo: 'H042-PD-100-GAR-0001',
      garSheet,
      electricalSystem,
      electricalDrawingNo,
      blockSheet,
      connectionSheet,
      suggestedPidTag,
      suggestedElectricalTag: expectedElecTags.join(' / '),
      suggestedEquipmentTag,
      suggestedLinePrefix,
      suggestedCablePrefix,
      suggestedJunctionBox,
      suggestedSignalCategory,
      confidence,
      matchedSignals,
      rationale: `유닛 100(Regastainer) 및 키워드 [${matchedSignals.join(', ') || '기본 계통'}] 분석 결과 ${electricalSystem} (${electricalDrawingNo} ${blockSheet} / ${connectionSheet}) 참조를 추천합니다.`,
    };
  }

  if (unitCode === '200') {
    const isMainHeader = /\b(COMMON|HEADER|MAIN|101)\b/i.test(text) && !trainLetter;
    const isDischarge = /\b(DISCHARGE|토출)\b/i.test(text);
    const pidSheet = isMainHeader ? '10/15' : `${10 + trainIdx}/15`;
    const garSheet = isMainHeader ? '03/07' : trainIdx <= 2 ? '04/07' : trainIdx <= 4 ? '05/07' : '06/07';
    const suggestedEquipmentTag = `200-P-101${letter}`;
    const suggestedLinePrefix = isMainHeader
      ? '10"-200-LN-100-4EX-C75'
      : isDischarge
        ? `4"-200-LN-12${trainIdx}-4EX-C75`
        : `6"-200-LN-11${trainIdx}-4EX-C75`;

    if (trainLetter) {
      matchedSignals.push(`LNG Booster Pump ${trainLetter} (200-P-101${trainLetter})`);
    } else if (isMainHeader) {
      matchedSignals.push('HP Pump Common Header');
    }

    const seqNum = isMainHeader
      ? '101'
      : inferredPrefix === 'SDV'
        ? isDischarge
          ? '112'
          : '111'
        : inferredPrefix === 'LIT'
          ? '101'
          : '111';

    const suggestedPidTag = rawTagInput.trim()
      ? rawTagInput.trim().toUpperCase()
      : `${inferredPrefix}-${seqNum}${isMainHeader ? '' : letter}`;

    const isNonIsValve =
      suggestedSignalCategory === 'SHUTDOWN_VALVE' || suggestedSignalCategory === 'ON_OFF_VALVE';

    let electricalDrawingNo = 'H042-CI-000-DIA-0001';
    let blockSheet = `H-0${trainIdx}`;
    let connectionSheet = `${7 + trainIdx}/22`;
    let suggestedCablePrefix = `HC0${trainIdx}01`;
    let suggestedJunctionBox = `200-ISJB-00${trainIdx}`;

    if (electricalSystem === 'PSDS') {
      electricalDrawingNo = 'H042-CI-000-DIA-0002';
      if (isVibration) {
        blockSheet = 'H-09';
        connectionSheet = '23/23';
        suggestedCablePrefix = `HV010${trainIdx * 2 - 1}`;
        suggestedJunctionBox = '200-VJB-101';
      } else if (isNonIsValve) {
        const nisIdx = trainIdx <= 2 ? 1 : trainIdx <= 4 ? 2 : 3;
        blockSheet = `H-0${5 + nisIdx}`;
        connectionSheet = `${14 + nisIdx}/23`;
        suggestedCablePrefix = `HS0${5 + nisIdx}01`;
        suggestedJunctionBox = `200-NISJB-00${nisIdx}`;
      } else {
        blockSheet = `H-0${trainIdx}`;
        connectionSheet = `${9 + trainIdx}/23`;
        suggestedCablePrefix = `HS0${trainIdx}01`;
        suggestedJunctionBox = `200-ISJB-00${trainIdx}`;
      }
    } else if (electricalSystem === 'ESD_MCC') {
      electricalDrawingNo = isGasDetector ? 'H042-CI-000-DIA-0001' : 'H042-CI-000-DIA-0002';
      blockSheet = isGasDetector ? 'E-02' : 'H-08';
      connectionSheet = isGasDetector ? '14/22' : '22/23';
      suggestedCablePrefix = isGasDetector ? 'HE0101' : 'FR-E-100-MCC-003';
      suggestedJunctionBox = isGasDetector ? '200-GDJB-001' : 'EXMAR MCC';
    }

    const expectedElecTags = deriveExpectedElectricalTags(suggestedPidTag, unitCode);
    const confidence =
      matchedSignals.length >= 2 ? 'HIGH' : matchedSignals.length === 1 ? 'MEDIUM' : 'BASE';

    return {
      unitCode,
      moduleName: 'HP Pump Skid Module',
      pidDrawingNo: 'H042-PR-200-PID-0001',
      pidSheet,
      garDrawingNo: 'H042-PD-200-GAR-0001',
      garSheet,
      electricalSystem,
      electricalDrawingNo,
      blockSheet,
      connectionSheet,
      suggestedPidTag,
      suggestedElectricalTag: expectedElecTags.join(' / '),
      suggestedEquipmentTag,
      suggestedLinePrefix,
      suggestedCablePrefix,
      suggestedJunctionBox,
      suggestedSignalCategory,
      confidence,
      matchedSignals,
      rationale: `유닛 200(HP Pump Skid) 및 키워드 [${matchedSignals.join(', ') || '기본 계통'}] 기준 P&ID Sheet ${pidSheet}, ${electricalSystem}(${blockSheet} / ${connectionSheet}) 및 JB ${suggestedJunctionBox}를 추천합니다.`,
    };
  }

  // Unit 300 (Recondenser) or 400 (Utility) or 000 (Common)
  const isUtility = unitCode === '400';
  const suggestedPidTag = rawTagInput.trim()
    ? rawTagInput.trim().toUpperCase()
    : isUtility
      ? `${inferredPrefix}-613A`
      : `${inferredPrefix}-301A`;

  const electricalDrawingNo =
    electricalSystem === 'PSDS' ? 'H042-CI-000-DIA-0002' : 'H042-CI-000-DIA-0001';

  return {
    unitCode,
    moduleName: isUtility ? 'Utility Interface' : 'Recondenser Module',
    pidDrawingNo: isUtility ? '400-UTIL-PID (External Ref)' : '300-RECOND-PID (Vendor Ref)',
    pidSheet: 'External Ref',
    garDrawingNo: isUtility ? 'H042-PD-100-GAR-0001' : 'Vendor Skid GAR',
    garSheet: '03/07',
    electricalSystem,
    electricalDrawingNo,
    blockSheet: isUtility ? 'R-01' : 'R-07',
    connectionSheet: isUtility
      ? electricalSystem === 'PSDS'
        ? '1/23'
        : '1/22'
      : electricalSystem === 'PSDS'
        ? '19/23'
        : '18/22',
    suggestedPidTag,
    suggestedElectricalTag: deriveExpectedElectricalTags(suggestedPidTag, unitCode).join(' / '),
    suggestedEquipmentTag: isUtility ? '400-UTIL-SYS' : '300-RECOND-01',
    suggestedLinePrefix: isUtility ? `4"-400-NT-601-1GA-N` : `6"-300-LN-301-4EX-C75`,
    suggestedCablePrefix: isUtility ? (electricalSystem === 'PSDS' ? 'RS0110' : 'RC0110') : 'FR-I-300-01',
    suggestedJunctionBox: isUtility ? '100-ISJB-001' : '300-VENDOR-JB',
    suggestedSignalCategory,
    confidence: matchedSignals.length > 0 ? 'MEDIUM' : 'BASE',
    matchedSignals: matchedSignals.length > 0 ? matchedSignals : [isUtility ? 'Utility Ref' : 'Recondenser Ref'],
    rationale: `유닛 ${unitCode} 외부/공통 연계 규칙에 따라 ${electricalDrawingNo} 결선 참조를 추천합니다.`,
  };
}

export function normalizeSuggestedTagPreview(rawTag: string, unitCode: UnitCode): string {
  return normalizeTag(rawTag, unitCode);
}
