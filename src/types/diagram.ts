export type UnitCode = '000' | '100' | '200' | '300' | '400';

export type DiagramDiscipline = 'PID' | 'GAR' | 'ICAMS' | 'PSDS';

export type GarMarkupCode = 'A' | 'B' | 'C' | 'D' | 'E';

export type MatchStatus =
  | 'MATCHED'
  | 'CABLE_MISSING'
  | 'UNASSIGNED_CIRCUIT'
  | 'PID_ONLY'
  | 'CONFLICT'
  | 'REVISION_DRIFT';

export type DiscrepancySeverity = 'CRITICAL' | 'WARNING' | 'INFO';

export interface DrawingDocument {
  id: string;
  drawingNo: string;
  title: string;
  titleKo: string;
  discipline: DiagramDiscipline;
  moduleCode: UnitCode | 'ALL';
  revision: string;
  issueDate: string;
  pageCount: number;
  fileSizeLabel: string;
  pdfUrl: string;
  serverPath: string;
  keyHighlights: string[];
}

export interface PidRecord {
  rawTag: string;
  unitCode: UnitCode;
  equipmentTag: string;
  serviceDescription: string;
  sheet: string;
  lineNo?: string;
  pipeSpec?: string;
  signalCategory: 'ANALOG_TX' | 'SHUTDOWN_VALVE' | 'CONTROL_VALVE' | 'ON_OFF_VALVE' | 'VIBRATION' | 'GAS_DETECTOR' | 'LOCAL_SWITCH' | 'EQUIPMENT';
  pidRevisionNote?: string;
}

export interface GarMarkupRecord {
  tag: string;
  unitCode: UnitCode;
  sheet: string;
  deckLocation: string;
  markupCode: GarMarkupCode;
  markupLabel: string;
  annotatedCableNo?: string;
  annotatedCableType?: string;
  equipmentLabelOnGar?: string;
  note?: string;
}

export interface ElectricalSignalPath {
  system: 'ICAMS' | 'PSDS' | 'ESD_MCC';
  electricalTag: string;
  signalRole: string;
  blockSheet: string;
  connectionSheet: string;
  fieldCableNo: string;
  fieldCableSpec: string;
  junctionBox: string;
  jbTerminal?: string;
  trunkCableNo: string;
  trunkCableSpec?: string;
  rackRoomCabinet: string;
  cabinetTerminalOrBarrier?: string;
  blockDiagramTagNote?: string;
  blockDiagramJbNote?: string;
  blockDiagramCableNote?: string;
}

export interface DiscrepancyItem {
  id: string;
  severity: DiscrepancySeverity;
  category:
    | 'UNIT_CODE_MISMATCH'
    | 'TAG_TYPO'
    | 'DUPLICATE_TAG_OR_RELAY'
    | 'CABLE_MISSING'
    | 'UNASSIGNED_CIRCUIT'
    | 'REVISION_DRIFT'
    | 'JB_NAMING_CONFLICT'
    | 'EQUIPMENT_TAG_MISMATCH'
    | 'PID_ONLY_UNWIRED';
  title: string;
  description: string;
  affectedDrawings: string[];
  recommendedAction: string;
}

export interface DiagramLoopEntry {
  id: string;
  canonicalTag: string;
  unitCode: UnitCode;
  moduleName: string;
  equipmentTag: string;
  serviceName: string;
  pid: PidRecord;
  gar?: GarMarkupRecord;
  electricalPaths: ElectricalSignalPath[];
  knownDiscrepancies?: DiscrepancyItem[];
}

export interface EvaluatedLoopMatch extends DiagramLoopEntry {
  status: MatchStatus;
  statusLabelKo: string;
  discrepancies: DiscrepancyItem[];
  completenessScore: number;
  primaryCableNo: string;
  primaryJunctionBox: string;
  primarySystem: string;
}

export interface ParallelBatchSummary {
  totalLoops: number;
  matchedCount: number;
  cableMissingCount: number;
  unassignedCircuitCount: number;
  pidOnlyCount: number;
  conflictCount: number;
  revisionDriftCount: number;
  criticalIssuesCount: number;
  warningIssuesCount: number;
  matchRatePercent: number;
  batchDurationMs: number;
  workerPartitionCount: number;
  moduleBreakdown: Array<{
    unitCode: UnitCode;
    moduleName: string;
    total: number;
    matched: number;
    issues: number;
  }>;
}

export interface ParallelAuditTrackResult {
  trackId: string;
  trackName: string;
  moduleCode: string;
  drawingIds: string[];
  status: 'COMPLETED' | 'ERROR';
  durationMs: number;
  thoughtSummary?: string;
  summaryKo?: string;
  findings?: Array<{
    tag: string;
    severity: DiscrepancySeverity;
    category: string;
    finding: string;
    sourceEvidence: string;
    recommendation: string;
  }>;
  error?: string;
}

export interface ParallelAnalyzeResponse {
  model: string;
  thinkingLevel: string;
  totalDurationMs: number;
  tracks: ParallelAuditTrackResult[];
}

export interface CustomPdfAttachment {
  name: string;
  role: 'PIPING' | 'ELECTRICAL';
  base64Data: string;
}

export type DiffPairScope =
  | 'PID_VS_GAR'
  | 'PID_VS_DIA'
  | 'BLOCK_VS_CONNECTION'
  | 'REVISION_VS_ACTIVE';

export type DiffChangeKind = 'CHANGED' | 'MISSING_TARGET' | 'ORPHAN_TARGET' | 'DUPLICATE_COLLISION';

export interface DiffFieldDelta {
  fieldLabel: string;
  leftSourceLabel: string;
  leftValue: string;
  rightSourceLabel: string;
  rightValue: string;
}

export interface CrossLayerDiffItem {
  id: string;
  loopId: string;
  canonicalTag: string;
  unitCode: UnitCode;
  scope: DiffPairScope;
  scopeLabelKo: string;
  changeKind: DiffChangeKind;
  severity: DiscrepancySeverity;
  title: string;
  summary: string;
  deltas: DiffFieldDelta[];
  leftJump?: { drawingId: string; pageNum: number; label: string };
  rightJump?: { drawingId: string; pageNum: number; label: string };
  recommendedFix: string;
}

export interface CustomDiffPairResult {
  tag: string;
  status: 'MATCHED' | 'VALUE_DIFF' | 'MISSING_IN_ELECTRICAL' | 'MISSING_IN_PIPING';
  pipingLine?: string;
  electricalLine?: string;
  pipingCable?: string;
  electricalCable?: string;
  pipingJb?: string;
  electricalJb?: string;
  detail: string;
}

export type NoteStatus = 'OPEN' | 'IN_REVIEW' | 'RESOLVED';

export interface DrawingPinNote {
  id: string;
  drawingId: string;
  pageNum: number;
  xPct: number;
  yPct: number;
  tagRef: string;
  severity: DiscrepancySeverity;
  status: NoteStatus;
  author: string;
  content: string;
  createdAt: string;
  source?: 'SEED_DIFF' | 'AUTO_LOCATE' | 'USER';
}

export type ExtractedEntityKind =
  | 'TAG'
  | 'CABLE'
  | 'JUNCTION_BOX'
  | 'LINE_NO'
  | 'EQUIPMENT'
  | 'HOLD_OR_NOTE'
  | 'REVISION';

export interface ExtractedPdfEntity {
  id: string;
  drawingId: string;
  pageNum: number;
  kind: ExtractedEntityKind;
  text: string;
  normalized: string;
  rawContext: string;
  xPct: number;
  yPct: number;
  source: 'VECTOR' | 'OCR';
  confidence?: number;
}

export interface PdfPageContentSummary {
  drawingId: string;
  pageNum: number;
  vectorTextCount: number;
  needsOcrRecommended: boolean;
  sheetHint?: string;
  entities: ExtractedPdfEntity[];
  rawSnippet: string;
}

export interface CrossDrawingEntityPresence {
  normalized: string;
  kind: ExtractedEntityKind;
  appearances: Array<{
    drawingId: string;
    pageNum: number;
    rawText: string;
    xPct: number;
    yPct: number;
    source: 'VECTOR' | 'OCR';
  }>;
  drawingCount: number;
  hasAttentionFlag: boolean;
}

export type DrawingDocumentClass =
  | 'PID'
  | 'GAR_LAYOUT'
  | 'ELECTRICAL_DIA'
  | 'CABLE_SCHEDULE'
  | 'MAKER_DRAWING'
  | 'UNKNOWN';

export interface DrawingDocumentProfile {
  drawingId: string;
  displayName: string;
  docClass: DrawingDocumentClass;
  docClassLabelKo: string;
  pageCount: number;
  equipmentCount: number;
  cableCount: number;
  tagCount: number;
  jbCount: number;
  isMakerDrawing: boolean;
  detectedVendorHint?: string;
}

export type EquipmentCategory =
  | 'PUMP'
  | 'HEAT_EXCHANGER'
  | 'VESSEL_TANK'
  | 'COMPRESSOR'
  | 'MOTOR'
  | 'PANEL_SKID'
  | 'VALVE_ACTUATOR'
  | 'OTHER';

export interface ExtractedEquipmentRecord {
  id: string;
  drawingId: string;
  pageNum: number;
  tag: string;
  normalizedTag: string;
  category: EquipmentCategory;
  ratingSpec: string;
  description: string;
  xPct: number;
  yPct: number;
  source: 'VECTOR' | 'OCR';
}

export type CableSignalCategory =
  | 'POWER'
  | 'CONTROL'
  | 'INSTRUMENT_IS'
  | 'COMM_BUS'
  | 'UNASSIGNED';

export interface ExtractedCableRecord {
  id: string;
  drawingId: string;
  pageNum: number;
  cableNo: string;
  normalizedCableNo: string;
  cableSpec: string;
  signalCategory: CableSignalCategory;
  fromEndpoint: string;
  toEndpoint: string;
  xPct: number;
  yPct: number;
  source: 'VECTOR' | 'OCR';
}

export interface MakerInterfacePoint {
  id: string;
  drawingId: string;
  pageNum: number;
  terminalOrPin: string;
  ioType: 'AI' | 'AO' | 'DI' | 'DO' | 'POWER' | 'COMM' | 'INTERLOCK';
  signalDetail: string;
  yardTagRef?: string;
  makerTagRef?: string;
  scopeOwner: 'BY_YARD' | 'BY_MAKER' | 'INTERFACE' | 'UNSPECIFIED';
  rawContext: string;
  xPct: number;
  yPct: number;
}

export interface MakerDrawingProfile {
  drawingId: string;
  displayName: string;
  docClass: DrawingDocumentClass;
  isMakerDrawing: boolean;
  vendorOrPackageHint: string;
  powerSpecs: string[];
  signalStandards: string[];
  yardToMakerMappings: Array<{
    yardTag: string;
    makerTag: string;
    pageNum: number;
    context: string;
    xPct: number;
    yPct: number;
  }>;
  interfacePoints: MakerInterfacePoint[];
  scopeNotes: Array<{
    owner: 'BY_YARD' | 'BY_MAKER' | 'INTERFACE' | 'HOLD';
    text: string;
    pageNum: number;
    xPct: number;
    yPct: number;
  }>;
}

export type UniversalMatchStatus =
  | 'CROSS_MATCHED'
  | 'SINGLE_DRAWING_ONLY'
  | 'VARIANT_CONFLICT'
  | 'UNRESOLVED_ATTENTION';

export interface UniversalDiagramMatchItem {
  id: string;
  coreKey: string;
  displayTag: string;
  entityCategory: 'INSTRUMENT_TAG' | 'EQUIPMENT' | 'CABLE' | 'JUNCTION_BOX' | 'MAKER_INTERFACE';
  matchStatus: UniversalMatchStatus;
  severity: DiscrepancySeverity;
  pidOrLayoutDrawings: string[];
  electricalOrCableDrawings: string[];
  makerDrawings: string[];
  variantsFound: string[];
  linkedCableNos: string[];
  linkedEquipment: string[];
  summaryKo: string;
  primaryJump: {
    drawingId: string;
    pageNum: number;
    rawText: string;
    xPct: number;
    yPct: number;
  };
}

export interface DrawingContentAnalysisReport {
  totalDurationMs: number;
  drawingsAnalyzed: number;
  pagesScanned: number;
  pages: PdfPageContentSummary[];
  entities: ExtractedPdfEntity[];
  entityCountsByKind: Record<ExtractedEntityKind, number>;
  crossDrawingPresence: CrossDrawingEntityPresence[];
  documentProfiles?: DrawingDocumentProfile[];
  equipmentRecords?: ExtractedEquipmentRecord[];
  cableRecords?: ExtractedCableRecord[];
  makerProfiles?: MakerDrawingProfile[];
  universalMatches?: UniversalDiagramMatchItem[];
}

export interface OcrWordBox {
  text: string;
  confidence: number;
  xPct: number;
  yPct: number;
  leftPct: number;
  topPct: number;
  widthPct: number;
  heightPct: number;
}

export type OcrScanZone =
  | 'FULL_PAGE'
  | 'TOP_LEFT'
  | 'TOP_RIGHT'
  | 'BOTTOM_LEFT'
  | 'BOTTOM_RIGHT'
  | 'TITLE_BLOCK';

export interface OcrPageResult {
  drawingId: string;
  pageNum: number;
  zone: OcrScanZone;
  durationMs: number;
  averageConfidence: number;
  fullText: string;
  previewDataUrl: string;
  words: OcrWordBox[];
  extractedEntities: ExtractedPdfEntity[];
}

export interface VerificationRule {
  id: string;
  code: string;
  nameKo: string;
  category: string;
  descriptionKo: string;
  checkScope: 'LOOP_CROSS_CHECK' | 'PDF_CONTENT_SCAN' | 'HYBRID';
  defaultSeverity: DiscrepancySeverity;
  enabled: boolean;
  isCustom?: boolean;
  customRegex?: string;
}

export interface RuleViolationHit {
  id: string;
  ruleId: string;
  ruleCode: string;
  ruleNameKo: string;
  severity: DiscrepancySeverity;
  tagOrTarget: string;
  drawingId?: string;
  pageNum?: number;
  xPct?: number;
  yPct?: number;
  evidence: string;
  recommendation: string;
  source: 'MODEL' | 'VECTOR_PDF' | 'OCR';
}

export type DrawingChangeType = 'ADDED' | 'REMOVED' | 'MODIFIED' | 'UNCHANGED';

export interface DrawingChangeOccurrence {
  pageNum: number;
  rawText: string;
  xPct: number;
  yPct: number;
  source: 'VECTOR' | 'OCR';
}

export interface DrawingChangeItem {
  id: string;
  normalizedKey: string;
  kind: ExtractedEntityKind;
  changeType: DrawingChangeType;
  severity: DiscrepancySeverity;
  leftOccurrences: DrawingChangeOccurrence[];
  rightOccurrences: DrawingChangeOccurrence[];
  detailKo: string;
}

export interface DrawingChangeComparison {
  leftDrawingId: string;
  leftDocLabel: string;
  rightDrawingId: string;
  rightDocLabel: string;
  durationMs: number;
  summary: {
    added: number;
    removed: number;
    modified: number;
    unchanged: number;
  };
  items: DrawingChangeItem[];
}

export type SpecDiscipline =
  | 'ELECTRICAL_CABLE'
  | 'INSTRUMENT_EX'
  | 'MECHANICAL_PROCESS'
  | 'MAKER_PACKAGE';

export type SpecComplianceStatus = 'PASS' | 'NON_COMPLIANT' | 'HOLD_REQUIRED';

export interface SpecCheckItem {
  id: string;
  specCode: string;
  discipline: SpecDiscipline;
  disciplineLabelKo: string;
  titleKo: string;
  standardRequired: string;
  observedDrawingState: string;
  status: SpecComplianceStatus;
  severity: DiscrepancySeverity;
  affectedTags: string[];
  evidenceRef: string;
  drawingId: string;
  pageNum: number;
  recommendationKo: string;
  matchedLearnedRuleIds: string[];
  posClauseSuggestion: string;
}

export interface SpecReviewReport {
  checks: SpecCheckItem[];
  summary: {
    total: number;
    passed: number;
    nonCompliant: number;
    holdRequired: number;
    complianceRatePct: number;
  };
}

export type LearnedRuleCategory =
  | 'CABLE_SPEC'
  | 'TAG_NAMING'
  | 'MAKER_SCOPE'
  | 'SAFETY_EX'
  | 'DRAWING_RULE';

export interface LearnedEngineeringRule {
  id: string;
  code: string;
  category: LearnedRuleCategory;
  categoryLabelKo: string;
  titleKo: string;
  patternOrCondition: string;
  learnedLessonKo: string;
  posRequirementClause: string;
  severity: DiscrepancySeverity;
  tCodeOrigin: string;
  appliedCount: number;
  enabled: boolean;
  source: 'SYSTEM_LEARNED' | 'USER_LEARNED';
  createdAt: string;
}

export type PosPackageId =
  | 'POS-300-PKG'
  | 'POS-VALVE-PKG'
  | 'POS-EL-CABLE'
  | 'POS-INST-TX'
  | 'POS-UPLOADED-PKG';

export interface PosLineItem {
  itemNo: string;
  materialCode: string;
  tagRef: string;
  description: string;
  qty: number;
  unit: 'EA' | 'SET' | 'LOT' | 'M';
  technicalSpec: string;
  drawingRef: string;
  specStatus: SpecComplianceStatus;
  appliedRuleNote?: string;
  isCustom?: boolean;
}

export interface PosScopeSplitRow {
  area: string;
  yardScope: string;
  makerScope: string;
  interfaceBoundary: string;
}

export interface PurchaseOrderSpecDoc {
  posNo: string;
  packageId: PosPackageId;
  packageTitleKo: string;
  prNo: string;
  sapMaterialGroup: string;
  targetModule: string;
  vendorName: string;
  revision: string;
  createdDate: string;
  readinessStatus: 'RELEASE_READY' | 'HOLD_PENDING';
  readinessSummaryKo: string;
  lineItems: PosLineItem[];
  scopeMatrix: PosScopeSplitRow[];
  learnedClauses: Array<{
    ruleCode: string;
    titleKo: string;
    clauseText: string;
    origin: string;
  }>;
  openHoldConditions: Array<{
    specCode: string;
    severity: DiscrepancySeverity;
    titleKo: string;
    requiredAction: string;
    evidenceRef: string;
  }>;
  sourceStats: {
    loopsEvaluated: number;
    makerProfilesCount: number;
    specChecksTotal: number;
    learnedRulesApplied: number;
  };
}
