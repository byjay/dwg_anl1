import type { WorkbenchTab } from '../components/TopBar';
import {
  DrawingContentAnalysisReport,
  DrawingPinNote,
  EvaluatedLoopMatch,
  LearnedEngineeringRule,
  ParallelAnalyzeResponse,
  RuleViolationHit,
  SpecReviewReport,
} from '../types/diagram';
import { verifyCitationGuardrail } from './engineeringCalculators';

export type DirectiveStatus = 'IMPLEMENTED' | 'PARTIAL' | 'PLANNED';

export interface MasterDirectiveItem {
  id: number;
  code: string;
  domainId: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
  domainTitle: string;
  title: string;
  standardRef: string;
  baseStatus: DirectiveStatus;
  status: DirectiveStatus;
  implementationNote: string;
  evidenceModule: string;
  targetTab?: WorkbenchTab;
}

export interface MasterChecklistSummary {
  total: number;
  implementedCount: number;
  partialCount: number;
  plannedCount: number;
  appliedPct: number;
  domainBreakdown: Array<{
    domainId: number;
    domainTitle: string;
    total: number;
    implemented: number;
    partial: number;
    planned: number;
  }>;
  citationGroundingPct: number;
}

export interface MasterChecklistContext {
  evaluatedLoops: EvaluatedLoopMatch[];
  learnedRules: LearnedEngineeringRule[];
  ruleViolations: RuleViolationHit[];
  pinNotes: DrawingPinNote[];
  specReport: SpecReviewReport;
  analysisReport: DrawingContentAnalysisReport | null;
  aiResult: ParallelAnalyzeResponse | null;
}

export const MASTER_DOMAINS: Array<{ id: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9; title: string; range: string }> = [
  { id: 1, title: '1. 기반 아키텍처·영속성·게이트웨이', range: '01~11' },
  { id: 2, title: '2. 도면 파싱·OCR·토폴로지·Diff', range: '12~22' },
  { id: 3, title: '3. 데이터 모델·DEXPI·Tag·단위 정규화', range: '23~33' },
  { id: 4, title: '4. 배관(Piping) 엔지니어링 검증', range: '34~44' },
  { id: 5, title: '5. 전기·계장(E&I)·방폭 검증', range: '45~55' },
  { id: 6, title: '6. 스펙 검토·근거 가드레일·HITL', range: '56~66' },
  { id: 7, title: '7. POS 자동생성·발주패키지(VDRL/TBE)', range: '67~77' },
  { id: 8, title: '8. 메이커 도면·배터리 리밋·CRS', range: '78~88' },
  { id: 9, title: '9. Living Guide·Eval·보안·로드맵', range: '89~99' },
];

type RawDirectiveSeed = Omit<MasterDirectiveItem, 'code' | 'domainTitle' | 'status'>;

const RAW_DIRECTIVES: RawDirectiveSeed[] = [
  // 영역 1 (01~11)
  { id: 1, domainId: 1, title: 'README.md 전면 재작성 및 아키텍처 문서화', standardRef: 'Docs / Onboarding', baseStatus: 'IMPLEMENTED', implementationNote: '루트 README.md에 SAP T-Code 구조, 엔진, 보안 및 실행 절차 반영', evidenceModule: 'README.md', targetTab: 'checklist' },
  { id: 2, domainId: 1, title: '대형 도면·스펙 분석 모듈 계층 분리', standardRef: 'Modular TS', baseStatus: 'IMPLEMENTED', implementationNote: 'src/utils/* 순수 엔진과 src/components/* UI를 13개 T-Code 모듈로 분리', evidenceModule: 'src/utils/* · src/components/*', targetTab: 'matrix' },
  { id: 3, domainId: 1, title: '브라우저 localStorage 한계 → 서버 DB(PostgreSQL/Prisma) 전환', standardRef: 'PostgreSQL / Prisma', baseStatus: 'PARTIAL', implementationNote: '현재 핀노트·학습규칙 localStorage 영속화 구현; PostgreSQL 전환은 로드맵 Phase 1 반영', evidenceModule: 'src/data/h042NotesSeed.ts · docs/ROADMAP.md', targetTab: 'checklist' },
  { id: 4, domainId: 1, title: '객체 스토리지(S3/MinIO) 도면 리비전 아카이브', standardRef: 'S3 / MinIO', baseStatus: 'PLANNED', implementationNote: '현행 public/assets 정적 서빙 + FileReader 업로드 지원; S3/MinIO는 Phase 1 로드맵', evidenceModule: 'server.ts · docs/ROADMAP.md', targetTab: 'pdf' },
  { id: 5, domainId: 1, title: '백엔드 Python(FastAPI) CAD/OCR/Graph 전처리 워커 분리', standardRef: 'FastAPI / Worker', baseStatus: 'PARTIAL', implementationNote: 'Express + Node TS 서버(/api/analyze-parallel, /api/health) 가동 중; Python 워커는 Phase 2 분리', evidenceModule: 'server.ts', targetTab: 'ai' },
  { id: 6, domainId: 1, title: '비동기 작업 큐(BullMQ/Celery) 및 진행률 스트리밍', standardRef: 'SSE / Queue', baseStatus: 'PARTIAL', implementationNote: '프론트 Promise.all 병렬 스캔 + 진행률 UI 구현; 분산 작업큐는 Phase 2 로드맵', evidenceModule: 'src/utils/diagramMatcher.ts', targetTab: 'drawing-ocr' },
  { id: 7, domainId: 1, title: 'RBAC 프로젝트·공종별 접근 제어 및 Audit Log', standardRef: 'Keycloak / RBAC', baseStatus: 'PLANNED', implementationNote: '단일 엔지니어 워크벤치 모드; OIDC/RBAC 및 불변 감사 로그는 Phase 4 로드맵', evidenceModule: 'docs/ROADMAP.md', targetTab: 'checklist' },
  { id: 8, domainId: 1, title: 'API Rate Limiting · Timeout · 429 Exponential Backoff', standardRef: 'Resilience', baseStatus: 'PARTIAL', implementationNote: '서버 입력 검증·에러 JSON 정규화·CORS 적용; Redis 기반 분산 Rate Limit은 Phase 1 반영', evidenceModule: 'server.ts', targetTab: 'ai' },
  { id: 9, domainId: 1, title: '모델 게이트웨이 추상화 및 헬스/모델 설정 노출', standardRef: 'LLM Gateway', baseStatus: 'IMPLEMENTED', implementationNote: '/api/health에서 모델·Thinking·카탈로그·Citation Guardrail 상태 공개 및 모델 선택 지원', evidenceModule: 'server.ts · ParallelAiVerifier.tsx', targetTab: 'ai' },
  { id: 10, domainId: 1, title: '컨테이너화(Docker Compose) 및 원클릭 온프레미스 배포', standardRef: 'Docker / IaC', baseStatus: 'PLANNED', implementationNote: 'AI Studio 단일 컨테이너 실행 중; Multi-container Docker Compose는 Phase 1 로드맵', evidenceModule: 'docs/ROADMAP.md', targetTab: 'checklist' },
  { id: 11, domainId: 1, title: '대용량 업로드 PDF 텍스트·이미지 캐싱 및 재사용', standardRef: 'Vector Cache', baseStatus: 'IMPLEMENTED', implementationNote: 'extractedEntities 상태 캐시 및 CV03N→CC03/ZRL1/QM02 교차 재사용 적용', evidenceModule: 'src/App.tsx · DrawingOcrAnalyzer.tsx', targetTab: 'drawing-ocr' },

  // 영역 2 (12~22)
  { id: 12, domainId: 2, title: 'PDF 벡터 좌표(xPct/yPct) 직접 추출 및 Multi-Span 매칭', standardRef: 'pdfjs-dist', baseStatus: 'IMPLEMENTED', implementationNote: 'extractPdfTextBoxesFromPage 및 분할 태그(PDIT+111E) 결합 좌표 탐색 구현', evidenceModule: 'src/utils/pdfLocator.ts', targetTab: 'pdf' },
  { id: 13, domainId: 2, title: 'AI 검출 텍스트 영역 반투명 캔버스 하이라이트 오버레이', standardRef: 'Canvas Overlay', baseStatus: 'IMPLEMENTED', implementationNote: 'SplitPdfViewer PDF 캔버스 위 AI/로컬스캔/규칙 검출 반투명 박스 오버레이 및 클릭 포커스 구현', evidenceModule: 'src/components/SplitPdfViewer.tsx · pdfLocator.ts', targetTab: 'pdf' },
  { id: 14, domainId: 2, title: '다중 PDF 페이지 고해상도 스냅샷 렌더링 및 보고서 삽입', standardRef: 'pdfSnapshotRenderer', baseStatus: 'IMPLEMENTED', implementationNote: 'PDF 원본 도면 스냅샷을 캡처하여 첨부 보고서 양식(QM02)에 자동 삽입', evidenceModule: 'src/utils/pdfSnapshotRenderer.ts', targetTab: 'comments' },
  { id: 15, domainId: 2, title: '스캔/래스터 도면 다각도 OCR (Tesseract.js 회전·전처리)', standardRef: 'Tesseract.js', baseStatus: 'IMPLEMENTED', implementationNote: '브라우저 내 Tesseract OCR 파이프라인 및 추출 엔티티 규칙 자동 등록 지원', evidenceModule: 'src/utils/ocrAnalyzer.ts', targetTab: 'drawing-ocr' },
  { id: 16, domainId: 2, title: 'DXF / DWG / Smart P&ID XML 네이티브 벡터 파서', standardRef: 'ezdxf / IFC', baseStatus: 'PLANNED', implementationNote: '현재 PDF 벡터/OCR 지원; 네이티브 CAD(DXF/DWG) 직접 파서는 Phase 2 로드맵', evidenceModule: 'docs/ROADMAP.md', targetTab: 'drawing-ocr' },
  { id: 17, domainId: 2, title: 'P&ID 심볼 객체 탐지(밸브/계기/리듀서/스펙브레이크 CV)', standardRef: 'YOLOv8 / CV', baseStatus: 'PARTIAL', implementationNote: '텍스트·루프 패턴 기반 자동 태거 및 블록 심볼 추출 적용; CV 모델 학습은 Phase 2', evidenceModule: 'src/utils/autoTagger.ts', targetTab: 'drawing-ocr' },
  { id: 18, domainId: 2, title: '배관-케이블 선분 연결성 토폴로지 그래프(Graph DB)', standardRef: 'D3 / Graph', baseStatus: 'IMPLEMENTED', implementationNote: 'P&ID→GAR→JB→Cabinet 방향성 토폴로지 그래프 및 ParallelMatchVisualizer 구축', evidenceModule: 'src/utils/diagramGraphBuilder.ts', targetTab: 'trace' },
  { id: 19, domainId: 2, title: '고밀도 도면 타일링(Slicing + Overlap) 누락 방지 추론', standardRef: 'Tiling Inference', baseStatus: 'PARTIAL', implementationNote: '페이지/트랙 단위 분할 병렬 스캔 구현; 이미지 타일 오버랩 크롭은 Phase 2 로드맵', evidenceModule: 'src/utils/localPdfAudit.ts', targetTab: 'ai' },
  { id: 20, domainId: 2, title: '도면 Title Block · Revision Table · Cable Schedule 표 추출', standardRef: 'Table Parser', baseStatus: 'IMPLEMENTED', implementationNote: 'universalDrawingAnalyzer 및 drawingContentAnalyzer로 테이블·Rev·Tag·Cable 자동 파싱', evidenceModule: 'src/utils/universalDrawingAnalyzer.ts', targetTab: 'drawing-ocr' },
  { id: 21, domainId: 2, title: 'Cross-Layer & Revision Diff 엔진 (CC03)', standardRef: 'Diff Engine', baseStatus: 'IMPLEMENTED', implementationNote: 'P&ID vs GAR vs DIA vs Revision 4-Layer 차이 자동 검출 및 좌우 PDF 동시 이동', evidenceModule: 'src/utils/diffEngine.ts · DiffCheckWorkspace.tsx', targetTab: 'diff' },
  { id: 22, domainId: 2, title: '실시간 도면 포인터 공유 세션 (BroadcastChannel + Ping)', standardRef: 'BroadcastChannel', baseStatus: 'IMPLEMENTED', implementationNote: 'SplitPdfViewer 내 다중 탭 실시간 포인터 동기화, 시뮬레이션 피어, Shift+Ping 지원', evidenceModule: 'src/utils/sharedSessionSync.ts', targetTab: 'pdf' },

  // 영역 3 (23~33)
  { id: 23, domainId: 3, title: 'DEXPI 2.0.1 / CFIHOS 표준 토폴로지 JSON 익스포터', standardRef: 'DEXPI 2.0.1 / CFIHOS', baseStatus: 'IMPLEMENTED', implementationNote: 'engineeringCalculators.ts 내 exportDexpiSummaryJson 및 ZCL99 다운로드 구현', evidenceModule: 'src/utils/engineeringCalculators.ts', targetTab: 'checklist' },
  { id: 24, domainId: 3, title: '가변 프로젝트 Tag/Line Grammar 정규식·사전 설정', standardRef: 'Tag Grammar', baseStatus: 'IMPLEMENTED', implementationNote: 'parseConfigurableLineNumber 및 autoTagger 가변 태그 문법 파서 적용', evidenceModule: 'src/utils/engineeringCalculators.ts · autoTagger.ts', targetTab: 'checklist' },
  { id: 25, domainId: 3, title: 'SI 단위 정규화 및 교차 표준 변환기 (bar/psi/°C/DN/mm²)', standardRef: 'SI / ASME / IEC', baseStatus: 'IMPLEMENTED', implementationNote: 'convertEngineeringUnit 순수 계산기(압력·온도·동력·관경·도체단면적) 및 단위테스트 완료', evidenceModule: 'src/utils/engineeringCalculators.ts', targetTab: 'checklist' },
  { id: 26, domainId: 3, title: 'P&ID ↔ Line List ↔ Valve List ↔ Cable Schedule N-Way 조인', standardRef: '3-Way + N-Way', baseStatus: 'IMPLEMENTED', implementationNote: 'P&ID·GAR·iCAMS/PSDS·업로드 도면 다중 교차 매칭 매트릭스 및 Sunburst 시각화', evidenceModule: 'src/utils/diagramMatcher.ts · CrossMatchMatrix.tsx', targetTab: 'matrix' },
  { id: 27, domainId: 3, title: 'CFIHOS Master Tag Register(MTR) 정합성 레지스트리', standardRef: 'CFIHOS RDL', baseStatus: 'PARTIAL', implementationNote: 'H042 마스터 루프 레지스트리(36+ 루프) 및 canonicalTag 정규화 구축', evidenceModule: 'src/data/h042Dataset.ts', targetTab: 'matrix' },
  { id: 28, domainId: 3, title: '다중 계층(Module → Loop → Tag → Terminal) 계층형 ID 체계', standardRef: 'ISO 14224', baseStatus: 'IMPLEMENTED', implementationNote: '000/100/200/300/400 모듈·루프·JB·단자대·캐비닛 추적 뷰어 구현', evidenceModule: 'src/components/LoopTraceInspector.tsx', targetTab: 'trace' },
  { id: 29, domainId: 3, title: '엔티티 변경 영향도 전파(Impact Analysis) 추적', standardRef: 'Dependency Graph', baseStatus: 'PARTIAL', implementationNote: 'Diff·Rule·Comment·Spec 간 연결 추적; Graph DB 기반 N-Hop 자동 전파는 Phase 3', evidenceModule: 'src/utils/electricalCommentEngine.ts', targetTab: 'comments' },
  { id: 30, domainId: 3, title: '리비전 드래프트(Rev.C vs Rev.D / Rev1) 시계열 추적', standardRef: 'Revision Control', baseStatus: 'IMPLEMENTED', implementationNote: 'REVISION_DRIFT 자동 분류 및 삭제 태그 잔존(100-TIT-252A 등) 검출', evidenceModule: 'src/utils/diagramMatcher.ts', targetTab: 'diff' },
  { id: 31, domainId: 3, title: '유닛 코드 불일치(100 vs 200 vs 300) 자동 충돌 감지', standardRef: 'Unit Conflict Rule', baseStatus: 'IMPLEMENTED', implementationNote: '200-SDY-101 ↔ 100-ZSO/ZSC-101 및 100-NISJB-001 충돌 자동 검출', evidenceModule: 'src/utils/verificationRules.ts', targetTab: 'rules' },
  { id: 32, domainId: 3, title: '중복 릴레이·중복 태그(RL0113, TI 131B) 충돌 검사기', standardRef: 'Uniqueness Check', baseStatus: 'IMPLEMENTED', implementationNote: 'DUPLICATE_TAG_OR_RELAY 규칙 및 결선표/블록도 중복 주소 감지', evidenceModule: 'src/utils/verificationRules.ts', targetTab: 'rules' },
  { id: 33, domainId: 3, title: 'PDF 업로드 동적 엔티티 자동 인덱싱 파이프라인', standardRef: 'Dynamic Indexer', baseStatus: 'IMPLEMENTED', implementationNote: 'universalDrawingAnalyzer로 사용자 업로드 도면 자동 분류 및 룰/스펙/POS 즉시 반영', evidenceModule: 'src/utils/universalDrawingAnalyzer.ts', targetTab: 'drawing-ocr' },

  // 영역 4 (34~44)
  { id: 34, domainId: 4, title: '배관 재질 사양(PMS) DB 기반 Line Class 검증', standardRef: 'PMS / ASTM', baseStatus: 'IMPLEMENTED', implementationNote: '1GA(150#), 3EA(300#), ZEA(600# 극저온) PMS 테이블 구축 및 검증', evidenceModule: 'src/utils/engineeringCalculators.ts', targetTab: 'checklist' },
  { id: 35, domainId: 4, title: 'ASME B31.3 압력-온도(P-T) 정격 자동 계산 검증', standardRef: 'ASME B31.3', baseStatus: 'IMPLEMENTED', implementationNote: 'checkB313PressureTemp 계산기 및 설계압력/극저온(-163°C) 여유율 검사 구현', evidenceModule: 'src/utils/engineeringCalculators.ts', targetTab: 'checklist' },
  { id: 36, domainId: 4, title: '배관 Spec Break · Rating Break 경계 불일치 감지', standardRef: 'Spec Break', baseStatus: 'PARTIAL', implementationNote: '라인 번호·스펙 코드 추출 및 ZEA-C80/1GA 비교 규칙 탑재; CAD 그래픽 연결 검사는 Phase 2', evidenceModule: 'src/utils/specReviewEngine.ts', targetTab: 'spec' },
  { id: 37, domainId: 4, title: '극저온(-163°C LNG) 밸브 Extended Bonnet 및 재질 확인', standardRef: 'BS 6364 / Cryogenic', baseStatus: 'IMPLEMENTED', implementationNote: '300-FCV-001 / SDV 극저온 Extended Bonnet 스펙 검토 및 POS 자동 반영', evidenceModule: 'src/utils/posGeneratorEngine.ts', targetTab: 'pos' },
  { id: 38, domainId: 4, title: '제어/차단 밸브 Fail-Safe(FC/FO) · SOV · Limit Switch 정합', standardRef: 'ISA / P&ID', baseStatus: 'IMPLEMENTED', implementationNote: 'LRN-002(TYP.2 Solenoid/LS) 및 LRN-003(4선식 ZSO/ZSC) 규칙 엔진 연동', evidenceModule: 'src/utils/learnedKnowledgeEngine.ts', targetTab: 'knowledge' },
  { id: 39, domainId: 4, title: 'PSV / RD 안전밸브 Set Pressure · MAWP · Blowdown 교차 체크', standardRef: 'API 520 / 521', baseStatus: 'PARTIAL', implementationNote: 'PSV 태그 추출 및 스펙 검토 항목 포함; 유체역학/배압 계산은 Phase 3 로드맵', evidenceModule: 'src/utils/specReviewEngine.ts', targetTab: 'spec' },
  { id: 40, domainId: 4, title: '배관 보온(Insulation: C80/H/P) 및 히트 트레이싱 누락 검토', standardRef: 'Insulation Spec', baseStatus: 'PARTIAL', implementationNote: '라인 번호 내 C80/N 보온 코드 파싱 및 E-201A/E-202A 히터 연동 체크 구현', evidenceModule: 'src/utils/engineeringCalculators.ts', targetTab: 'spec' },
  { id: 41, domainId: 4, title: '펌프/압축기 주변 NPSH·유량계 직관부(Straight Run) 체크', standardRef: 'Process Layout', baseStatus: 'PLANNED', implementationNote: '3D/배관 등각도(ISO) 연계 직관부 거리 검증은 Phase 3 로드맵', evidenceModule: 'docs/ROADMAP.md', targetTab: 'checklist' },
  { id: 42, domainId: 4, title: 'Tie-In(TP) 포인트 및 Battery Limit 배관 플랜지 호환성', standardRef: 'ASME B16.5', baseStatus: 'IMPLEMENTED', implementationNote: '메이커 패키지(300-V-001 등) 경계 Scope Split 및 스펙 검증 지원', evidenceModule: 'src/components/MakerAnalysisWorkspace.tsx', targetTab: 'maker' },
  { id: 43, domainId: 4, title: '벤트(Vent)·드레인(Drain)·퍼지(N2 Purge) 유틸리티 연결 확인', standardRef: 'IGC Code / Piping', baseStatus: 'PARTIAL', implementationNote: 'Unit 400 유틸리티 및 질소 퍼지 태그(400-*) 매칭 매트릭스 포함', evidenceModule: 'src/data/h042Dataset.ts', targetTab: 'matrix' },
  { id: 44, domainId: 4, title: '장비 태그 ↔ 배관 도면 상호 오타(110-P-101A, E-201A) 검출', standardRef: 'Cross-Doc Audit', baseStatus: 'IMPLEMENTED', implementationNote: 'PD-100/200-GAR-0001 장비명 오타 자동 감지 및 핀 노트 좌표 매핑', evidenceModule: 'src/utils/localPdfAudit.ts', targetTab: 'ai' },

  // 영역 5 (45~55)
  { id: 45, domainId: 5, title: '단선도(SLD) ↔ C&I 결선도(30C Multi-Core) 인터페이스 검증', standardRef: 'IEC 60617 / SLD', baseStatus: 'IMPLEMENTED', implementationNote: 'SPEC-EL-002(30C 제어케이블 및 DIN 심볼 표준 통일) 검사 구현', evidenceModule: 'src/utils/specReviewEngine.ts', targetTab: 'spec' },
  { id: 46, domainId: 5, title: '케이블 허용전류(Ampacity) 및 주위온도 디레이팅 검증', standardRef: 'IEC 60092-352', baseStatus: 'IMPLEMENTED', implementationNote: 'calculateCableVoltageDrop 내 45°C 초과 디레이팅 및 허용전류 부하율 계산', evidenceModule: 'src/utils/engineeringCalculators.ts', targetTab: 'checklist' },
  { id: 47, domainId: 5, title: '단락 전류(Short-Circuit) 및 차단기(ACB/MCCB) 정격 검토', standardRef: 'IEC 60909 / 61363', baseStatus: 'PLANNED', implementationNote: '고조파/단락계산(ETAP 연동형)은 Phase 3 전기 해석 로드맵', evidenceModule: 'docs/ROADMAP.md', targetTab: 'checklist' },
  { id: 48, domainId: 5, title: '전압강하(Voltage Drop ΔV%) 및 6.6kV 고압 케이블 등급(6/10kV) 확인', standardRef: 'IEC 61892-6 / 60092-354', baseStatus: 'IMPLEMENTED', implementationNote: 'SPEC-EL-001(6/10kV CJPF/SC) 검증 + 3상/단상 ΔV% 실시간 계산기 제공', evidenceModule: 'src/utils/engineeringCalculators.ts · specReviewEngine.ts', targetTab: 'checklist' },
  { id: 49, domainId: 5, title: '전장 장비 배치도(EL-100-GAR) Tag · Cable · Elevation 누락 검증', standardRef: 'EL GAR Spec', baseStatus: 'IMPLEMENTED', implementationNote: 'SPEC-EL-004 및 첨부 보고서 Sheet로 EL-100-GAR 누락 일괄 코멘트화', evidenceModule: 'src/utils/electricalCommentEngine.ts', targetTab: 'comments' },
  { id: 50, domainId: 5, title: 'JB(ISJB/NISJB/GDJB/EDJB) 단자대 용량(80P vs 40P) 검증', standardRef: 'JB Terminal Sizing', baseStatus: 'IMPLEMENTED', implementationNote: '200-EDJB-001 80P→40P 사양 최적화 및 20% Spare 규칙(LRN-005) 검증', evidenceModule: 'src/utils/learnedKnowledgeEngine.ts', targetTab: 'knowledge' },
  { id: 51, domainId: 5, title: '케이블 트레이·전선관(Conduit) Fill Rate 및 IS/Non-IS 분리', standardRef: 'IEC 60092-352', baseStatus: 'PARTIAL', implementationNote: 'ISJB vs NISJB 물리적 분리 및 케이블 형명(L-MPYCYS-27) 일치 규칙 적용', evidenceModule: 'src/utils/verificationRules.ts', targetTab: 'rules' },
  { id: 52, domainId: 5, title: '본질안전(IS: Ex ia/Ex ib) 루프 파라미터(Uo/Io/Po/Co/Lo) 검증', standardRef: 'IEC 60079-11', baseStatus: 'IMPLEMENTED', implementationNote: 'verifyIntrinsicSafetyLoop(배리어 vs 현장계기 + 케이블 Cc/Lc) 실시간 계산·검증기 구현', evidenceModule: 'src/utils/engineeringCalculators.ts', targetTab: 'checklist' },
  { id: 53, domainId: 5, title: '위험지역(Zone 0/1/2, Gas Group IIC T4) 방폭 등급 적합성 체크', standardRef: 'IEC 60079-14', baseStatus: 'PARTIAL', implementationNote: 'POS/스펙 검토에서 Ex ia IIC T4 등급 확인; Zone Map 도면 오버레이는 Phase 3', evidenceModule: 'src/utils/specReviewEngine.ts', targetTab: 'spec' },
  { id: 54, domainId: 5, title: '비상정지(ESD/SIS) 루프 SIL 및 Cause & Effect(C&E) Matrix 검증', standardRef: 'IEC 61511 / PSDS', baseStatus: 'PARTIAL', implementationNote: 'PSDS(DIA-0002) 2oo3/SDV 루프 추적 및 Solenoid/ZSO/ZSC 검증 구현; C&E 매트릭스 편집은 Phase 3', evidenceModule: 'src/utils/diagramMatcher.ts', targetTab: 'trace' },
  { id: 55, domainId: 5, title: 'GAR Mark B/C 케이블 누락(CABLE MISSING) 및 홀드 자동 집계', standardRef: 'Cable Missing Audit', baseStatus: 'IMPLEMENTED', implementationNote: '100-SDV-254A/202A/201A 등 누락·미할당 케이블 전수 리스트업 및 코멘트 자동 생성', evidenceModule: 'src/utils/electricalCommentEngine.ts', targetTab: 'comments' },

  // 영역 6 (56~66)
  { id: 56, domainId: 6, title: '프로젝트 스펙 조항(Clause) 구조화 파싱 및 항목별 매핑', standardRef: 'Spec Matrix', baseStatus: 'IMPLEMENTED', implementationNote: 'CL03 스펙 검토 워크스페이스에서 공종별 조항-도면 실측-권고사항 매핑 제공', evidenceModule: 'src/components/SpecReviewWorkspace.tsx', targetTab: 'spec' },
  { id: 57, domainId: 6, title: 'AI 검색 증강 생성(RAG) 기반 사내 표준·선급 스펙 질의', standardRef: 'Vector RAG', baseStatus: 'PARTIAL', implementationNote: 'Gemini 컨텍스트 + 학습된 지식베이스(ZP01) 결합; Qdrant 하이브리드 RAG는 Phase 2', evidenceModule: 'server.ts · LearnedKnowledgeWorkspace.tsx', targetTab: 'knowledge' },
  { id: 58, domainId: 6, title: '단독 AI 판단 금지 — 룰 엔진 + 스펙 + AI 3중 하이브리드 판정', standardRef: 'Hybrid Engine', baseStatus: 'IMPLEMENTED', implementationNote: '결정론적 Diff/Rule 엔진(ZRL1) + 스펙엔진(CL03) + 병렬 AI(ZAI1) 3중 교차 검증', evidenceModule: 'src/App.tsx', targetTab: 'rules' },
  { id: 59, domainId: 6, title: '심각도 분류(CRITICAL / WARNING / INFO) 및 Hold Point 판정', standardRef: 'Severity Policy', baseStatus: 'IMPLEMENTED', implementationNote: '전 모듈 통일 심각도 체계 및 severitySummary 집계 + D3 Sunburst 반영', evidenceModule: 'src/utils/severitySummary.ts', targetTab: 'matrix' },
  { id: 60, domainId: 6, title: '사용자 정의 엔지니어링 룰 CRUD 및 즉시 재평가', standardRef: 'ZRL1 Rule Builder', baseStatus: 'IMPLEMENTED', implementationNote: 'ZRL1에서 커스텀 검증 룰 추가/활성화/심각도 변경/삭제 및 즉시 위반 재계산', evidenceModule: 'src/components/RuleReviewWorkspace.tsx', targetTab: 'rules' },
  { id: 61, domainId: 6, title: 'Citation Guardrail (도면·시트·조항 근거 없는 AI 답변 차단/표시)', standardRef: 'Citation Guardrail', baseStatus: 'IMPLEMENTED', implementationNote: 'verifyCitationGuardrail 및 AUDIT_RESPONSE_SCHEMA textRegions/pageHint 강제', evidenceModule: 'src/utils/engineeringCalculators.ts · server.ts', targetTab: 'checklist' },
  { id: 62, domainId: 6, title: 'Human-in-the-Loop(HITL) 학습 지식베이스(ZP01) 승격', standardRef: 'HITL Learning', baseStatus: 'IMPLEMENTED', implementationNote: '도면·스펙·메이커 분석 이슈를 1클릭으로 학습 룰(LRN-*)로 승격하여 재사용', evidenceModule: 'src/utils/learnedKnowledgeEngine.ts', targetTab: 'knowledge' },
  { id: 63, domainId: 6, title: 'Spec Deviation / Waiver 예외 승인 워크플로우', standardRef: 'Waiver / TQ', baseStatus: 'PARTIAL', implementationNote: '핀 노트 OPEN/IN_REVIEW/RESOLVED 및 POS Hold Point 관리; 정식 전자결재는 Phase 4', evidenceModule: 'src/components/SplitPdfViewer.tsx', targetTab: 'pdf' },
  { id: 64, domainId: 6, title: '다중 PDF 동시 스펙 감사(배관 + 전장 + 케이블스케줄)', standardRef: 'Multi-Doc Audit', baseStatus: 'IMPLEMENTED', implementationNote: '업로드 도면 다중 첨부 후 CV03N/CL03/ZAI1 통합 분석 수행', evidenceModule: 'src/components/DrawingOcrAnalyzer.tsx', targetTab: 'drawing-ocr' },
  { id: 65, domainId: 6, title: '첨부 보고서 양식 기반 전기 다이어그램 코멘트 자동 생성(QM02)', standardRef: 'QM02 Report Form', baseStatus: 'IMPLEMENTED', implementationNote: 'H042 요청건 Rev1 양식과 동일한 그림·근거페이지·액션 플랜 HTML 보고서 자동 생성', evidenceModule: 'src/components/ElectricalCommentReportWorkspace.tsx', targetTab: 'comments' },
  { id: 66, domainId: 6, title: '항목별 HTML 보고서 분리 내보내기 및 인쇄 최적화', standardRef: 'HTML Export', baseStatus: 'IMPLEMENTED', implementationNote: '전체 보고서·항목별 HTML 내보내기(templateReportHtmlExporter / htmlReportExporter) 구현', evidenceModule: 'src/utils/templateReportHtmlExporter.ts', targetTab: 'comments' },

  // 영역 7 (67~77)
  { id: 67, domainId: 7, title: 'POS(Purchase Order Specification) 요구사항 트리 및 패키지 템플릿', standardRef: 'ME21N POS', baseStatus: 'IMPLEMENTED', implementationNote: '300 Recondenser, Valve, EL Cable, Instrument, Dynamic Uploaded 5종 패키지 POS 생성', evidenceModule: 'src/utils/posGeneratorEngine.ts', targetTab: 'pos' },
  { id: 68, domainId: 7, title: '발주자(Yard) vs 공급사(Maker) Scope Split 매트릭스 자동 생성', standardRef: 'Scope Split', baseStatus: 'IMPLEMENTED', implementationNote: 'POS 내 Scope of Supply 분계표(Yard vs Maker) 자동 편성', evidenceModule: 'src/components/PosGeneratorWorkspace.tsx', targetTab: 'pos' },
  { id: 69, domainId: 7, title: '학습된 지식·스펙 검토 결과의 POS 특기조항 자동 반영', standardRef: 'Spec→POS Sync', baseStatus: 'IMPLEMENTED', implementationNote: 'LRN-* 규칙과 CL03 부적합 사항이 ME21N POS 라인아이템·주의사항에 실시간 주입', evidenceModule: 'src/utils/posGeneratorEngine.ts', targetTab: 'pos' },
  { id: 70, domainId: 7, title: 'VDRL (Vendor Document Requirement List) 필수 제출도서 목록', standardRef: 'VDRL Standard', baseStatus: 'PARTIAL', implementationNote: 'POS 문서 내 벤더 제출 요구사항 반영; 상호작용형 VDRL 일정 트래커는 Phase 3', evidenceModule: 'src/utils/posGeneratorEngine.ts', targetTab: 'pos' },
  { id: 71, domainId: 7, title: 'ITP (Inspection & Test Plan) · FAT/SAT 입회 기준 연동', standardRef: 'ITP / QA', baseStatus: 'PARTIAL', implementationNote: 'POS 품질·검사 조항 내 FAT/선급 입회 조건 포함; 상세 ITP 체크시트는 Phase 3', evidenceModule: 'src/components/PosGeneratorWorkspace.tsx', targetTab: 'pos' },
  { id: 72, domainId: 7, title: 'TBE (Technical Bid Evaluation) 다중 벤더 기술평가표', standardRef: 'TBE Matrix', baseStatus: 'PLANNED', implementationNote: '벤더 견적 PDF 다중 비교 점수표(TBE)는 Phase 4 조달 고도화 로드맵', evidenceModule: 'docs/ROADMAP.md', targetTab: 'pos' },
  { id: 73, domainId: 7, title: 'POS 자재코드(Material Code) · 수량 · 단위 자동 집계', standardRef: 'SAP MM Mapping', baseStatus: 'IMPLEMENTED', implementationNote: 'SAP 아이템번호(0010~), 자재코드, 수량, SET/M 단위 및 CSV/HTML 내보내기 지원', evidenceModule: 'src/components/PosGeneratorWorkspace.tsx', targetTab: 'pos' },
  { id: 74, domainId: 7, title: 'TQ (Technical Query) / Deviation Request 자동 초안 생성', standardRef: 'TQ Workflow', baseStatus: 'PARTIAL', implementationNote: '코멘트 보고서(QM02)에서 미결 이슈별 질의·조치 문안 자동 생성 지원', evidenceModule: 'src/utils/electricalCommentEngine.ts', targetTab: 'comments' },
  { id: 75, domainId: 7, title: 'POS 발주 전 Spec Hold Gate(미해결 CRITICAL 차단 경고)', standardRef: 'Release Gate', baseStatus: 'IMPLEMENTED', implementationNote: 'CL03 HOLD_REQUIRED 건이 남아있을 경우 ME21N POS 상단에 발주 홀드 경고 표시', evidenceModule: 'src/components/PosGeneratorWorkspace.tsx', targetTab: 'pos' },
  { id: 76, domainId: 7, title: '업로드 도면 기반 동적 POS 패키지 자동 생성(POS-UPLOADED-PKG)', standardRef: 'Dynamic POS', baseStatus: 'IMPLEMENTED', implementationNote: '신규 PDF 업로드 즉시 태그·장비를 추출해 맞춤형 POS 라인아이템 생성', evidenceModule: 'src/utils/posGeneratorEngine.ts', targetTab: 'pos' },
  { id: 77, domainId: 7, title: 'POS HTML/인쇄용 발주사양서 원클릭 출력', standardRef: 'Printable POS', baseStatus: 'IMPLEMENTED', implementationNote: 'SAP 구매사양서 양식 HTML 내보내기 및 인쇄 스타일 적용', evidenceModule: 'src/components/PosGeneratorWorkspace.tsx', targetTab: 'pos' },

  // 영역 8 (78~88)
  { id: 78, domainId: 8, title: '메이커 패키지(300-V-001 Recondenser 등) 도면 전용 분석(CS15)', standardRef: 'Maker Review', baseStatus: 'IMPLEMENTED', implementationNote: 'CS15 워크스페이스에서 메이커 경계, 밸브/계기 I/O, Vendor JB 정합성 집중 분석', evidenceModule: 'src/components/MakerAnalysisWorkspace.tsx', targetTab: 'maker' },
  { id: 79, domainId: 8, title: 'Battery Limit 3자 검증 (P&ID ↔ Yard DIA ↔ Maker I/O List)', standardRef: '3-Way Battery Limit', baseStatus: 'IMPLEMENTED', implementationNote: '메이커 JB(300-ISJB-V01 등)와 Yard iCAMS/PSDS 간 단자·신호타입 대조 검증', evidenceModule: 'src/components/MakerAnalysisWorkspace.tsx', targetTab: 'maker' },
  { id: 80, domainId: 8, title: '벤더 코멘트 회신 시트(CRS: Comment Resolution Sheet) 관리', standardRef: 'CRS Tracking', baseStatus: 'PARTIAL', implementationNote: '핀 노트·QM02 코멘트 시트로 이슈 추적; 벤더 회신 라운드(Rev.A/B/C) 비교는 Phase 3', evidenceModule: 'src/components/ElectricalCommentReportWorkspace.tsx', targetTab: 'comments' },
  { id: 81, domainId: 8, title: '재제출 도면 Back-Check(이전 코멘트 반영 여부 자동 대조)', standardRef: 'Back-Check', baseStatus: 'PARTIAL', implementationNote: 'CC03 Diff 및 로컬 스캔으로 태그 정정 여부 재확인 가능; 자동 코멘트 클로징은 Phase 3', evidenceModule: 'src/components/DiffCheckWorkspace.tsx', targetTab: 'diff' },
  { id: 82, domainId: 8, title: '메이커 도면 승인 코드(Code 1/2/3/4) 판정 지원', standardRef: 'Approval Code', baseStatus: 'PARTIAL', implementationNote: '이슈 심각도 기반 Hold/Conditional 추천 제공; 공식 승인 코드 워크플로우는 Phase 4', evidenceModule: 'src/components/MakerAnalysisWorkspace.tsx', targetTab: 'maker' },
  { id: 83, domainId: 8, title: '메이커 I/O 신호(AI/AO/DI/DO/MODBUS) 및 전원 분배 확인', standardRef: 'I/O Schedule', baseStatus: 'IMPLEMENTED', implementationNote: '300-FCV-001(AO+AI+SOV+LS) 등 복합 I/O 채널 및 24VDC 전원 정합 체크', evidenceModule: 'src/components/MakerAnalysisWorkspace.tsx', targetTab: 'maker' },
  { id: 84, domainId: 8, title: '메이커 이슈 → 학습 규칙(MAKER_SCOPE) 즉시 승격', standardRef: 'Maker Learning', baseStatus: 'IMPLEMENTED', implementationNote: 'CS15에서 발견된 메이커 경계 누락 패턴을 ZP01 규칙으로 즉시 학습 저장', evidenceModule: 'src/App.tsx · MakerAnalysisWorkspace.tsx', targetTab: 'maker' },
  { id: 85, domainId: 8, title: '벤더 패키지 업로드 PDF 자동 역할 분류(MAKER_VENDOR)', standardRef: 'Auto Classifier', baseStatus: 'IMPLEMENTED', implementationNote: 'universalDrawingAnalyzer가 업로드 도면을 메이커/배관/전장/케이블표로 자동 판별', evidenceModule: 'src/utils/universalDrawingAnalyzer.ts', targetTab: 'drawing-ocr' },
  { id: 86, domainId: 8, title: '300-LCV-002 / 001 태그 불일치 및 명판 각인 검증', standardRef: 'Nameplate Check', baseStatus: 'IMPLEMENTED', implementationNote: 'LRN-006 적용으로 P&ID Rev.D 기준 명판·POS·결선표 태그 일치 검증', evidenceModule: 'src/utils/posGeneratorEngine.ts', targetTab: 'pos' },
  { id: 87, domainId: 8, title: '메이커 패키지 24V/220V 제어전원 및 UPS 백업 요건 확인', standardRef: 'Control Power', baseStatus: 'PARTIAL', implementationNote: 'PSDS/iCAMS 캐비닛 전원 및 30C 케이블 체크 포함; 부하표 자동 합산은 Phase 3', evidenceModule: 'src/utils/specReviewEngine.ts', targetTab: 'spec' },
  { id: 88, domainId: 8, title: '메이커 도면 원본 PDF ↔ 코멘트 스냅샷 나란히 대조', standardRef: 'Split Canvas', baseStatus: 'IMPLEMENTED', implementationNote: 'CV04N 분할 뷰어로 배관/메이커(좌) ↔ 전장(우) 원본 PDF 동시 비교', evidenceModule: 'src/components/SplitPdfViewer.tsx', targetTab: 'pdf' },

  // 영역 9 (89~99)
  { id: 89, domainId: 9, title: 'Living Design Guide 허브 및 공종별 설계 표준 레퍼런스', standardRef: 'ZCL99 Living Guide', baseStatus: 'IMPLEMENTED', implementationNote: 'ZCL99 워크스페이스에 1~99 실시간 체크리스트 + 표준 공식·공학 계산기 통합', evidenceModule: 'src/components/ChecklistReportWorkspace.tsx', targetTab: 'checklist' },
  { id: 90, domainId: 9, title: 'SAP Easy Access T-Code 내비게이션 및 워크플로우 5단계 통합', standardRef: 'SAP GUI UX', baseStatus: 'IMPLEMENTED', implementationNote: 'TopBar T-Code 실행창 + SapSidebar 5단계 파이프라인 + 13개 전문 모듈 통합', evidenceModule: 'src/components/TopBar.tsx · SapSidebar.tsx', targetTab: 'matrix' },
  { id: 91, domainId: 9, title: 'D3 Sunburst 매칭률·불일치 대시보드 시각화', standardRef: 'D3.js v7', baseStatus: 'IMPLEMENTED', implementationNote: 'CrossMatchMatrix 내 D3 썬버스트 차트 및 모듈별 심각도 분포 시각화', evidenceModule: 'src/components/CrossMatchMatrix.tsx', targetTab: 'matrix' },
  { id: 92, domainId: 9, title: '단일 루프 시그널 트레이스(P&ID→GAR→Cable→JB→Cabinet) 토폴로지', standardRef: 'Loop Inspector', baseStatus: 'IMPLEMENTED', implementationNote: 'VA03 워크스페이스에서 아이콘·케이블 기반 간략 다이어그램 및 세부 경로 추적', evidenceModule: 'src/components/LoopTraceInspector.tsx', targetTab: 'trace' },
  { id: 93, domainId: 9, title: '엔지니어링 도메인 단위 테스트 스위트(node:test)', standardRef: 'node:test + tsx', baseStatus: 'IMPLEMENTED', implementationNote: '매칭/Diff/좌표/세션/공유/그래프/계산기/체크리스트 전 모듈 자동화 단위 테스트 구축', evidenceModule: 'src/utils/*.test.ts', targetTab: 'checklist' },
  { id: 94, domainId: 9, title: '실제 브라우저(Playwright) E2E 시각·기능·콘솔 무결성 검증', standardRef: 'Playwright E2E', baseStatus: 'IMPLEMENTED', implementationNote: '데스크탑(1440px)·모바일(390px) 렌더링, Canvas 오버레이, 상호작용 및 0에러 검증', evidenceModule: 'Playwright Verification', targetTab: 'pdf' },
  { id: 95, domainId: 9, title: 'AI 골든 데이터셋 Eval Suite (Precision/Recall/Hallucination 측정)', standardRef: 'AI Eval Harness', baseStatus: 'PARTIAL', implementationNote: 'H042 검증된 36+ 불일치 골든셋 보유 및 Citation 점검; 자동 LLM 벤치마크 러너는 Phase 4', evidenceModule: 'src/data/h042Dataset.ts', targetTab: 'ai' },
  { id: 96, domainId: 9, title: '프롬프트 인젝션·XSS·시크릿 노출 방어 및 보안 하드닝', standardRef: 'OWASP / Secure', baseStatus: 'IMPLEMENTED', implementationNote: '서버 측 GEMINI_API_KEY 격리, UI API키 입력폼 배제, 안전 React 바인딩 적용', evidenceModule: 'server.ts', targetTab: 'checklist' },
  { id: 97, domainId: 9, title: '다국어(한/영 엔지니어링 용어) 동시 검색 및 정규화', standardRef: 'KO/EN Bilingual', baseStatus: 'IMPLEMENTED', implementationNote: '한국어 공종 라벨과 영문 국제규격 태그(Tag/Line/Cable) 통합 검색 및 보고서 생성', evidenceModule: 'src/utils/diagramMatcher.ts', targetTab: 'matrix' },
  { id: 98, domainId: 9, title: '체크리스트 1~99 진행률 리포트 HTML/CSV 원클릭 내보내기', standardRef: 'ZCL99 Export', baseStatus: 'IMPLEMENTED', implementationNote: '전체 99항목 적용현황·근거·사용자 검증 서명 포함 HTML/CSV 보고서 다운로드', evidenceModule: 'src/utils/masterChecklistEngine.ts', targetTab: 'checklist' },
  { id: 99, domainId: 9, title: '4단계(16주) 고도화 로드맵 및 KPI 게이트 문서화', standardRef: 'docs/ROADMAP.md', baseStatus: 'IMPLEMENTED', implementationNote: 'docs/ROADMAP.md에 Phase 1~4 아키텍처 전환 및 정량 KPI 게이트 수록', evidenceModule: 'docs/ROADMAP.md', targetTab: 'checklist' },
];

export function evaluateMasterChecklist(
  ctx: MasterChecklistContext
): {
  items: MasterDirectiveItem[];
  summary: MasterChecklistSummary;
} {
  const citationAudit = ctx.aiResult
    ? verifyCitationGuardrail(ctx.aiResult.tracks)
    : { totalFindings: 0, groundedCount: 0, ungroundedCount: 0, groundingRatePct: 100, ungroundedTags: [] };

  const items: MasterDirectiveItem[] = RAW_DIRECTIVES.map((raw) => {
    const domainMeta = MASTER_DOMAINS.find((d) => d.id === raw.domainId)!;
    let note = raw.implementationNote;

    if (raw.id === 11 && ctx.analysisReport) {
      note = `${raw.implementationNote} (현재 ${ctx.analysisReport.entities.length}개 엔티티 캐싱됨)`;
    } else if (raw.id === 26) {
      note = `${raw.implementationNote} (활성 루프 ${ctx.evaluatedLoops.length}건 평가 완료)`;
    } else if (raw.id === 60) {
      note = `${raw.implementationNote} (현재 규칙 위반 ${ctx.ruleViolations.length}건 감지)`;
    } else if (raw.id === 61 && ctx.aiResult) {
      note = `${raw.implementationNote} (AI 근거율 ${citationAudit.groundingRatePct}% · ${citationAudit.groundedCount}/${citationAudit.totalFindings})`;
    } else if (raw.id === 62) {
      note = `${raw.implementationNote} (활성 학습 규칙 ${ctx.learnedRules.filter((r) => r.enabled).length}건)`;
    } else if (raw.id === 63) {
      const openPins = ctx.pinNotes.filter((p) => p.status !== 'RESOLVED').length;
      note = `${raw.implementationNote} (미해결 핀 ${openPins}건 / 전체 ${ctx.pinNotes.length}건)`;
    } else if (raw.id === 56) {
      note = `${raw.implementationNote} (PASS ${ctx.specReport.summary.passed} · FAIL ${ctx.specReport.summary.nonCompliant} · HOLD ${ctx.specReport.summary.holdRequired})`;
    }

    return {
      ...raw,
      code: `ENG-${String(raw.id).padStart(2, '0')}`,
      domainTitle: domainMeta.title,
      status: raw.baseStatus,
      implementationNote: note,
    };
  });

  const implementedCount = items.filter((i) => i.status === 'IMPLEMENTED').length;
  const partialCount = items.filter((i) => i.status === 'PARTIAL').length;
  const plannedCount = items.filter((i) => i.status === 'PLANNED').length;
  const appliedPct = Math.round(((implementedCount + partialCount * 0.5) / items.length) * 100);

  const domainBreakdown = MASTER_DOMAINS.map((dom) => {
    const sub = items.filter((i) => i.domainId === dom.id);
    return {
      domainId: dom.id,
      domainTitle: dom.title,
      total: sub.length,
      implemented: sub.filter((s) => s.status === 'IMPLEMENTED').length,
      partial: sub.filter((s) => s.status === 'PARTIAL').length,
      planned: sub.filter((s) => s.status === 'PLANNED').length,
    };
  });

  return {
    items,
    summary: {
      total: items.length,
      implementedCount,
      partialCount,
      plannedCount,
      appliedPct,
      domainBreakdown,
      citationGroundingPct: citationAudit.groundingRatePct,
    },
  };
}

function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function exportChecklistCsv(
  items: MasterDirectiveItem[],
  verifiedIds: Record<number, boolean>
): string {
  const header = [
    'No',
    'Code',
    'Domain',
    'Directive Title',
    'Standard/Tech',
    'Status',
    'Engineer Verified',
    'Evidence Module',
    'Implementation Note',
  ];
  const rows = items.map((item) => [
    String(item.id),
    item.code,
    item.domainTitle,
    item.title,
    item.standardRef,
    item.status,
    verifiedIds[item.id] ? 'VERIFIED' : 'PENDING',
    item.evidenceModule,
    item.implementationNote,
  ]);
  return [header, ...rows]
    .map((cols) => cols.map((c) => `"${c.replaceAll('"', '""')}"`).join(','))
    .join('\n');
}

export function buildMasterChecklistHtmlReport(params: {
  items: MasterDirectiveItem[];
  summary: MasterChecklistSummary;
  verifiedIds: Record<number, boolean>;
}): string {
  const { items, summary, verifiedIds } = params;
  const verifiedCount = items.filter((i) => verifiedIds[i.id]).length;
  const statusLabel = (s: DirectiveStatus) =>
    s === 'IMPLEMENTED' ? '적용 완료' : s === 'PARTIAL' ? '부분 적용' : '아키텍처 로드맵';
  const statusBg = (s: DirectiveStatus) =>
    s === 'IMPLEMENTED' ? '#dcfce7;color:#166534' : s === 'PARTIAL' ? '#fef3c7;color:#92400e' : '#e2e8f0;color:#334155';

  const rowsHtml = items
    .map(
      (i) => `
      <tr>
        <td style="font-family:monospace;text-align:center;">${i.id}</td>
        <td style="font-family:monospace;font-weight:700;">${escapeHtml(i.code)}</td>
        <td>${escapeHtml(i.domainTitle)}</td>
        <td style="font-weight:600;">${escapeHtml(i.title)}</td>
        <td style="font-family:monospace;font-size:11px;">${escapeHtml(i.standardRef)}</td>
        <td><span style="padding:2px 6px;border-radius:4px;font-size:11px;font-weight:700;background:${statusBg(i.status)}">${statusLabel(i.status)}</span></td>
        <td style="text-align:center;">${verifiedIds[i.id] ? '✔ 확인' : '-'}</td>
        <td style="font-family:monospace;font-size:11px;">${escapeHtml(i.evidenceModule)}</td>
        <td>${escapeHtml(i.implementationNote)}</td>
      </tr>`
    )
    .join('');

  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<title>H042 엔지니어링 AI 엔진 1~99 체크리스트 보고서</title>
<style>
  body { font-family: "Noto Sans KR", -apple-system, sans-serif; color:#0f172a; margin:24px; line-height:1.45; }
  h1 { font-size:20px; margin:0 0 6px; }
  .meta { color:#475569; font-size:12px; margin-bottom:16px; }
  .kpi { display:grid; grid-template-columns:repeat(5, minmax(0, 1fr)); gap:10px; margin-bottom:18px; }
  .card { border:1px solid #cbd5e1; border-radius:6px; padding:10px 12px; background:#f8fafc; }
  .card .lbl { font-size:11px; color:#64748b; }
  .card .val { font-size:18px; font-weight:700; margin-top:2px; }
  table { width:100%; border-collapse:collapse; font-size:12px; }
  th, td { border:1px solid #cbd5e1; padding:6px 8px; text-align:left; vertical-align:top; }
  th { background:#f1f5f9; font-weight:700; }
</style>
</head>
<body>
  <h1>H042 종합 설계가이드 및 엔지니어링 AI 엔진 1~99 체크리스트 보고서</h1>
  <div class="meta">생성 일시: ${new Date().toLocaleString('ko-KR')} · 대상 프로젝트: H042 FGSS Marine Engineering</div>
  <div class="kpi">
    <div class="card"><div class="lbl">전체 지시 항목</div><div class="val">${summary.total}건</div></div>
    <div class="card"><div class="lbl">적용 완료 (TS/UI)</div><div class="val">${summary.implementedCount}건</div></div>
    <div class="card"><div class="lbl">부분 적용 (프로토타입)</div><div class="val">${summary.partialCount}건</div></div>
    <div class="card"><div class="lbl">인프라 로드맵</div><div class="val">${summary.plannedCount}건</div></div>
    <div class="card"><div class="lbl">엔지니어 수동 확인</div><div class="val">${verifiedCount} / ${summary.total}</div></div>
  </div>
  <table>
    <thead>
      <tr>
        <th>No</th><th>코드</th><th>영역</th><th>항목명</th><th>표준/기술</th><th>적용상태</th><th>검증</th><th>구현 근거</th><th>상세 내역</th>
      </tr>
    </thead>
    <tbody>${rowsHtml}</tbody>
  </table>
</body>
</html>`;
}
