import { H042_DRAWINGS } from '../data/h042Dataset.ts';
import {
  CrossLayerDiffItem,
  DiscrepancySeverity,
  DrawingContentAnalysisReport,
  DrawingPinNote,
  EvaluatedLoopMatch,
  RuleViolationHit,
  UnitCode,
} from '../types/diagram.ts';

export type ElectricalTargetDiagram =
  | 'H042-CI-000-DIA-0001'
  | 'H042-CI-000-DIA-0002'
  | 'H042-EL-000-DIA-0001'
  | 'H042-EL-100-GAR-0001'
  | 'H042-PR-300-PID-0001'
  | 'H042-COMMON';

export type CommentIssueCategory =
  | 'CABLE_MISSING'
  | 'UNASSIGNED_HOLD'
  | 'TAG_CONFLICT'
  | 'BLOCK_COPY_ERROR'
  | 'WD_MISSING'
  | 'SPEC_MISMATCH';

export interface CropRegionPct {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface SnapshotAnnotationBox {
  leftPct: number;
  topPct: number;
  widthPct: number;
  heightPct: number;
  label: string;
  color: 'red' | 'blue';
}

export interface EvidencePanelSpec {
  id: string;
  drawingId: string;
  drawingNo: string;
  pdfUrl: string;
  pageNum: number;
  sheetLabel: string;
  caption: string;
  cropPct: CropRegionPct;
  annotations: SnapshotAnnotationBox[];
}

export interface MissingCableActionRow {
  id: string;
  unitCode: UnitCode | '000';
  tag: string;
  serviceName: string;
  issueType: CommentIssueCategory;
  issueTypeLabelKo: string;
  severity: DiscrepancySeverity;
  currentCableState: string;
  targetDiagram: ElectricalTargetDiagram;
  evidenceRef: string;
  requiredAction: string;
  drawingId: string;
  pageNum: number;
}

export interface TemplateCommentSheet {
  id: string;
  sheetNo: number;
  badgeLabel: string;
  isNewTag: boolean;
  slideKind?: 'STANDARD' | 'CHECKLIST';
  severity: DiscrepancySeverity;
  category: CommentIssueCategory;
  targetDiagram: ElectricalTargetDiagram;
  title: string;
  drawingSubtitle: string;
  evidencePanels: EvidencePanelSpec[];
  missingCables: Array<{
    tag: string;
    currentState: string;
    requiredCableSpec: string;
  }>;
  queries: string[];
  electricalComments: string[];
}

export interface ElectricalDiagramCommentGroup {
  diagramNo: ElectricalTargetDiagram;
  diagramTitleKo: string;
  criticalCount: number;
  warningCount: number;
  sheetNos: number[];
  keyComments: string[];
}

export interface ElectricalCommentReportPackage {
  generatedAt: string;
  projectCode: string;
  summaryCounts: {
    totalMissingOrHoldCables: number;
    cableMissingMarkB: number;
    unassignedOrHoldCount: number;
    pidOnlyCount: number;
    tagOrBlockErrorCount: number;
    wdMissingCount: number;
    totalCommentSheets: number;
    criticalSheets: number;
  };
  missingCableRows: MissingCableActionRow[];
  diagramGroups: ElectricalDiagramCommentGroup[];
  commentSheets: TemplateCommentSheet[];
}

const ATTACHED_TEMPLATE_PDF_URL =
  '/assets/aistudio/H042________________Rev1_261118_38b7d0ac.pdf';

function getDrawingUrl(drawingId: string): string {
  if (drawingId === 'REQ-REV1-261118') {
    return ATTACHED_TEMPLATE_PDF_URL;
  }
  const found = H042_DRAWINGS.find((d) => d.id === drawingId);
  return found?.pdfUrl || '';
}

function makePanel(
  id: string,
  drawingId: string,
  drawingNo: string,
  pageNum: number,
  sheetLabel: string,
  caption: string,
  cropPct: CropRegionPct,
  annotations: SnapshotAnnotationBox[] = []
): EvidencePanelSpec {
  return {
    id,
    drawingId,
    drawingNo,
    pdfUrl: getDrawingUrl(drawingId),
    pageNum,
    sheetLabel,
    caption,
    cropPct,
    annotations,
  };
}

export interface BuildElectricalCommentPackageInput {
  evaluatedLoops: EvaluatedLoopMatch[];
  crossLayerDiffs: CrossLayerDiffItem[];
  ruleViolations: RuleViolationHit[];
  pinNotes: DrawingPinNote[];
  analysisReport?: DrawingContentAnalysisReport | null;
}

/**
 * Builds the complete missing-cable audit & attached-template-format Electrical Diagram Comment package.
 * Mirrors every slide of H042_전기 생산 설계관련 요청건_Rev1_261118.pdf plus Module 300 & live scan findings.
 */
export function buildElectricalCommentPackage(
  input: BuildElectricalCommentPackageInput
): ElectricalCommentReportPackage {
  const { evaluatedLoops, ruleViolations, pinNotes, analysisReport } = input;
  const missingCableRows: MissingCableActionRow[] = [];

  // 1. Derive missing/unassigned/HOLD/conflict cable rows dynamically from evaluated loops
  for (const loop of evaluatedLoops) {
    const firstEp = loop.electricalPaths[0];
    const hasHoldCable = Boolean(
      firstEp &&
        (firstEp.trunkCableSpec?.toUpperCase().includes('HOLD') ||
          firstEp.fieldCableSpec.toUpperCase().includes('BY VENDOR') ||
          firstEp.fieldCableNo.toUpperCase().includes('HOLD'))
    );

    if (loop.status === 'CABLE_MISSING') {
      missingCableRows.push({
        id: `MC-${loop.id}`,
        unitCode: loop.unitCode,
        tag: loop.canonicalTag,
        serviceName: loop.serviceName,
        issueType: 'CABLE_MISSING',
        issueTypeLabelKo: '케이블 누락 (Mark B / Signal 누락)',
        severity: 'CRITICAL',
        currentCableState: firstEp
          ? `${firstEp.fieldCableNo} (${firstEp.junctionBox})`
          : 'Cable List 미등록 (NO. T.B.D)',
        targetDiagram:
          firstEp?.system === 'ICAMS' ? 'H042-CI-000-DIA-0001' : 'H042-CI-000-DIA-0002',
        evidenceRef: loop.gar
          ? `GAR ${loop.gar.sheet} / ${firstEp ? firstEp.connectionSheet : '미연결'}`
          : `P&ID ${loop.pid.sheet}`,
        requiredAction:
          loop.discrepancies[0]?.recommendedAction ||
          '정식 필드 케이블 번호를 발행하고 결선표 및 Cable List에 반영',
        drawingId:
          firstEp?.system === 'ICAMS' ? 'CI-000-DIA-0001' : 'CI-000-DIA-0002',
        pageNum: loop.unitCode === '300' ? 40 : 5,
      });
    } else if (loop.status === 'UNASSIGNED_CIRCUIT' || hasHoldCable) {
      missingCableRows.push({
        id: `MC-${loop.id}`,
        unitCode: loop.unitCode,
        tag: loop.canonicalTag,
        serviceName: loop.serviceName,
        issueType: 'UNASSIGNED_HOLD',
        issueTypeLabelKo: hasHoldCable ? 'Vendor/Trunk HOLD 미확정' : '회로 번호 미할당 (RC****)',
        severity: loop.discrepancies.some((d) => d.severity === 'CRITICAL')
          ? 'CRITICAL'
          : 'WARNING',
        currentCableState: firstEp
          ? `${firstEp.fieldCableNo} / Trunk: ${firstEp.trunkCableNo} (${firstEp.trunkCableSpec || firstEp.fieldCableSpec})`
          : 'RC**** 미할당',
        targetDiagram:
          firstEp?.system === 'PSDS' ? 'H042-CI-000-DIA-0002' : 'H042-CI-000-DIA-0001',
        evidenceRef: firstEp
          ? `DIA Sheet ${firstEp.connectionSheet} (${firstEp.junctionBox})`
          : `GAR ${loop.gar?.sheet || '-'}`,
        requiredAction:
          loop.discrepancies[0]?.recommendedAction ||
          'Vendor 케이블 사양 및 Trunk HOLD 해제 후 Cable No./Spec 확정 반영',
        drawingId:
          firstEp?.system === 'PSDS' ? 'CI-000-DIA-0002' : 'CI-000-DIA-0001',
        pageNum: loop.unitCode === '300' ? (firstEp?.system === 'PSDS' ? 48 : 39) : 14,
      });
    } else if (loop.status === 'PID_ONLY') {
      missingCableRows.push({
        id: `MC-${loop.id}`,
        unitCode: loop.unitCode,
        tag: loop.canonicalTag,
        serviceName: loop.serviceName,
        issueType: 'CABLE_MISSING',
        issueTypeLabelKo: 'P&ID 단독 존재 (전장 결선 누락)',
        severity: 'WARNING',
        currentCableState: 'DIA-0001/0002 결선표 미등록 (Mark D)',
        targetDiagram: 'H042-CI-000-DIA-0001',
        evidenceRef: `P&ID ${loop.pid.sheet} ↔ GAR ${loop.gar?.sheet || '-'}`,
        requiredAction: '로컬 MCC 패키지 내부 결선 여부 확인 후 외부 신호시 Cable List 및 DIA 추가',
        drawingId: loop.unitCode === '100' ? 'PR-100-PID-0001' : 'PR-200-PID-0001',
        pageNum: loop.unitCode === '200' ? 14 : 13,
      });
    }
  }

  // Structural & template-baseline cable/diagram omission rows
  const baselineStructuralCableRows: MissingCableActionRow[] = [
    {
      id: 'MC-RL0113-DUP',
      unitCode: '000',
      tag: 'RL0113 (AC220V Lighting)',
      serviceName: 'EL-000-DIA-0002 조명 분전반 회로 Tag 중복 및 EL-000-DIA-0001 PB 오기',
      issueType: 'TAG_CONFLICT',
      issueTypeLabelKo: 'Tag 중복 / Note 오기',
      severity: 'CRITICAL',
      currentCableState: 'RL0113 2회 중복 표기 · NO.2/3 Booster Pump PB가 G.W.PUMP로 오기',
      targetDiagram: 'H042-EL-000-DIA-0001',
      evidenceRef: '요청서 p.1 (EL-000-DIA-0002 p.9 / DIA-0001 p.2)',
      requiredAction: 'RL0113 중복 번호 분리(RL0114) 및 PB 명칭 LNG BOOSTER PUMP로 정정',
      drawingId: 'REQ-REV1-261118',
      pageNum: 1,
    },
    {
      id: 'MC-GAR0001-CABLETAG',
      unitCode: '100',
      tag: 'EL-100-GAR-0001 (Motor·JB·PB·Light·GD/FD)',
      serviceName: 'Electrical Equipment Arrangement 배치도 전체 Cable Tag 누락',
      issueType: 'CABLE_MISSING',
      issueTypeLabelKo: '배치도 케이블 태그 일괄 누락',
      severity: 'CRITICAL',
      currentCableState: '장비 심볼만 표기, Power/iCAMS/PSDS Cable No. 및 JB 위치·Elevation 미표기',
      targetDiagram: 'H042-EL-100-GAR-0001',
      evidenceRef: '요청서 p.2 (H042-EL-100-GAR-0001 Rev.A)',
      requiredAction: '전 장비(Motor/PB/Light/JB/GD/FD) 고유 Tag, Elevation 및 Cable No. 표기 반영',
      drawingId: 'REQ-REV1-261118',
      pageNum: 2,
    },
    {
      id: 'MC-EDJB001-POLE',
      unitCode: '200',
      tag: '200-EDJB-001 (Pole 80P vs 40P)',
      serviceName: 'PSDS Rev.A Sheet 10/18(80P) vs 11/18(40P) JB Pole 개수 상이 및 Cable Legend 누락',
      issueType: 'TAG_CONFLICT',
      issueTypeLabelKo: 'JB Pole 수량 불일치 · Cable Legend 누락',
      severity: 'CRITICAL',
      currentCableState: '동일 JB Tag가 Sheet 10/18(80P)과 11/18(40P)에 상이 표기',
      targetDiagram: 'H042-CI-000-DIA-0002',
      evidenceRef: '요청서 p.3 (DIA-0002 Sheet 10~11/18)',
      requiredAction: '200-EDJB-001 Pole 사양 통일, CABLE LEGEND(IS/NON-IS/OD) 및 조선표준(JIS) 반영',
      drawingId: 'REQ-REV1-261118',
      pageNum: 3,
    },
    {
      id: 'MC-6600V-SPEC',
      unitCode: '000',
      tag: '6.6kV Booster & G.W. Pump Cable',
      serviceName: '6.6kV 고압 모터 케이블 전압 등급 표기 오류 (0.6/1kV ↔ 6/10kV CJPF/SC)',
      issueType: 'SPEC_MISMATCH',
      issueTypeLabelKo: '전압 등급 스펙 불일치',
      severity: 'CRITICAL',
      currentCableState: 'BOM 6/10kV(CJPF/SC) vs EL-000-DIA-0001 0.6~1kV(H) 표기 충돌',
      targetDiagram: 'H042-EL-000-DIA-0001',
      evidenceRef: '요청서 p.4 / p.17 (EL-000-SLD-0001 ↔ DIA-0001)',
      requiredAction: '6/10kV 정격에 맞춰 Cable Spec 수정, C&I 매칭 및 FOR WORKING 정식 출도',
      drawingId: 'REQ-REV1-261118',
      pageNum: 17,
    },
    {
      id: 'MC-PSDS-R09-ORDER',
      unitCode: '100',
      tag: '100-SDV-202A~D (RS0901~0908)',
      serviceName: 'PSDS R-09 블록도 ↔ Connection Sheet 7/23 밸브 매핑 순서 불일치',
      issueType: 'BLOCK_COPY_ERROR',
      issueTypeLabelKo: '블록도 ↔ 결선표 순서 불일치',
      severity: 'CRITICAL',
      currentCableState: 'R-09: 202C→202A→202D→202B 순 vs Sheet 7/23: 202A→202B→202C→202D 순',
      targetDiagram: 'H042-CI-000-DIA-0002',
      evidenceRef: 'DIA-0002 R-09 (p.18) ↔ Sheet 7/23 (p.35)',
      requiredAction: 'RS0901~0908 실제 현장 결선 기준(202A~D 알파벳 순)으로 R-09 및 Sheet 7/23 일치',
      drawingId: 'CI-000-DIA-0002',
      pageNum: 18,
    },
    {
      id: 'MC-300-ZSO-SEPARATE',
      unitCode: '300',
      tag: '300-ZSO-001~006 / 300-FCV-001 SV·LS',
      serviceName: 'Recondenser SDV Open LS & FCV-001 TYP.2 Solenoid/Fail-Close LS',
      issueType: 'CABLE_MISSING',
      issueTypeLabelKo: '리미트스위치·솔레노이드 케이블 누락',
      severity: 'CRITICAL',
      currentCableState: 'DIA-0002 Sheet 19~20/23에 ZSO 개별 케이블 미표기, FCV-001 SV/LS 누락',
      targetDiagram: 'H042-CI-000-DIA-0002',
      evidenceRef: 'PR-300-PID-0001 p.10/10 ↔ DIA-0002 p.47~48',
      requiredAction: 'FCV-001 TYP.2 Solenoid(FY-003 정리)·Fail-Close LS 및 SDV ZSO/ZSC 케이블 분리 명시',
      drawingId: 'CI-000-DIA-0002',
      pageNum: 48,
    },
    {
      id: 'MC-WD-SHEETS-MISSING',
      unitCode: '000',
      tag: 'iCAMS Sheet 16~22 & PSDS Sheet 18~22 W/D',
      serviceName: '결선표 앞단 블록 다이어그램(W/D) 시트 일괄 누락 및 DIN 표기 잔존',
      issueType: 'WD_MISSING',
      issueTypeLabelKo: 'W/D 블록 다이어그램 페이지 누락',
      severity: 'CRITICAL',
      currentCableState: '300번대(DAJB/EAJB/EDJB) 및 MCC 통합케이블(FL-D/FR-E-MCC) W/D 부재',
      targetDiagram: 'H042-CI-000-DIA-0002',
      evidenceRef: 'DIA-0001 p.44 / DIA-0002 p.46~50',
      requiredAction: '누락된 300번대 및 MCC 연동 W/D 블록 다이어그램 시트를 DIA-0001/0002에 추가',
      drawingId: 'CI-000-DIA-0002',
      pageNum: 50,
    },
  ];

  for (const row of baselineStructuralCableRows) {
    if (!missingCableRows.some((r) => r.id === row.id)) {
      missingCableRows.push(row);
    }
  }

  // 2. Construct Attached-Template Slide Deck (matching H042_전기 생산 설계관련 요청건_Rev1_261118.pdf 1:1 + Module 300)
  const commentSheets: TemplateCommentSheet[] = [
    {
      id: 'SHEET-01-TAG-DUP-NOTE-TYPO',
      sheetNo: 1,
      badgeLabel: '기존 요청 · p.1',
      isNewTag: false,
      severity: 'CRITICAL',
      category: 'TAG_CONFLICT',
      targetDiagram: 'H042-EL-000-DIA-0001',
      title: '1. Tag 중복 (RL0113) & 2. Note 오기 (PB 표기)',
      drawingSubtitle:
        '도면 : H042-EL-000-DIA-0002 PDF p.9 ↔ H042-EL-000-DIA-0001_Cable Diagram for Regasfication Package p.2',
      evidencePanels: [
        makePanel(
          'EV-PDF1-RL0113',
          'REQ-REV1-261118',
          'H042-EL-000-DIA-0002',
          1,
          'PDF p.9 (요청서 p.1)',
          'Tag RL0113 중복 표기 구간 (AC 220V Lighting Distribution Panel)',
          { left: 3, top: 23, width: 41, height: 46 },
          []
        ),
        makePanel(
          'EV-PDF1-PBNOTE',
          'REQ-REV1-261118',
          'H042-EL-000-DIA-0001',
          1,
          'PDF p.2 (요청서 p.1)',
          'NO.2/3 LNG Booster Pump PB가 NO.2/3 GLYCOL WATER CIRC. PUMP로 오기',
          { left: 49, top: 23, width: 41, height: 46 },
          []
        ),
      ],
      missingCables: [
        {
          tag: 'RL0113 (AC220V Lighting)',
          currentState: 'EL-000-DIA-0002 p.9 상단 분전반 회로 번호 RL0113 중복 기재',
          requiredCableSpec: '중복된 RL0113 회로 번호를 RL0114 등 고유 번호로 분리',
        },
        {
          tag: 'NO.2/3 LNG BOOSTER PUMP PB',
          currentState: 'EL-000-DIA-0001 p.2 Local Push Button 설명란에 G.W. CIRC. PUMP로 오기',
          requiredCableSpec: 'NO.2/3 LNG BOOSTER PUMP LOCAL PUSH BUTTON으로 문구 수정',
        },
      ],
      queries: [
        'EL-000-DIA-0002 p.9: 조명 분전반 회로 Tag RL0113 중복 표기.',
        'EL-000-DIA-0001 p.2: NO.2/3 LNG BOOSTER PUMP의 PB 표기가 "NO.2/3 GLYCOL WATER CIRC. PUMP"로 오기됨.',
      ],
      electricalComments: [
        '[H042-EL-000-DIA-0002 p.9] 중복 표기된 RL0113 회로 번호를 순차 고유 번호(RL0114)로 정정.',
        '[H042-EL-000-DIA-0001 p.2] Booster Pump #2/#3 Local PB 명칭을 LNG BOOSTER PUMP로 수정 반영.',
      ],
    },
    {
      id: 'SHEET-02-EL-GAR-MISSING',
      sheetNo: 2,
      badgeLabel: '기존 요청 · p.2',
      isNewTag: false,
      severity: 'CRITICAL',
      category: 'CABLE_MISSING',
      targetDiagram: 'H042-EL-100-GAR-0001',
      title: '2. GA 장비별 Cable No.와 연결 정보가 누락',
      drawingSubtitle:
        '도면 : H042-EL-100-GAR-0001 Rev.A · Electrical Equipment Arrangement / C&I overlay',
      evidencePanels: [
        makePanel(
          'EV-PDF2-GAR-L',
          'REQ-REV1-261118',
          'H042-EL-100-GAR-0001',
          2,
          'Top/Upper Plan (요청서 p.2)',
          'EL-100-GAR-0001 좌측 평면: 심볼만 존재, Cable Tag 및 JB 연결 미표기',
          { left: 4, top: 21, width: 33, height: 49 },
          []
        ),
        makePanel(
          'EV-PDF2-GAR-R',
          'REQ-REV1-261118',
          'H042-EL-100-GAR-0001',
          2,
          '1st Deck Plan (요청서 p.2)',
          'EL-100-GAR-0001 1st Deck Plan: Power/iCAMS/PSDS 장비별 Cable No. 누락',
          { left: 37, top: 21, width: 32, height: 49 },
          []
        ),
      ],
      missingCables: [
        {
          tag: 'EL-100-GAR-0001 전 장비 심볼',
          currentState: '조명·JB·Motor·PB·GD/FD 심볼만 있고 Cable Tag 및 JB 위치 표기 누락',
          requiredCableSpec: 'Power, iCAMS, PSDS 장비별 고유 Tag·Elevation·Cable No. 일괄 표기',
        },
      ],
      queries: [
        '배치도에 조명·JB·Motor·PB·GD/FD 심볼만 있고 CABLE TAG 표기가 전면 누락됨.',
        'POWER & iCAMS, PSD 장비별 Cable No.와 JB 위치 미표기 → 장비별 고유 Tag·Cable No.·Elevation 표기 요청.',
      ],
      electricalComments: [
        '[H042-EL-100-GAR-0001] 모든 Motor, JB(ISJB/NISJB/GDJB), PB, Lighting, GD/FD에 고유 Tag, Elevation 및 Power/iCAMS/PSDS Cable No. 표기 추가.',
      ],
    },
    {
      id: 'SHEET-03-EDJB001-POLE',
      sheetNo: 3,
      badgeLabel: '기존 요청 · p.3',
      isNewTag: false,
      severity: 'CRITICAL',
      category: 'TAG_CONFLICT',
      targetDiagram: 'H042-CI-000-DIA-0002',
      title: '3. 200-EDJB-001 Pole 개수 상이 (80P ↔ 40P)',
      drawingSubtitle:
        '도면 : H042-CI-000-DIA-0002 Rev.A PSD PDF p.10 / Sheet 10/18 ↔ PDF p.11 / Sheet 11/18 · Junction Box List row 40',
      evidencePanels: [
        makePanel(
          'EV-PDF3-EDJB001',
          'REQ-REV1-261118',
          'H042-CI-000-DIA-0002',
          3,
          'Rev.A Sheet 10~11/18 (요청서 p.3)',
          '200-EDJB-001: 좌측 Sheet 10/18은 80P 표기, 우측 Sheet 11/18은 40P로 상이 표기',
          { left: 4, top: 21, width: 92, height: 49 },
          []
        ),
      ],
      missingCables: [
        {
          tag: '200-EDJB-001 (Pole 사양)',
          currentState: 'PSD Sheet 10/18(80P) vs Sheet 11/18(40P) 상이 · Cable Legend 미기재',
          requiredCableSpec: 'JB Pole 수량(80P/40P) 통일, Cable Legend(IS/NON-IS/OD) 및 조선표준(JIS) 반영',
        },
      ],
      queries: [
        'PSD Sheet 10/18은 200-EDJB-001을 80P로 표기, 11/18은 같은 JB Tag를 40P로 표기함.',
        'iCAMS, PDS CONNECTION 도면에 있는 CABLE LEGEND(IS, NON IS, OD 등) 정보 표기 필요.',
        'POWER W/D와 같이 CABLE TAG, CABLE TYPE(JIS), CORE 수 등 조선 표준에 맞게 수정하거나 현재 표기에 맞는 CABLE LEGEND 제공 요망. 위치 확인 가능한 P&ID·기타 도면 요청.',
      ],
      electricalComments: [
        '[H042-CI-000-DIA-0002] 200-EDJB-001 JB Pole 사양을 JB List 및 Connection Sheet 간 일치시키고, 도면 범례에 CABLE LEGEND(IS/NON-IS/OD·JIS 규격) 추가.',
      ],
    },
    {
      id: 'SHEET-04-66KV-SPEC',
      sheetNo: 4,
      badgeLabel: '기존 요청 · p.4',
      isNewTag: false,
      severity: 'CRITICAL',
      category: 'SPEC_MISMATCH',
      targetDiagram: 'H042-EL-000-DIA-0001',
      title: '4. 6.6 kV Cable 맞는 SPEC자료 제공',
      drawingSubtitle:
        '도면 : H042-EL-000-SLD-0001 Rev.0 PDF p.3 / Sheet 01 ↔ H042-EL-000-DIA-0001_Cable Diagram for Regasfication Package',
      evidencePanels: [
        makePanel(
          'EV-PDF4-SLD',
          'REQ-REV1-261118',
          'H042-EL-000-SLD-0001',
          4,
          'SLD / DIA 비교 (요청서 p.4)',
          '6.6kV HP/Booster Motor 계통도 및 Cable Diagram 구간',
          { left: 5, top: 23, width: 47, height: 47 },
          []
        ),
        makePanel(
          'EV-PDF4-LEGEND',
          'REQ-REV1-261118',
          'H042-EL-000-DIA-0001',
          4,
          'Cable Legend (요청서 p.4)',
          'CABLE LEGEND상 전압 등급이 (H): 0.6/1kV, L: 250V로만 표기됨',
          { left: 52, top: 23, width: 39, height: 47 },
          []
        ),
      ],
      missingCables: [
        {
          tag: 'CJPF/SC 3×50 mm² (6/10 kV)',
          currentState: 'BOM은 6/10kV 표기이나, Cable Legend 및 EL-000-DIA-0001은 0.6~1kV 사양 표기',
          requiredCableSpec: 'IEC 60092-354 기준 6/10(12)kV 고압 케이블 등급에 맞는 SPEC 자료 및 도면 수정',
        },
      ],
      queries: [
        'Booster GA BOM item 824.11은 CJPF/SC 3×50 mm², 6/10 kV, 20 m/pc로 표기됨.',
        '6/10kV voltage grade는 6.6 kV가 맞고 IEC 60092-354는 선박/해양용 6/10(12) kV cable rating이지만, CABLE LEGEND와 H042-EL-000-DIA-0001 도면의 CABLE 사양은 0.6~1kV 사양임.',
        '-> Maker cable의 voltage grade에 맞는 SPEC 제공 및 도면 사양 정정 요망.',
      ],
      electricalComments: [
        '[H042-EL-000-DIA-0001 & Cable Legend] 6.6kV 고압 모터 케이블 사양을 6/10kV 등급(CJPF/SC 등)으로 수정하고 공인 SPEC 자료 첨부.',
      ],
    },
    {
      id: 'SHEET-05-ICAMS-E01',
      sheetNo: 5,
      badgeLabel: '신규 (1)',
      isNewTag: true,
      severity: 'CRITICAL',
      category: 'BLOCK_COPY_ERROR',
      targetDiagram: 'H042-CI-000-DIA-0001',
      title: '5. iCAMS Gas Detector (E-01) CIR. NO중복 및 복사 오기',
      drawingSubtitle:
        '도면 : H042-CI-000-DIA-0001 Rev.B Page E-01 (p.22) ↔ Connection Drawing Sheet 13/22 (p.36)',
      evidencePanels: [
        makePanel(
          'EV-DIA1-E01',
          'CI-000-DIA-0001',
          'H042-CI-000-DIA-0001',
          22,
          'Page E-01 (p.22)',
          'E-01: 100-GD-201~205/301A~C 전체가 RE0101로 중복 표기, RC0412 잔존 및 100-GJB-001 오기',
          { left: 10, top: 10, width: 80, height: 78 },
          [
            {
              leftPct: 12,
              topPct: 20,
              widthPct: 76,
              heightPct: 58,
              label: 'RE0101~RE0109 분리 & RC0412 삭제',
              color: 'red',
            },
          ]
        ),
        makePanel(
          'EV-DIA1-S13',
          'CI-000-DIA-0001',
          'H042-CI-000-DIA-0001',
          36,
          'Sheet 13/22 (p.36)',
          'Connection Sheet 13/22 (100-GDJB-001): RE0110 규격 LFMTY10S ↔ L-MPYCYS-27 불일치',
          { left: 14, top: 14, width: 72, height: 72 },
          [
            {
              leftPct: 52,
              topPct: 18,
              widthPct: 38,
              heightPct: 24,
              label: 'RE0110 LFMTY10S↔L-MPYCYS-27',
              color: 'blue',
            },
          ]
        ),
      ],
      missingCables: [
        {
          tag: '100-GDJB-001 (RE0101~0109 / RE0110)',
          currentState: 'E-01 전체 RE0101 중복, VAPORIZER A 중복, RC0412 잔존, GJB/GDJB 불일치',
          requiredCableSpec: 'RE0101~0109 순번 부여, VAPORIZER A~E 수정, RC0412 삭제, 100-GDJB-001 통일',
        },
      ],
      queries: [
        '1. CIR. NO 중복·불일치: RE0101로 중복 표기 -> RE0101~RE0109 정정.',
        '2. VAPORIZER A 표기 중복 -> A~E 정정.',
        '3. RE0110 CIRCUIT는 100/200-GDJB 간 중복됨. CABLE TYPE이 LFMTY10S(Symbol) ↔ L-MPYCYS-27(Cable Type)로 W/D & C/D 간 불일치함.',
        '4. RC0412 오기 - 삭제 요망. / 5. 100-GDJB-001 <-> 100-GJB-001 : TAG 명확히 통일.',
      ],
      electricalComments: [
        '[DIA-0001 E-01 & Sheet 13/22] RE0101~0109 고유화, VAPORIZER A~E 수정, RC0412 삭제, RE0110 Cable Type(LFMTY10S↔L-MPYCYS-27) 통일 및 JB명 100-GDJB-001 일치.',
      ],
    },
    {
      id: 'SHEET-06-ICAMS-E02',
      sheetNo: 6,
      badgeLabel: '신규 (2)',
      isNewTag: true,
      severity: 'CRITICAL',
      category: 'BLOCK_COPY_ERROR',
      targetDiagram: 'H042-CI-000-DIA-0001',
      title: '6. iCAMS Gas Detector (E-02) CIR. NO중복 및 복사 오기',
      drawingSubtitle:
        '도면 : H042-CI-000-DIA-0001 Rev.B Page E-02 (p.23) ↔ Connection Drawing Sheet 14/22 (p.37)',
      evidencePanels: [
        makePanel(
          'EV-DIA1-E02',
          'CI-000-DIA-0001',
          'H042-CI-000-DIA-0001',
          23,
          'Page E-02 (p.23)',
          'E-02 (200-GD-101~105): HE0101/RE0101 중복 표기, RC0412 오기 및 200-GJB-001 혼선',
          { left: 10, top: 10, width: 80, height: 78 },
          [
            {
              leftPct: 12,
              topPct: 22,
              widthPct: 76,
              heightPct: 54,
              label: 'HE0101~HE0105 정정 & RC0412 삭제',
              color: 'red',
            },
          ]
        ),
        makePanel(
          'EV-DIA1-S14',
          'CI-000-DIA-0001',
          'H042-CI-000-DIA-0001',
          37,
          'Sheet 14/22 (p.37)',
          'Connection Sheet 14/22 (200-GDJB-001): RE0110 트렁크 및 RE0101~0105 중복',
          { left: 14, top: 14, width: 72, height: 72 },
          [
            {
              leftPct: 52,
              topPct: 18,
              widthPct: 38,
              heightPct: 24,
              label: 'RE0110 트렁크 중복 (HE0110 분리)',
              color: 'red',
            },
          ]
        ),
      ],
      missingCables: [
        {
          tag: '200-GDJB-001 (HE0101~0105)',
          currentState: 'E-02 전체 HE0101(또는 RE0101) 중복 및 RE0110 트렁크 중복',
          requiredCableSpec: 'HE0101~HE0105 및 200번대 고유 트렁크 번호(HE0110)로 분리',
        },
      ],
      queries: [
        '1. CIR. NO 중복·불일치: HE0101로 중복 표기 -> HE0101~HE0105 정정 (결선표 RE0101~0105 포함).',
        '2. RE0110 CIRCUIT는 100/200-GDJB 간 중복됨. 규격이 LFMTY10S(Symbol) ↔ L-MPYCYS-27(Cable Type)로 불일치함.',
        '3. RC0412 오기 - 삭제 요망. / 4. 200-GDJB-001 <-> 200-GJB-001 : TAG 명확히 통일.',
      ],
      electricalComments: [
        '[DIA-0001 E-02 & Sheet 14/22] 200-GD-101~105 케이블을 HE0101~HE0105로 통일, 트렁크 RE0110 중복 분리(HE0110), RC0412 삭제 및 200-GDJB-001 통일.',
      ],
    },
    {
      id: 'SHEET-07-ICAMS-H01-R07',
      sheetNo: 7,
      badgeLabel: '신규 (3)',
      isNewTag: true,
      severity: 'CRITICAL',
      category: 'TAG_CONFLICT',
      targetDiagram: 'H042-CI-000-DIA-0001',
      title: '7. iCAMS R-06 CIR. NO전체 복사 오기 및 H-01~05 CIRCUIT오기',
      drawingSubtitle:
        '도면 : H042-CI-000-DIA-0001 Rev.B Page H-01~H-05 (p.17~21), Page R-07 (p.16)',
      evidencePanels: [
        makePanel(
          'EV-DIA1-H01',
          'CI-000-DIA-0001',
          'H042-CI-000-DIA-0001',
          17,
          'Page H-01 (p.17)',
          'H-01~05 Kick Back V/V (200-FCV/FVI-111A~E): Regas 모듈 번호 RC0107~0507로 오기',
          { left: 10, top: 10, width: 80, height: 78 },
          [
            {
              leftPct: 16,
              topPct: 68,
              widthPct: 68,
              heightPct: 22,
              label: 'RC0107 → HC0107 정정',
              color: 'red',
            },
          ]
        ),
        makePanel(
          'EV-DIA1-R07',
          'CI-000-DIA-0001',
          'H042-CI-000-DIA-0001',
          16,
          'Page R-07 (p.16)',
          'R-07: RC0702 규격 MYS2(→MYS4) 및 RC710(→RC0710) 오기',
          { left: 10, top: 10, width: 80, height: 78 },
          [
            {
              leftPct: 20,
              topPct: 22,
              widthPct: 60,
              heightPct: 40,
              label: 'RC0702(MYS4) & RC0710 정정',
              color: 'blue',
            },
          ]
        ),
      ],
      missingCables: [
        {
          tag: '200-FCV/FVI-111A~E (H-01~05)',
          currentState: 'H-01~H-05 Kick Back V/V 케이블이 Regas 번호 RC0107~0507로 오기',
          requiredCableSpec: 'HP Pump 모듈 체계인 HC0107~HC0507(및 HC0116~0516)로 수정',
        },
        {
          tag: 'RC0702 / RC0710 (R-07)',
          currentState: 'R-07 RC0702 규격 MYS2, 회로번호 RC710 자리수 오타',
          requiredCableSpec: 'RC0702 규격 MYS4 및 회로번호 RC0710 정정',
        },
      ],
      queries: [
        '1) H-01~H-05 Kick Back V/V 번호 오기: 200-FCV/FVI-111A~E 케이블이 RC0107~0507(Regas 모듈 번호)로 오기됨 -> HC0107~0507(HC0000 계열) 정정.',
        '2) R-07 RC0702 규격 MYS2(→ MYS4) 및 RC710(→ RC0710) 정정.',
      ],
      electricalComments: [
        '[DIA-0001 H-01~05 & R-07] Kick Back V/V 케이블 번호 RC0107~0507 → HC0107~0507(HC 계열) 수정 및 R-07 RC0702 규격(MYS4)·RC0710 정정.',
      ],
    },
    {
      id: 'SHEET-08-ICAMS-R06',
      sheetNo: 8,
      badgeLabel: '신규 (4)',
      isNewTag: true,
      severity: 'CRITICAL',
      category: 'BLOCK_COPY_ERROR',
      targetDiagram: 'H042-CI-000-DIA-0001',
      title: '8. iCAMS R-06 CIR. NO전체 복사 오기 및 H-01~05 번호 중복',
      drawingSubtitle:
        '도면 : H042-CI-000-DIA-0001 Rev.B Page R-06 (p.15), R-07, H-01~05 ↔ Connection Sheet 6/22 (p.29)',
      evidencePanels: [
        makePanel(
          'EV-DIA1-R06',
          'CI-000-DIA-0001',
          'H042-CI-000-DIA-0001',
          15,
          'Page R-06 (p.15)',
          'R-06: R-04 케이블 번호 RC0401/RC0404/RC0411/RC0412 복사 오기 및 100-ISJB-005 오기',
          { left: 10, top: 10, width: 80, height: 78 },
          [
            {
              leftPct: 12,
              topPct: 22,
              widthPct: 76,
              heightPct: 56,
              label: 'RC04xx → RC0601~RC0617 정정',
              color: 'red',
            },
          ]
        ),
        makePanel(
          'EV-DIA1-S6',
          'CI-000-DIA-0001',
          'H042-CI-000-DIA-0001',
          29,
          'Sheet 6/22 (p.29)',
          'Connection Sheet 6/22: 정품 케이블 번호 RC0601~RC0617 (JB 100-ISJB-006/NISJB)',
          { left: 14, top: 14, width: 72, height: 72 },
          [
            {
              leftPct: 16,
              topPct: 22,
              widthPct: 50,
              heightPct: 58,
              label: '정품: RC0601~RC0617',
              color: 'blue',
            },
          ]
        ),
      ],
      missingCables: [
        {
          tag: 'R-06 (RC0601~RC0617)',
          currentState: 'R-06 블록도에 RC0401/0404/0411/0412로 복사 중복 오기',
          requiredCableSpec: 'Sheet 6/22 기준 RC0601~RC0617로 R-06 블록도 전체 정정',
        },
      ],
      queries: [
        '1) R-06 블록도 전체가 RC0401/RC0404 및 RC0411/RC0412로 중복 오기됨 -> Connection Sheet 6/22 기준 RC0601~RC0617로 정정.',
        '2) R-03 블록도 RC03208 오타(→ RC0308) 및 Sheet 12/22 200-PEIT-111E(→ 200-PDIT-111E) 함께 정정 필요.',
      ],
      electricalComments: [
        '[DIA-0001 R-06 (p.15)] RC0401/0404/0411/0412 전체를 Sheet 6/22 기준 RC0601~RC0617로 수정하고 R-03 RC03208 → RC0308 수정.',
      ],
    },
    {
      id: 'SHEET-09-PSDS-R01-R03',
      sheetNo: 9,
      badgeLabel: '신규 (5)',
      isNewTag: true,
      severity: 'CRITICAL',
      category: 'BLOCK_COPY_ERROR',
      targetDiagram: 'H042-CI-000-DIA-0002',
      title: '9. PSDS R-01 계기 Tag 중복 오기 및 R-03 케이블 CIRCUIT 중복',
      drawingSubtitle:
        '도면 : H042-CI-000-DIA-0002 Rev.B Page R-01 (p.10), R-03 (p.12) ↔ Connection Drawing Sheet 1/23, 3/23 (p.29, p.31)',
      evidencePanels: [
        makePanel(
          'EV-DIA2-R01',
          'CI-000-DIA-0002',
          'H042-CI-000-DIA-0002',
          10,
          'Page R-01 (p.10)',
          'Page R-01 하단: RS0110~0112 계기 Tag가 상단 100-PIT-210A/201BR_A/TIT-251A로 중복 오기',
          { left: 6, top: 44, width: 88, height: 48 },
          [
            {
              leftPct: 12,
              topPct: 20,
              widthPct: 76,
              heightPct: 68,
              label: 'RS0110~0112 → 400-PIT-613A~C 정정',
              color: 'red',
            },
          ]
        ),
        makePanel(
          'EV-DIA2-S1-23',
          'CI-000-DIA-0002',
          'H042-CI-000-DIA-0002',
          29,
          'Sheet 1/23 (p.29)',
          'Connection Sheet 1/23: 정품 태그 400-PIT-613A/B/C 수록 · R-03 RS0207→RS0307 정정',
          { left: 14, top: 14, width: 72, height: 72 },
          [
            {
              leftPct: 4,
              topPct: 54,
              widthPct: 66,
              heightPct: 24,
              label: '정품: 400-PIT-613A/B/C (RS0110~0112)',
              color: 'blue',
            },
          ]
        ),
      ],
      missingCables: [
        {
          tag: '400-PIT-613A~C (RS0110~0112)',
          currentState: 'R-01 블록도에 100-PIT-210A/201BR_A/TIT-251A로 중복 오기',
          requiredCableSpec: 'Sheet 1/23 기준 400-PIT-613A~C로 R-01 하단 태그 수정',
        },
        {
          tag: '100-TIT-210A~C (RS0307~0309)',
          currentState: 'R-03 블록도 케이블이 RS0207~0209로 표기되어 R-02와 중복',
          requiredCableSpec: 'Sheet 3/23 기준 RS0307~RS0309로 정정',
        },
      ],
      queries: [
        '1) Page R-01 : RS0110, RS0111, RS0112의 계기 Tag가 상단(RS0101~0103)과 동일한 100-PIT-210A, 100-PIT-201BR_A, 100-TIT-251A로 중복 오기됨.',
        '2) Page R-03 CIR. NO 중복: 100-TIT-210A~C의 CIR. NO가 RS0207~0209로 표기되어 Page R-02의 1차측 케이블(RS0207)과 번호가 중복됨.',
        '-> connection(Sheet 1/23, 3/23) 기준으로 R-01 하단 계기 Tag 및 R-03 CIR. NO(RS0307~0309) 정정 요청.',
      ],
      electricalComments: [
        '[DIA-0002 R-01 (p.10) & R-03 (p.12)] R-01 하단 RS0110~0112 → 400-PIT-613A~C, R-03 RS0207~0209 → RS0307~0309로 정정.',
      ],
    },
    {
      id: 'SHEET-10-PSDS-R09-ORDER',
      sheetNo: 10,
      badgeLabel: '신규 (6)',
      isNewTag: true,
      severity: 'CRITICAL',
      category: 'BLOCK_COPY_ERROR',
      targetDiagram: 'H042-CI-000-DIA-0002',
      title: '10. PSDS R-09 ↔ connection(Sheet 7/23) 밸브 매핑 순서 불일치',
      drawingSubtitle:
        '도면 : H042-CI-000-DIA-0002 Rev.B Page R-09 (p.18) ↔ Connection Drawing Sheet 7/23 (p.35)',
      evidencePanels: [
        makePanel(
          'EV-DIA2-R09',
          'CI-000-DIA-0002',
          'H042-CI-000-DIA-0002',
          18,
          'Page R-09 (p.18)',
          'R-09: 밸브 배치 순서 202C(RS0901/02) → 202A(RS0903/04) → 202D(RS0905/06) → 202B(RS0907/08)',
          { left: 10, top: 10, width: 80, height: 78 },
          [
            {
              leftPct: 18,
              topPct: 16,
              widthPct: 68,
              heightPct: 64,
              label: '202C→202A→202D→202B 순서 혼선',
              color: 'red',
            },
          ]
        ),
        makePanel(
          'EV-DIA2-S7',
          'CI-000-DIA-0002',
          'H042-CI-000-DIA-0002',
          35,
          'Sheet 7/23 (p.35)',
          'Connection Sheet 7/23: 202A → 202B → 202C → 202D 알파벳 순 매핑 (1:1 결선 불일치)',
          { left: 14, top: 14, width: 72, height: 72 },
          [
            {
              leftPct: 10,
              topPct: 22,
              widthPct: 76,
              heightPct: 54,
              label: 'Sheet 7/23: 202A~202D 알파벳 순',
              color: 'blue',
            },
          ]
        ),
      ],
      missingCables: [
        {
          tag: '100-SDY/ZSO/ZSC-202A~D (RS0901~0908)',
          currentState: 'R-09 블록도 순서(202C/A/D/B)와 Sheet 7/23 순서(202A/B/C/D)가 불일치',
          requiredCableSpec: '실제 현장 결선 기준(202A~D 알파벳 순 여부) 확정 후 W/D·C/D 1:1 일치',
        },
      ],
      queries: [
        '1) Diagram(R-09)과 connection(Sheet 7/23) 순서 불일치: R-09는 202C(RS0901/02) → 202A(RS0903/04) → 202D(RS0905/06) → 202B(RS0907/08) 순이나, connection은 알파벳 순(202A → 202B → 202C → 202D)으로 매핑되어 1:1 결선이 일치하지 않음.',
        '-> RS0901~0908의 실제 결선 기준(202A~D 알파벳 순 여부) 확인 및 도면 정정 요청.',
      ],
      electricalComments: [
        '[DIA-0002 R-09 (p.18) ↔ Sheet 7/23 (p.35)] 100-SDY/ZSO/ZSC-202A~D의 실제 단자대 결선 순서를 알파벳 순(RS0901~0908) 기준으로 통일하여 오결선 방지.',
      ],
    },
    {
      id: 'SHEET-11-PSDS-H05',
      sheetNo: 11,
      badgeLabel: '신규 (7)',
      isNewTag: true,
      severity: 'CRITICAL',
      category: 'BLOCK_COPY_ERROR',
      targetDiagram: 'H042-CI-000-DIA-0002',
      title: '11. PSDS H-05 ↔ connection(Sheet 14/23) 태그·JB 불일치',
      drawingSubtitle:
        '도면 : H042-CI-000-DIA-0002 Rev.B Page H-05 (p.24) ↔ Connection Drawing Sheet 14/23 (p.42)',
      evidencePanels: [
        makePanel(
          'EV-DIA2-H05',
          'CI-000-DIA-0002',
          'H042-CI-000-DIA-0002',
          24,
          'Page H-05 (p.24)',
          'Page H-05: H-04 내용(200-LIT-101D / 200-ISJB-004 / HS0401) 복사 오기',
          { left: 10, top: 10, width: 80, height: 78 },
          [
            {
              leftPct: 16,
              topPct: 28,
              widthPct: 68,
              heightPct: 40,
              label: '200-LIT-101D → 200-LIT-101E 정정',
              color: 'red',
            },
          ]
        ),
        makePanel(
          'EV-DIA2-S14',
          'CI-000-DIA-0002',
          'H042-CI-000-DIA-0002',
          42,
          'Sheet 14/23 (p.42)',
          'Connection Sheet 14/23: 200-ISJB-005 / 200-LIT-101E (HS0501/0502) 정상 수록',
          { left: 14, top: 14, width: 72, height: 72 },
          [
            {
              leftPct: 10,
              topPct: 50,
              widthPct: 76,
              heightPct: 28,
              label: '정품: 200-ISJB-005 / 200-LIT-101E',
              color: 'blue',
            },
          ]
        ),
      ],
      missingCables: [
        {
          tag: '200-LIT-101E (HS0501/0502)',
          currentState: 'H-05 블록도에 200-LIT-101D / 200-ISJB-004로 복사 오기',
          requiredCableSpec: 'Sheet 14/23 기준 200-ISJB-005 / 200-LIT-101E / HS05xx 정정',
        },
      ],
      queries: [
        '1) Page H-05 Tag(200-LIT-101D) 및 JB(200-ISJB-004)로 복사 오기됨 (connection Sheet 14/23에는 200-ISJB-005 / 200-LIT-101E로 표기).',
      ],
      electricalComments: [
        '[DIA-0002 H-05 (p.24)] 200-ISJB-004 → 200-ISJB-005, 200-LIT-101D → 200-LIT-101E 및 케이블 번호 HS0501/0502로 수정.',
      ],
    },
    {
      id: 'SHEET-12-PSDS-H06-H08',
      sheetNo: 12,
      badgeLabel: '신규 (8)',
      isNewTag: true,
      severity: 'CRITICAL',
      category: 'TAG_CONFLICT',
      targetDiagram: 'H042-CI-000-DIA-0002',
      title: '12. PSDS H-06,7,8 ↔ connection(Sheet 17/23) JB TAG불일치',
      drawingSubtitle:
        '도면 : H042-CI-000-DIA-0002 Rev.B Page H-06, H-07, H-08 (p.25~27) ↔ Sheet 15~17/23 (p.43~45)',
      evidencePanels: [
        makePanel(
          'EV-DIA2-H06',
          'CI-000-DIA-0002',
          'H042-CI-000-DIA-0002',
          25,
          'Page H-06 (p.25)',
          'H-06~08: HP Pump(200번대) 도면임에도 JB명 100-NISJB-001~003 및 100-ZSO/ZSC 오기',
          { left: 10, top: 10, width: 80, height: 78 },
          [
            {
              leftPct: 12,
              topPct: 24,
              widthPct: 76,
              heightPct: 52,
              label: '100-NISJB → 200-NISJB / 100-ZSO → 200-ZSO',
              color: 'red',
            },
          ]
        ),
        makePanel(
          'EV-DIA2-S15',
          'CI-000-DIA-0002',
          'H042-CI-000-DIA-0002',
          43,
          'Sheet 15/23 (p.43)',
          'Sheet 15~17/23 결선표에도 100-ZSO/ZSC-101~102 및 100-NISJB-001 혼선 잔존',
          { left: 14, top: 14, width: 72, height: 72 },
          [
            {
              leftPct: 10,
              topPct: 24,
              widthPct: 76,
              heightPct: 48,
              label: '200-ZSO/ZSC & 200-NISJB 통일 필요',
              color: 'red',
            },
          ]
        ),
      ],
      missingCables: [
        {
          tag: '200-ZSO/ZSC-101~102 · 200-NISJB-001~003',
          currentState: 'H-06~08 및 Sheet 15~17/23에 100-NISJB-001~003 및 100-ZSO/ZSC 오기',
          requiredCableSpec: '200-NISJB-001~003 및 200-ZSO/ZSC-101~102로 일괄 정정',
        },
      ],
      queries: [
        '1) H-06~08 "100-" module code : HP Pump(200번대) 도면임에도 JB명이 100-NISJB-001~003으로 오기.',
        '2) H-06 리미트스위치 Tag도 100-ZSO/ZSC-101, 102(및 서비스명 LNG DRAIN PUMP)로 오기됨.',
        '-> connection(Sheet 14~17/23) 기준으로 H-05(200-ISJB-005 / 200-LIT-101E) 및 H-06~08(200-NISJB-001~003 / 200-ZSO/ZSC) 정정 요청.',
      ],
      electricalComments: [
        '[DIA-0002 H-06~08 & Sheet 15~17/23] JB명 100-NISJB-001~003 → 200-NISJB-001~003, 리미트스위치 100-ZSO/ZSC → 200-ZSO/ZSC 및 서비스명(LNG BOOSTER PUMP) 정정.',
      ],
    },
    {
      id: 'SHEET-13-PSDS-R76',
      sheetNo: 13,
      badgeLabel: '신규 (9)',
      isNewTag: true,
      severity: 'CRITICAL',
      category: 'WD_MISSING',
      targetDiagram: 'H042-CI-000-DIA-0002',
      title: '13. PSDS R76 릴레이 중복 결선 및 W/D 누락',
      drawingSubtitle:
        '도면 : H042-CI-000-DIA-0002 Rev.B Sheet 22/23 (p.50)',
      evidencePanels: [
        makePanel(
          'EV-DIA2-S22-R76',
          'CI-000-DIA-0002',
          'H042-CI-000-DIA-0002',
          50,
          'Sheet 22/23 (p.50)',
          'Sheet 22/23: 200-PMSD-101C, 101D, 101E 3개 신호가 동일 릴레이 R76(11,14)에 3중 중복 및 W/D 누락',
          { left: 14, top: 14, width: 72, height: 72 },
          [
            {
              leftPct: 54,
              topPct: 44,
              widthPct: 38,
              heightPct: 26,
              label: 'R76 3중 중복 (R76/R77/R78 분리)',
              color: 'red',
            },
          ]
        ),
      ],
      missingCables: [
        {
          tag: '200-PMSD-101C / 101D / 101E',
          currentState: 'Relay R76(11,14) 3중 할당 · 해당 페이지 W/D 블록도 누락',
          requiredCableSpec: '101C=R76, 101D=R77, 101E=R78로 분리 및 MCC W/D 시트 신설',
        },
      ],
      queries: [
        '1) PSDS Sheet 22/23 릴레이 R76 3중 중복: 200-PMSD-101C, 101D(100D 오타 포함), 101E가 모두 동일 릴레이 R76(11, 14)에 중복 결선됨 → 101C=R76, 101D=R77, 101E=R78로 수정.',
        '2) 해당 PAGE(Sheet 18~22/23)는 W/D 블록도에 누락됨.',
      ],
      electricalComments: [
        '[DIA-0002 Sheet 22/23 (p.50)] R76 3중 중복을 R76/R77/R78로 분리(200-PMSD-100D→101D 수정)하고, 누락된 MCC 연동 W/D 블록 다이어그램 시트 추가.',
      ],
    },
    {
      id: 'SHEET-14-PSDS-H09-VE',
      sheetNo: 14,
      badgeLabel: '신규 (10)',
      isNewTag: true,
      severity: 'CRITICAL',
      category: 'BLOCK_COPY_ERROR',
      targetDiagram: 'H042-CI-000-DIA-0002',
      title: '14. PSDS R76 릴레이 중복 결선, H-09 진동센서 오기 및 MCC W/D 불일치',
      drawingSubtitle:
        '도면 : H042-CI-000-DIA-0002 Rev.B Page H-09 (p.28) ↔ Sheet 23/23 (p.51)',
      evidencePanels: [
        makePanel(
          'EV-DIA2-H09',
          'CI-000-DIA-0002',
          'H042-CI-000-DIA-0002',
          28,
          'Page H-09 (p.28)',
          'H-09: 5세트 진동센서 전부 200-VE-101A/102A 및 200-VJB-001로 복사 오기',
          { left: 10, top: 10, width: 80, height: 78 },
          [
            {
              leftPct: 12,
              topPct: 22,
              widthPct: 76,
              heightPct: 60,
              label: 'VE-101A~E/102A~E 및 200-VJB-101 정정',
              color: 'red',
            },
          ]
        ),
        makePanel(
          'EV-DIA2-S23',
          'CI-000-DIA-0002',
          'H042-CI-000-DIA-0002',
          51,
          'Sheet 23/23 (p.51)',
          'Sheet 23/23: Vendor Cable CIR.NO 미부여 · Cable Type MC 표기 누락 및 Tag 중복 확인',
          { left: 14, top: 14, width: 72, height: 72 },
          [
            {
              leftPct: 16,
              topPct: 22,
              widthPct: 68,
              heightPct: 54,
              label: 'VENDOR CABLE CIR.NO & TYPE=MC',
              color: 'blue',
            },
          ]
        ),
      ],
      missingCables: [
        {
          tag: '200-VE-101A~E / 102A~E (200-VJB-101)',
          currentState: 'H-09 전부 101A/102A 중복 · JB 200-VJB-001 오기 · Vendor Cable 번호 없음',
          requiredCableSpec: 'A~E 호기 분리, 200-VJB-101 통일, VENDOR CABLE CIR.NO 부여 및 TYPE=MC 표기',
        },
      ],
      queries: [
        '1) PSDS H-09 오기: 5세트 진동센서가 전부 200-VE-101A/102A로 중복 표기(→ A~E 정정), JB명 200-VJB-001(→ 200-VJB-101).',
        '2) VENDOR CABLE은 CIR.NO 부여하고 TYPE은 MC로 표기.',
        '3) Connection(Sheet 23/23)에도 Tag 중복 여부 일괄 수정 요청.',
      ],
      electricalComments: [
        '[DIA-0002 H-09 (p.28) & Sheet 23/23 (p.51)] 진동센서 5세트 호기(A~E) 분리, JB명 200-VJB-101 통일, Vendor Cable CIR.NO 부여 및 Cable Type=MC 표기.',
      ],
    },
    {
      id: 'SHEET-15-WD-MISSING-DIN',
      sheetNo: 15,
      badgeLabel: '신규 (11)',
      isNewTag: true,
      severity: 'CRITICAL',
      category: 'WD_MISSING',
      targetDiagram: 'H042-CI-000-DIA-0001',
      title: '15. W/D 불일치, 누락 (iCAMS Sheet 20~22 · PSDS Sheet 21~22)',
      drawingSubtitle:
        '도면 : H042-CI-000-DIA-0001 Sheet 20~22/22 (p.43~45) ↔ H042-CI-000-DIA-0002 Sheet 21~22/23 (p.49~50)',
      evidencePanels: [
        makePanel(
          'EV-DIA1-MCC-S21',
          'CI-000-DIA-0001',
          'H042-CI-000-DIA-0001',
          44,
          'DIA-0001 Sheet 21/22 (p.44)',
          'iCAMS Sheet 20~22 앞쪽 W/D 도면 누락 · Power W/D(MY12/MY2 RC****) vs C&I 30C(FL-D/FR-E-MCC) 불일치 · DIN 표기 잔존',
          { left: 14, top: 14, width: 72, height: 72 },
          [
            {
              leftPct: 10,
              topPct: 24,
              widthPct: 80,
              heightPct: 48,
              label: 'W/D 도면 누락 · 30C 통합케이블 불일치 · DIN 표기',
              color: 'red',
            },
          ]
        ),
      ],
      missingCables: [
        {
          tag: 'FL-D-100/200-MCC · FR-E-100-MCC',
          currentState: 'iCAMS Sheet 20~22 / PSDS Sheet 21~22 W/D 누락 · DIN 케이블 표기 잔존',
          requiredCableSpec: 'Power W/D ↔ C&I 30C 사양·번호 확정, 조선표준 규격 수정 및 W/D 추가',
        },
      ],
      queries: [
        '1) W/D(Diagram) 누락 및 Power W/D 불일치.',
        '2) iCAMS Sheet 20~22, PSDS Sheet 21~22의 앞쪽 W/D 도면이 누락되었고, Power W/D(EL-000-DIA-0001)의 펌프별 개별 케이블(MY12/MY2 RC****)과 C&I 결선도의 30C 통합케이블(FL-D/FR-E-MCC)이 상호 불일치하며 CABLE TYPE이 여전히 DIN으로 표기됨 -> 사양·번호 확정 및 W/D 추가 요청.',
      ],
      electricalComments: [
        '[DIA-0001 Sheet 20~22 & DIA-0002 Sheet 21~22] Power W/D와 C&I 30C 통합케이블 인터페이스 확정, DIN 표기 → 조선표준(JIS/IEC) 수정 및 누락 W/D 시트 추가.',
      ],
    },
    {
      id: 'SHEET-16-6600V-WORKING',
      sheetNo: 16,
      badgeLabel: '신규 (11-2)',
      isNewTag: true,
      severity: 'CRITICAL',
      category: 'SPEC_MISMATCH',
      targetDiagram: 'H042-EL-000-DIA-0001',
      title: '16. Cable voltage(6600V) 표기수정 및 FOR WORKING 정식 출도',
      drawingSubtitle:
        '도면 : H042-EL-000-DIA-0001_Cable Diagram for Regasfication Package_Rev.ref (요청서 p.17)',
      evidencePanels: [
        makePanel(
          'EV-PDF17-6600V',
          'REQ-REV1-261118',
          'H042-EL-000-DIA-0001',
          17,
          'Rev.ref (요청서 p.17)',
          'Technical Spec(3 x 6,600V, 60Hz, 225kW) 및 Regastainer Cable Diagram 6.6kV 표기 구간',
          { left: 3, top: 19, width: 59, height: 73 },
          []
        ),
      ],
      missingCables: [
        {
          tag: 'EL-000-DIA-0001 (6,600V Regas Motors)',
          currentState: 'Rev.ref 상태로 정식 FOR WORKING 도면 미출도 · 전압별 Cable Type 미반영',
          requiredCableSpec: '6,600V 전압에 맞는 Cable Type 수정, C&I 매칭 및 FOR WORKING 정식 출도',
        },
      ],
      queries: [
        '1) H042-EL-000-DIA-0001_Cable Diagram for Regasfication Package 도면 정식 출도 요청 (FOR WORKING).',
        '2) Cable type을 voltage(3 x 6,600V, 60Hz)에 맞게 수정.',
        '3) C&I 결선도와 매칭 적용 (MY12/MY2 RC**** ↔ C&I 30C 통합케이블 일치).',
      ],
      electricalComments: [
        '[H042-EL-000-DIA-0001] 6,600V 모터 정격에 맞춰 Cable Type 수정 및 C&I 인터페이스 매칭 반영 후 FOR WORKING 도면 정식 출도.',
      ],
    },
    {
      id: 'SHEET-17-300-PID-CONFLICT',
      sheetNo: 17,
      badgeLabel: '신규 분석 (1)',
      isNewTag: true,
      severity: 'CRITICAL',
      category: 'TAG_CONFLICT',
      targetDiagram: 'H042-PR-300-PID-0001',
      title: '17. [모듈 300 추가 검출] Recondenser (300-V-001) P&ID ↔ 결선 리스트 불일치 · FCV-001 TYP.2 누락',
      drawingSubtitle:
        '도면 : H042-PR-300-PID-0001 Rev.D p.10/10 (Editable Markup) ↔ H042-CI-000-DIA-0001 (Sheet 16~19/22) · DIA-0002 (Sheet 18~19/23)',
      evidencePanels: [
        makePanel(
          'EV-300-PID-MARKUP',
          'PR-300-PID-0001',
          'H042-PR-300-PID-0001',
          1,
          'Page 10/10 (Blue Markup)',
          'P&ID 300-V-001 Blue Markup 37건 대조표 (LCV-001/002 불일치, FY-003/PIT-611A~C 누락)',
          { left: 66, top: 42, width: 33, height: 36 },
          [
            {
              leftPct: 6,
              topPct: 12,
              widthPct: 88,
              heightPct: 76,
              label: '37 List Items 대조 결과',
              color: 'blue',
            },
          ]
        ),
        makePanel(
          'EV-300-DIA1-S16',
          'CI-000-DIA-0001',
          'H042-CI-000-DIA-0001',
          39,
          'Sheet 16/22 (p.39)',
          'DIA-0001 Sheet 16/22: 300-LCV-001/LVI-001 표기 및 DAJB-001 HOLD',
          { left: 14, top: 14, width: 72, height: 72 },
          [
            {
              leftPct: 4,
              topPct: 45,
              widthPct: 92,
              heightPct: 14,
              label: '300-LCV-001 (P&ID LCV-002 불일치)',
              color: 'red',
            },
          ]
        ),
      ],
      missingCables: [
        {
          tag: '300-LCV-002 / 300-FCV-001 (TYP.2)',
          currentState: 'LCV-001/002 불일치, FCV-001 TYP.2 Solenoid(FY-003) & Fail-Close LS 누락',
          requiredCableSpec: 'LCV-002 정정, FCV-001 Solenoid/LS 케이블 추가 및 IS-AI-97/98/99 배리어 중복 해소',
        },
      ],
      queries: [
        'List상 "300-LCV-001 / LVI-001"과 P&ID "LCV-002 (TYP.3)" 태그 불일치 및 LVI-002 분리 여부 확인 요청.',
        'P&ID에 없는 "300-FY-003"(DIA-0002 p.47)과 "300-PIT-611A/B/C"(DIA-0002 p.46)의 원천 위치 및 DIA-0001(400-TIT-611A/B/C, Barrier IS-AI-97/98/99 중복) 충돌 확인 요망.',
        'P&ID "FCV-001 (TYP.2)"에 포함된 Solenoid 및 Fail-Close Limit Switch 케이블이 결선 리스트(Sheet 17/22)에 누락됨.',
      ],
      electricalComments: [
        '[DIA-0001 Sheet 16~19/22 ↔ DIA-0002 Sheet 18~19/23] 300-LCV-001→LCV-002 정정, FCV-001 TYP.2 Solenoid/LS 추가, 400-TIT-611 vs 300-PIT-611 및 IS-AI-97 배리어 중복 수정.',
      ],
    },
    {
      id: 'SHEET-18-MARK-BCD-ZSO',
      sheetNo: 18,
      badgeLabel: '신규 분석 (2)',
      isNewTag: true,
      severity: 'CRITICAL',
      category: 'CABLE_MISSING',
      targetDiagram: 'H042-CI-000-DIA-0002',
      title: '18. [추가 검출] SEASTAR Mark B/C/D 케이블 누락·미할당 & 300-SDV ZSO/Vendor HOLD',
      drawingSubtitle:
        '도면 : H042-PD-100-GAR-0001 p.5 (03/07) · PD-200-GAR-0001 p.6 ↔ DIA-0001/0002 Sheet 20/23 (p.48)',
      evidencePanels: [
        makePanel(
          'EV-GAR100-MARKB',
          'PD-100-GAR-0001',
          'H042-PD-100-GAR-0001',
          5,
          'Sheet 03/07 (p.5)',
          'GAR 100 Sheet 03/07: SEASTAR Mark B (CABLE MISSING / NO. T.B.D) 표기 구간',
          { left: 4, top: 8, width: 92, height: 80 },
          [
            {
              leftPct: 18,
              topPct: 24,
              widthPct: 58,
              heightPct: 45,
              label: 'Mark B: SDV-254A / 202A 케이블 누락',
              color: 'red',
            },
          ]
        ),
        makePanel(
          'EV-DIA2-300-S20',
          'CI-000-DIA-0002',
          'H042-CI-000-DIA-0002',
          48,
          'Sheet 20/23 (p.48)',
          'DIA-0002 Sheet 20/23: 300-SDV-001/002/006 Vendor HOLD 및 ZSO 개별 케이블 미표기',
          { left: 14, top: 14, width: 72, height: 72 },
          [
            {
              leftPct: 54,
              topPct: 68,
              widthPct: 42,
              heightPct: 18,
              label: 'FR-I-300-EDJB-002 HOLD & ZSO 누락',
              color: 'red',
            },
          ]
        ),
      ],
      missingCables: [
        {
          tag: '100-SDV-254A/202A (Mark B) · TCV-252A (Mark C) · 300-SDV ZSO',
          currentState: 'Mark B NO. T.B.D / Mark C RC**** 미할당 / 300-ZSO 개별 케이블 미표기',
          requiredCableSpec: '신규 케이블 번호 부여, ZSO/ZSC 4선식 분리 및 Module 300 Vendor HOLD 해제',
        },
      ],
      queries: [
        'GAR 100(03/07) Mark B(100-SDV-254A, 202A, 201A) 필드 케이블이 Cable List에서 누락(NO. T.B.D) 및 Mark C(100-TCV-252A, UV-250A) RC**** 미할당.',
        'Module 300(DAJB-001/002, EAJB-001, EDJB-001/002) 전체 BY VENDOR / HOLD 상태이며 300-ZSO-001~006 케이블이 ZSC와 분리 표기되지 않음.',
        'Mark D(200-HS-111A, 200-PIT-111A) P&ID 단독 태그의 전장 결선 여부 확인 필요.',
      ],
      electricalComments: [
        '[DIA-0001/0002] Mark B 누락 케이블 발행, Mark C RC**** 번호 배정, Module 300 Vendor Cable Spec 확정 및 ZSO/ZSC 4선식 분리 반영.',
      ],
    },
    {
      id: 'SHEET-19-300GD-GAR-TAG',
      sheetNo: 19,
      badgeLabel: '신규 분석 (3)',
      isNewTag: true,
      severity: 'CRITICAL',
      category: 'TAG_CONFLICT',
      targetDiagram: 'H042-EL-100-GAR-0001',
      title: '19. [추가 검출] 300-GDJB-001 중복 · 200-PEIT-111E 오타 & PD-100/200-GAR 장비 태그 오기',
      drawingSubtitle:
        '도면 : H042-CI-000-DIA-0001 Sheet 15/22 (p.38), Sheet 12/22 (p.35) · PD-100-GAR (06/07) · PD-200-GAR (04/07)',
      evidencePanels: [
        makePanel(
          'EV-DIA1-S15-300GD',
          'CI-000-DIA-0001',
          'H042-CI-000-DIA-0001',
          38,
          'Sheet 15/22 (p.38)',
          'DIA-0001 Sheet 15/22 (300-GDJB-001): 100/200-GDJB와 동일 RE0101~0103·RE0110 중복 + Sheet 12/22 PEIT-111E 오타',
          { left: 14, top: 14, width: 72, height: 72 },
          [
            {
              leftPct: 10,
              topPct: 22,
              widthPct: 80,
              heightPct: 52,
              label: '300-GDJB-001 RE0101/RE0110 중복',
              color: 'red',
            },
          ]
        ),
        makePanel(
          'EV-GAR200-110P',
          'PD-200-GAR-0001',
          'H042-PD-200-GAR-0001',
          6,
          'PD-200-GAR Sheet 04/07 (p.6)',
          'PD-200-GAR 200-P-101이 110-P-101로 오기 · PD-100-GAR G.W.Heater 100-E-201A 오기',
          { left: 4, top: 8, width: 92, height: 80 },
          [
            {
              leftPct: 16,
              topPct: 22,
              widthPct: 68,
              heightPct: 54,
              label: '110-P→200-P / E-201A→E-202A 정정',
              color: 'red',
            },
          ]
        ),
      ],
      missingCables: [
        {
          tag: '300-GDJB-001 / 200-PDIT-111E / 100-E-202A / 200-P-101A~E',
          currentState: '300-GDJB RE0101 중복 · PEIT-111E 오타 · GAR 100-E-201A / 110-P-101 오기',
          requiredCableSpec: '300-GDJB 고유 CIR.NO 분리, PDIT-111E 수정, P&ID 기준 GAR 태그 정정',
        },
      ],
      queries: [
        'DIA-0001 Sheet 15/22(300-GDJB-001)가 100/200-GDJB와 동일한 RE0101~0103 및 트렁크 RE0110을 중복 사용함.',
        'DIA-0001 Sheet 12/22에 200-PDIT-111E가 200-PEIT-111E로 오타 표기되고, R-03/04에 P&ID Rev.C 삭제 태그 100-TIT-252A~E가 잔존함.',
        'PD-100-GAR(100-E-201A→100-E-202A) 및 PD-200-GAR(110-P-101→200-P-101) 장비 태그가 P&ID와 불일치함.',
      ],
      electricalComments: [
        '[DIA-0001 & EL/PD-GAR] 300-GDJB-001 회로번호 고유화, 200-PEIT-111E→PDIT-111E 수정, 100-TIT-252A~E SPARE 정리 및 GAR 장비 태그 정정.',
      ],
    },
    {
      id: 'SHEET-20-ADDITIONAL-REQUESTS',
      sheetNo: 20,
      badgeLabel: '신규 (12) · 총괄',
      isNewTag: true,
      slideKind: 'CHECKLIST',
      severity: 'CRITICAL',
      category: 'WD_MISSING',
      targetDiagram: 'H042-COMMON',
      title: '20. 추가 요청사항 (재요청 · 총괄 일정 및 모델링/MAKER 도면)',
      drawingSubtitle:
        '도면 : H042 전 도면 공통 (GAR-0001 · DIA-0001 · DIA-0002 · EL-000-DIA-0001 · MAKER DWG · 3D 모델링)',
      evidencePanels: [],
      missingCables: [],
      queries: [
        '1) H042-CI-000-DIA-0002_Cable Diagram and Connection Drawing for PSDS_RevB 도면 18/23~22/23까지는 W.D에 미반영 -> 반영 요청.',
        '2) W/D 전체 반영하고 CABLE LIST 제공 요망.',
        '3) JB LIST (MAKER DWG) 조속한 확정 요망 (300-DAJB/EAJB/EDJB 포함).',
        '4) 생산도 일정에 맞는 전체 장비 MAKER 도면 제공 혹은 제공 가능 일자 (LIGHTING FIXTURE, VALVE, JB LIST, GD/FD, ETC).',
        '5) GD/FD 위치 반영한 ARR’T 도면 제공 및 C&I/F&G coverage, tag별 설치방향·검지범위 및 장비 표시 (HOLD 해제).',
        '6) GAR-0001에 모든 motor, PB, light, JB, GD/FD를 고유 Tag로 표시하고 elevation 표기 (각 장비 tag ↔ Cable/Equipment/IO/JB 1:1 매칭).',
        '7) H042-EL-000-DIA-0001_Cable Diagram for Regasfication Package 도면 FOR WORKING 도면 출도 요청 + PIPE/선주제출 모델링 Data 및 가이드(shield/IS barrier/gland) 제공.',
      ],
      electricalComments: [
        '[생산설계 총괄] PSDS 18~22/23 W.D 반영, 전체 Cable List & Maker JB List 확정, GD/FD Coverage & EL-100-GAR 고유 Tag/Elevation 반영, EL-000-DIA-0001 FOR WORKING 정식 출도 일정 회신 요청.',
      ],
    },
  ];

  // 3. Dynamically append additional comment sheets from live OCR/Vector rule violations or user pin notes
  const dynamicRuleHits = ruleViolations.filter(
    (v) =>
      v.severity === 'CRITICAL' &&
      ![
        '200-SDV-101',
        '200-PDIT-111E',
        '200-LIT-101E',
        '200-VE-101C',
        '200-PMSD-101D',
        '400-PIT-613A',
        '100-GD-201',
        '100-UV-250A',
        '100-SDV-254A',
        '100-SDV-202A',
        '300-LCV-002',
        '300-FCV-001',
        '300-PIT-611A',
      ].includes(v.tagOrTarget)
  );

  if (dynamicRuleHits.length > 0) {
    const firstHit = dynamicRuleHits[0];
    const targetDw = firstHit.drawingId || 'CI-000-DIA-0001';
    const targetDiag: ElectricalTargetDiagram = targetDw.startsWith('CI-000-DIA-0002')
      ? 'H042-CI-000-DIA-0002'
      : 'H042-CI-000-DIA-0001';
    commentSheets.push({
      id: 'SHEET-DYNAMIC-RULES',
      sheetNo: commentSheets.length + 1,
      badgeLabel: '실물 스캔 추가',
      isNewTag: true,
      severity: 'CRITICAL',
      category: 'TAG_CONFLICT',
      targetDiagram: targetDiag,
      title: `${commentSheets.length + 1}. 도면 실물·OCR 및 사용자 룰 추가 검출 사항 (${dynamicRuleHits.length}건)`,
      drawingSubtitle: `도면 : ${firstHit.drawingId || 'H042 전 도면'} p.${firstHit.pageNum || 1} (자동 스캔·룰 엔진 검출)`,
      evidencePanels: firstHit.drawingId
        ? [
            makePanel(
              'EV-DYNAMIC-1',
              firstHit.drawingId,
              firstHit.drawingId,
              firstHit.pageNum || 1,
              `p.${firstHit.pageNum || 1}`,
              `${firstHit.tagOrTarget} 검출 위치 (${firstHit.ruleCode})`,
              { left: 5, top: 10, width: 90, height: 80 },
              []
            ),
          ]
        : [],
      missingCables: dynamicRuleHits.slice(0, 6).map((h) => ({
        tag: h.tagOrTarget,
        currentState: `${h.ruleCode}: ${h.evidence}`,
        requiredCableSpec: h.recommendation,
      })),
      queries: dynamicRuleHits.slice(0, 5).map((h) => `[${h.tagOrTarget}] ${h.evidence}`),
      electricalComments: dynamicRuleHits
        .slice(0, 5)
        .map((h) => `[${h.drawingId || targetDiag} p.${h.pageNum || 1}] ${h.recommendation}`),
    });
  }

  // Also include user-authored OPEN pin notes if any were added manually
  const userOpenNotes = pinNotes.filter(
    (n) => n.source === 'USER' && n.status !== 'RESOLVED'
  );
  if (userOpenNotes.length > 0) {
    const firstNote = userOpenNotes[0];
    commentSheets.push({
      id: `SHEET-${commentSheets.length + 1}-USER-NOTES`,
      sheetNo: commentSheets.length + 1,
      badgeLabel: '검토자 핀 노트',
      isNewTag: true,
      severity: firstNote.severity,
      category: 'TAG_CONFLICT',
      targetDiagram: firstNote.drawingId.includes('DIA-0002')
        ? 'H042-CI-000-DIA-0002'
        : 'H042-CI-000-DIA-0001',
      title: `${commentSheets.length + 1}. 도면 뷰어 직접 마킹 검토 코멘트 (${userOpenNotes.length}건)`,
      drawingSubtitle: `도면 : ${firstNote.drawingId} PDF p.${firstNote.pageNum} (엔지니어 핀 노트 반영)`,
      evidencePanels: [
        makePanel(
          'EV-USER-NOTE-1',
          firstNote.drawingId,
          firstNote.drawingId,
          firstNote.pageNum,
          `p.${firstNote.pageNum}`,
          `핀 노트 위치 (${firstNote.tagRef}: X:${firstNote.xPct}% Y:${firstNote.yPct}%)`,
          { left: 5, top: 10, width: 90, height: 80 },
          [
            {
              leftPct: Math.max(2, firstNote.xPct - 10),
              topPct: Math.max(2, firstNote.yPct - 8),
              widthPct: 20,
              heightPct: 16,
              label: firstNote.tagRef,
              color: 'red',
            },
          ]
        ),
      ],
      missingCables: userOpenNotes.map((n) => ({
        tag: n.tagRef,
        currentState: `${n.drawingId} p.${n.pageNum} (${n.status})`,
        requiredCableSpec: n.content,
      })),
      queries: userOpenNotes.map((n) => `[${n.tagRef} · ${n.drawingId} p.${n.pageNum}] ${n.content}`),
      electricalComments: userOpenNotes.map(
        (n) => `[${n.drawingId} p.${n.pageNum}] ${n.tagRef}: ${n.content}`
      ),
    });
  }

  // If deep content analysis scanned uploaded custom drawings with universal matches, append summary info
  if (analysisReport && (analysisReport.universalMatches?.length || 0) > 0) {
    const conflicts = (analysisReport.universalMatches || []).filter(
      (m) => m.matchStatus === 'VARIANT_CONFLICT' || m.matchStatus === 'UNRESOLVED_ATTENTION'
    );
    if (conflicts.length > 0) {
      const top = conflicts[0];
      commentSheets.push({
        id: `SHEET-${commentSheets.length + 1}-UNIVERSAL-MATCH`,
        sheetNo: commentSheets.length + 1,
        badgeLabel: '업로드·메이커 분석',
        isNewTag: true,
        severity: top.severity,
        category: 'TAG_CONFLICT',
        targetDiagram: 'H042-CI-000-DIA-0001',
        title: `${commentSheets.length + 1}. 실물 PDF/메이커 도면 교차 매칭 검출 코멘트 (${conflicts.length}건)`,
        drawingSubtitle: `도면 : ${top.primaryJump.drawingId} p.${top.primaryJump.pageNum} 외 ${analysisReport.drawingsAnalyzed}개 도면 스캔`,
        evidencePanels: [
          makePanel(
            'EV-UNIV-1',
            top.primaryJump.drawingId,
            top.primaryJump.drawingId,
            top.primaryJump.pageNum,
            `p.${top.primaryJump.pageNum}`,
            `검출 위치: ${top.displayTag}`,
            { left: 5, top: 10, width: 90, height: 80 },
            []
          ),
        ],
        missingCables: conflicts.slice(0, 6).map((c) => ({
          tag: c.displayTag,
          currentState: c.matchStatus,
          requiredCableSpec: c.summaryKo,
        })),
        queries: conflicts.slice(0, 5).map((c) => `[${c.displayTag}] ${c.summaryKo}`),
        electricalComments: conflicts
          .slice(0, 5)
          .map((c) => `[${c.primaryJump.drawingId} p.${c.primaryJump.pageNum}] ${c.summaryKo}`),
      });
    }
  }

  // 4. Group comments by target Electrical Diagram
  const diagramDefs: Array<{
    diagramNo: ElectricalTargetDiagram;
    diagramTitleKo: string;
  }> = [
    {
      diagramNo: 'H042-CI-000-DIA-0001',
      diagramTitleKo: 'iCAMS 제어·계측 케이블 결선도 (DIA-0001)',
    },
    {
      diagramNo: 'H042-CI-000-DIA-0002',
      diagramTitleKo: 'PSDS 공정긴급차단 케이블 결선도 (DIA-0002)',
    },
    {
      diagramNo: 'H042-EL-000-DIA-0001',
      diagramTitleKo: 'Power Cable Diagram & SLD (6.6kV · EL-000-DIA-0001/0002)',
    },
    {
      diagramNo: 'H042-EL-100-GAR-0001',
      diagramTitleKo: '전장·배관 장비 배치도 (EL-100-GAR · PD-100/200-GAR)',
    },
    {
      diagramNo: 'H042-PR-300-PID-0001',
      diagramTitleKo: '재응축 모듈(300-V-001) P&ID ↔ 전장 연계',
    },
    {
      diagramNo: 'H042-COMMON',
      diagramTitleKo: '생산설계 총괄 (W/D · Cable/JB List · Maker 도면 · 모델링)',
    },
  ];

  const diagramGroups: ElectricalDiagramCommentGroup[] = diagramDefs.map((def) => {
    const matchedSheets = commentSheets.filter((s) => s.targetDiagram === def.diagramNo);
    return {
      diagramNo: def.diagramNo,
      diagramTitleKo: def.diagramTitleKo,
      criticalCount: matchedSheets.filter((s) => s.severity === 'CRITICAL').length,
      warningCount: matchedSheets.filter((s) => s.severity === 'WARNING').length,
      sheetNos: matchedSheets.map((s) => s.sheetNo),
      keyComments: matchedSheets.flatMap((s) => s.electricalComments),
    };
  });

  const cableMissingMarkB = missingCableRows.filter(
    (r) => r.issueType === 'CABLE_MISSING'
  ).length;
  const unassignedOrHoldCount = missingCableRows.filter(
    (r) => r.issueType === 'UNASSIGNED_HOLD'
  ).length;
  const pidOnlyCount = evaluatedLoops.filter((l) => l.status === 'PID_ONLY').length;
  const tagOrBlockErrorCount = evaluatedLoops.filter(
    (l) => l.status === 'CONFLICT' || l.status === 'REVISION_DRIFT'
  ).length;
  const wdMissingCount = missingCableRows.filter(
    (r) => r.issueType === 'WD_MISSING'
  ).length;

  return {
    generatedAt: new Date().toISOString().slice(0, 19).replace('T', ' '),
    projectCode: 'H042',
    summaryCounts: {
      totalMissingOrHoldCables: missingCableRows.length,
      cableMissingMarkB,
      unassignedOrHoldCount,
      pidOnlyCount,
      tagOrBlockErrorCount,
      wdMissingCount,
      totalCommentSheets: commentSheets.length,
      criticalSheets: commentSheets.filter((s) => s.severity === 'CRITICAL').length,
    },
    missingCableRows,
    diagramGroups,
    commentSheets,
  };
}
