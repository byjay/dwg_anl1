# `byjay/dwg_anl1` 종합 설계가이드 및 엔지니어링 AI 엔진 강화 마스터 지시서 (1~99)

- **대상 저장소**: [byjay/dwg_anl1](https://github.com/byjay/dwg_anl1) (설명: 도면분석1, `google-gemini/aistudio-repository-template` 기반)
- **목적**: 현재 프로토타입 수준의 도면 분석 앱을 **종합 다이어그램 분석 · 스펙 연동 검토 · 배관(Piping) · 전기(Electrical) · POS 작성/검토 · 메이커 도면 검토**를 아우르는 실무형 **종합 설계가이드 및 엔지니어링 검증 플랫폼**으로 고도화하기 위한 딥리서치 진단, 5중 상호 문답, 1~99번 엔진 강화 지시서 및 기술스택 청사진

---

## 1. 대상 저장소(`byjay/dwg_anl1`) 현황 해부 및 부족상태 딥리서치

### 1.1 현재 아키텍처 및 기술스택 진단

[byjay/dwg_anl1](https://github.com/byjay/dwg_anl1) 저장소를 전수 분석한 결과, 현재 코드는 **TypeScript 99.8%** 단일 언어 기반의 브라우저 중심 프로토타입으로 구성되어 있습니다.

| 계층 | 현재 구현 현황 (`byjay/dwg_anl1`) | 핵심 파일 / 모듈 |
| :--- | :--- | :--- |
| **프론트엔드 / UI** | React 19, TypeScript 7, Tailwind CSS v4, Vite 8, D3.js 7.9, Motion, Lucide React | `src/App.tsx`, `SplitPdfViewer.tsx`, `CrossMatchMatrix.tsx`, `DiffCheckWorkspace.tsx`, `RuleReviewWorkspace.tsx`, `SpecReviewWorkspace.tsx`, `ElectricalCommentReportWorkspace...`, `PosGeneratorWorkspace.tsx`, `MakerAnalysisWorkspace.tsx`, `LearnedKnowledgeWorkspace...` |
| **백엔드 / AI 연동** | Express 4.21 + Vite 미들웨어 (`server.ts`), `@google/genai` SDK (`gemini-4-hydrogen`, `gemini-3.1-flash-lite`)로 PDF를 Base64 `inlineData` 전송 (`POST /api/analyze`) | `server.ts`, `ParallelAiVerifier.tsx` |
| **PDF / OCR 파싱** | `pdfjs-dist` 기반 텍스트 박스 추출 및 스냅샷 렌더링, `tesseract.js` 기반 6개 고정 영역(Zone) OCR | `pdfLocator.ts`, `pdfSnapshotRenderer.ts`, `localPdfAudit.ts`, `ocrAnalyzer.ts` |
| **도메인 분석 엔진** | 정규식(`BUBBLE_PREFIX_RE`, `INLINE_TAG_RE`, `SPACED_TAG_RE`) 기반 태그 추출, 루프 매칭, 4대 분야 스펙 평가, 6종 전기 이슈 추출, POS 초안 생성, 메이커 인터페이스 추출 | `drawingContentAnalyzer.ts`, `universalDrawingAnalyzer.ts`, `diagramMatcher.ts`, `diagramGraphBuilder.ts`, `diffEngine.ts`, `verificationRules.ts`, `specReviewEngine.ts`, `electricalCommentEngine.ts`, `posGeneratorEngine.ts`, `learnedKnowledgeEngine.ts` |
| **데이터 / 영속성** | **외부 DB 부재**, Python 백엔드 부재, `Dockerfile` 부재, `README.md` 부재. 프로젝트 `H042` 샘플 PDF 8종 및 정적 시드 데이터 의존 | `src/data/h042Dataset.ts`, `src/data/h042NotesSeed.ts`, `public/assets/aistudio/` (H042 도면 8종) |

### 1.2 6대 핵심 도메인 + 종합 설계가이드 관점 부족상태(Gap) 딥리서치

글로벌 엔지니어링 표준([DEXPI 2.0.1](https://dexpi.org/), [ISA 5.1 / CFIHOS 2.0 / ISO 15926](https://pathnovo.com/standards), [ISO 10628](https://ifluids.com/standard/iso-10628-pfd-symbols-rules-and-common-mistakes/), [ASME B31.3](https://www.pipingmaterialguide.com/asme-b31-3-process-piping-guide.html), [IEC 61892](https://webstore.iec.ch/en/publication/28085), [IEC 60079](https://electricaltrader.com/blogs/news/iec-60079-parts-comparison-for-installers), [IEC 61511](https://www.vajravyuh.com/blog/emergency-shutdown-esd-valve-guide)) 및 상용 AI 도면 검토 벤치마크([EngMind](https://engmind.ai/), [Provision AI](https://provision.com/blog/8-best-ai-agents-for-reviewing-construction-drawings-specs-and-contrac), [Helonic 2026 가이드](https://helonic.com/blog/automated-drawing-review-software-what-to-look-for-2026))와 비교했을 때 확인된 치명적 부족상태는 다음과 같습니다.

| 도메인 | 현재 `dwg_anl1`의 한계 | 산업 실무 요구사항과의 갭(Gap) |
| :--- | :--- | :--- |
| **1. 종합 다이어그램 분석** | `pdfjs-dist` 텍스트 추출 + `tesseract.js` 6분할 영역 OCR + 정규식 태그 매칭 의존. **선(Line)·심볼(Symbol)·연결성(Topology) 인식 불가**. DWG/DXF 직접 파싱 불가. | P&ID/SLD의 배관선·신호선·흐름 방향·밸브/계기 심볼·OPC(Off-Page Connector)를 인식하여 **그래프 토폴로지**로 복원하고 [DEXPI](https://dexpi.org/) 표준 스키마로 직렬화해야 함. |
| **2. 스펙 연동 검토** | `specReviewEngine.ts`가 4개 카테고리(`ELECTRICAL_CABLE`, `INSTRUMENT_EX`, `MECHANICAL_PROCESS`, `MAKER_PACKAGE`)를 메모리 내 정적 룰과 시드 데이터로 평가. | 실제 프로젝트 사양서(Project Spec), 선급 규정, 국제코드([ASME B31.3](https://www.pipingmaterialguide.com/asme-b31-3-process-piping-guide.html), [IEC 61892](https://webstore.iec.ch/en/publication/28085), [IEC 60079](https://electricaltrader.com/blogs/news/iec-60079-parts-comparison-for-installers))의 조항 단위(Clause-level) 인용 및 근거 크롭 이미지가 포함된 감사 추적 체계 부재. |
| **3. 배관 (Piping)** | P&ID에서 태그/밸브 문자열만 정규식으로 검출(`SDV`, `BDV`, `XV`, `MOV` 등). Line Number 파싱, PMS(Piping Material Specification) 연동, Spec Break, 유체 서비스 등급 검증 부재. | Line Class별 압력-온도 등급(ASME B16.5/B16.34), 부식 여유(Corrosion Allowance), 플랜지 페이싱(RF/FF/RTJ), 분기 배관(Branch Table), P&ID ↔ Line List ↔ Valve List ↔ Isometric 4자 정합성 검증 필수. |
| **4. 전기 (Electrical)** | `electricalCommentEngine.ts`가 6종 이슈(`CABLE_MISSING` 등)를 H042 도면 위주로 검출. SLD 계통도 추적, 부하 합산, 단락전류·차단기 협조, 접지 계통(TT/TN-S/IT), 방폭 구역 연동 부재. | [SLD 검토 기준](https://teinse.es/en/blog/single-line-diagram-review-before-panel-build/) 및 [IEC 61892-6](https://webstore.iec.ch/en/publication/29080)에 따른 전압/주파수/전압강하, 보호계전기(ANSI 50/51/87 등), SLD ↔ Load List ↔ Cable Schedule ↔ Wiring Diagram ↔ Hazardous Area Map 정합성 검증 필수. |
| **5. POS 작성·검토** | `posGeneratorEngine.ts`가 `POS-300-PKG` 형태의 정적 템플릿·공급범위표 초안 생성 수준. 기술입찰평가(TBE), Deviation/Exception 추적, 데이터시트(Datasheet) 수치 연동 부재. | 도면·스펙에서 추출된 공정/배관/전기/계장 요구조건을 자동으로 POS 본문·Datasheet·VDRL(Vendor Data Requirements List)·Scope Split Matrix에 바인딩하고, 벤더 제안서와의 편차(TQ/Deviation)를 정량 검증해야 함. |
| **6. 메이커 도면 검토** | `universalDrawingAnalyzer.ts`의 `analyzeMakerDrawingProfile`이 기본 프로파일과 인터페이스 포인트 텍스트만 추출. 경계점(Battery Limit) 노즐·플랜지·전원·신호 교차 검증 부재. | 메이커 도면(GA, P&ID, Wiring, Foundation, Datasheet) 수신 시 POS/발주 스펙 및 조선소/EPC 모도면(Parent Drawing)과 **Battery Limit(배관 노즐 규격·위치, 전기 전원/용량, 계장 I/O·방폭, 중량·하중)**를 자동 대조하고 CRS(Comment Resolution Sheet)를 생성해야 함. |
| **7. 종합 설계가이드 및 인프라** | `README.md` 부재, DB 부재, 프로젝트 하드코딩(`h042Dataset.ts`), 인증/권한(RBAC)·리비전 이력·온프레미스 배포 환경 부재. | 다중 프로젝트·리비전 관리, 규칙 학습의 버전 승인 워크플로우, 설계자가 공종별 설계 근거와 체크리스트를 즉시 조회·적용할 수 있는 **살아있는 종합 설계가이드(Living Design Guide)** 아키텍처 필요. |

---

## 2. 5중 상호 문답 (5-Round Multi-Disciplinary Architecture Debate)

본 절은 5개 핵심 엔지니어링 전문가 그룹 간의 **질문(Q) → 기술적 반박/심화(Challenge) → 최종 아키텍처 합의(Resolution)**로 구성된 5중 상호 문답입니다.

### 제1중 문답: 수석 아키텍트 ↔ 도면 파싱·CV 리드
> **주제**: 브라우저 중심 `pdfjs-dist` + `tesseract.js` + 정규식 구조의 한계 돌파 및 하이브리드 CAD/비전 파싱 엔진 전환

- **Q (수석 아키텍트)**: 현재 `dwg_anl1`은 Node/Express 단일 서버와 브라우저 `pdfjs-dist`, `tesseract.js`로 동작합니다. H042 외의 신규 대형 선박/플랜트 도면(A0/A1 스캔 PDF, 수천 개 태그, 회전 텍스트, DWG 원본)이 들어오면 왜 무너집니까?
- **Challenge (도면 파싱·CV 리드)**: 세 가지 치명적 원인이 있습니다. 첫째, `tesseract.js`는 90°/270° 회전 텍스트, 심볼 내부 태그 버블(ISA 5.1 원형/육각형), 겹친 치수선에서 오인식률이 급증합니다. 둘째, `ocrAnalyzer.ts`의 6분할 고정 Zone은 도면 축척·타이틀블록 위치가 달라지면 즉시 빗나갑니다. 셋째, **벡터 선(Polyline)과 심볼의 위상(Topology)**을 읽지 못하므로, `SDV-3001`이 어느 배관 라인에 붙어 있고 어떤 솔레노이드/케이블과 연결되는지 그래프 추론이 불가능합니다. 게다가 PDF 전체를 Base64로 Gemini에 통째로 넘기는 `server.ts` 방식은 고해상도 A0 도면에서 소형 텍스트·심볼 디테일이 손실됩니다.
- **Resolution (합의)**:
  1. **이중 백엔드 분리**: 기존 Express는 BFF(API Gateway)로 경량화하거나 [FastAPI](https://github.com/fastapi/fastapi) 기반 Python 엔지니어링 분석 엔진 서비스로 핵심 연산을 이관합니다.
  2. **3-Track 하이브리드 파싱**: (a) DWG/DXF 원본은 ODA File Converter + [ezdxf](https://blog.fileformat.com/cad/cad-automation-without-autocad-top-open-source-frameworks-for-developers/)로 레이어·블록·속성(ATTRIB)·좌표를 100% 무손실 추출, (b) 벡터 PDF는 [PyMuPDF](https://github.com/pymupdf/pymupdf)로 텍스트 스팬·벡터 드로잉 경로(`page.get_drawings()`) 추출, (c) 스캔/래스터 PDF는 고해상도(300~400 DPI) 타일링(Sliding Window + Overlap) 후 [PaddleOCR](https://github.com/PADDLEPADDLE/PADDLEOCR)(회전 각도 분류기 포함) + [Ultralytics YOLO](https://github.com/ultralytics/ultralytics) 기반 커스텀 심볼 검출기 + OpenCV 선분 골격화(Skeletonization)로 노드-엣지 그래프를 복원합니다.
  3. **VLM 정밀 검증**: 전체 도면 1장 요약 대신, 검출된 ROI(Region of Interest) 크롭 타일과 구조화 JSON을 VLM(`@google/genai` 등)에 전달해 모호한 심볼·노트·범례만 교차 판독합니다.

---

### 제2중 문답: 배관/공정 리드 ↔ 표준·온톨로지 엔지니어
> **주제**: 정규식 태그 나열에서 벗어나 [DEXPI](https://dexpi.org/)·[ISO 15926](https://pathnovo.com/standards)·[ASME B31.3](https://www.pipingmaterialguide.com/asme-b31-3-process-piping-guide.html) 기반 배관·스펙 정합성 엔진 구축

- **Q (배관/공정 리드)**: 배관 실무에서 가장 잦고 치명적인 오류는 P&ID 라인 번호의 Pipe Class와 실제 PMS(Piping Material Specification), 밸브 등급, 플랜지 규격, Spec Break 위치가 어긋나는 것입니다. 현재 `diagramMatcher.ts`와 `specReviewEngine.ts`로 이를 잡을 수 있습니까?
- **Challenge (표준·온톨로지 엔지니어)**: 불가능합니다. 현재 `diagramGraphBuilder.ts`는 도면 간 문자열 매칭 수준이며, 배관의 물리적 의미(설계압력/온도, 유체 서비스 등급, 배관 재질, 벽두께, 부식 여유, 연결 방식)를 담는 시맨틱 모델이 없습니다. 또한 `H042` 프로젝트 네이밍 룰에 종속된 정규식은 타 프로젝트(예: `Size-Fluid-Seq-PipeClass-Insulation`)가 들어오면 파싱에 실패합니다.
- **Resolution (합의)**:
  1. **표준 그래프 온톨로지 채택**: [DEXPI 2.0.1](https://dexpi.org/) 클래스 계층(`PipingNetworkSystem`, `PipingNetworkSegment`, `Equipment`, `ProcessInstrumentationFunction`, `Connection`)과 [CFIHOS 2.0 / ISO 15926](https://pathnovo.com/standards) 필수 속성 스키마를 [Neo4j](https://neo4j.com/labs/genai-ecosystem/genai-frameworks/langgraph/) 지식 그래프에 구현합니다.
  2. **결정론적 배관 검증기(Deterministic Piping Validator)**: 프로젝트별 Line Number Grammar(설정 기반 파서)로 구경(NPS/DN)·유체코드·라인번호·Pipe Class·보온코드를 분해한 뒤, PMS DB와 대조하여 ① Spec Break 누락/불일치, ② Reducer 전후 구경·등급 불일치, ③ 밸브 압력등급([ASME B16.34 / B31.3](https://www.vajravyuh.com/standard/asme-b31-3)) 및 플랜지 페이싱(RF/FF/RTJ) 오류, ④ [ISO 10628](https://ifluids.com/standard/iso-10628-pfd-symbols-rules-and-common-mistakes/) PFD↔P&ID 스코프 일탈, ⑤ OPC(Off-Page Connector) 시트 간 연결 단절을 100% 결정론적 규칙으로 검증합니다.

---

### 제3중 문답: 전기/계장 리드 ↔ 안전·방폭(Ex/SIS) 전문가
> **주제**: 단순 전기 이슈 목록을 넘어 [IEC 61892](https://webstore.iec.ch/en/publication/28085)·[IEC 60079](https://electricaltrader.com/blogs/news/iec-60079-parts-comparison-for-installers)·[IEC 61511](https://www.vajravyuh.com/blog/emergency-shutdown-esd-valve-guide) 기반 전기·계장 통합 검증 엔진화

- **Q (전기/계장 리드)**: `electricalCommentEngine.ts`는 `CABLE_MISSING`, `UNASSIGNED_HOLD`, `TAG_CONFLICT`, `BLOCK_COPY_ERROR`, `WD_MISSING`, `SPEC_MISMATCH` 6개 유형을 찾고 PDF 크롭 좌표까지 뽑아주는 좋은 출발점입니다. 하지만 실무 전기·계장 도면 검토에서 반드시 추가되어야 할 치명적 검증 축은 무엇입니까?
- **Challenge (안전·방폭 전문가)**: 네 가지가 빠져 있습니다. 첫째, **전원 계통 정합성**: [SLD 검토 체크리스트](https://teinse.es/en/blog/single-line-diagram-review-before-panel-build/) 기준 상류 변압기/발전기→모선(Busbar)→차단기(VCB/ACB/MCCB)→케이블→부하(Motor/Heater/Panel)의 전압·주파수·접지계통(IT/TN-S/TT)·예상 단락전류(Isc) 대비 차단용량(Icu/Ics)·전압강하 계산 연동이 없습니다. 둘째, **케이블/글랜드 정합성**: [IEC 60092 / IEC 61892-6](https://webstore.iec.ch/en/publication/29080) 기준 동력/제어/계장 케이블 분리 포설, 코어 수·단면적(mm²) 대비 부하 전류 및 예비 코어(Spare Core) 검증이 없습니다. 셋째, **방폭(Hazardous Area) 교차 검증**: [IEC 60079-10-1 / 60079-14](https://electricaltrader.com/blogs/news/iec-60079-parts-comparison-for-installers)의 Zone 0/1/2 및 가스그룹(IIA/IIB/IIC)·온도등급(T1~T6) 도면과 계기/전장품의 Ex 마킹(Ex d, Ex e, Ex ia/ib, Ex p) 및 본질안전(IS) 배리어·케이블 글랜드 인증 일치 여부 검증이 없습니다. 넷째, **안전계장시스템(SIS/ESD)**: P&ID의 `SDV`/`BDV`에 대해 [IEC 61511](https://www.vajravyuh.com/blog/emergency-shutdown-esd-valve-guide) 기준 SIL 등급, Fail-Safe(FC/FO), 솔레노이드(De-energize to trip), 리미트 스위치, PST(Partial Stroke Test), Cause & Effect Matrix 연동 검증이 없습니다.
- **Resolution (합의)**:
  1. **전기 계통 계산·검증 모듈**: SLD 토폴로지에서 추출된 전원-부하 트리를 기반으로 정격전류, 차단기 트립 커브/차단용량, 케이블 허용전류·전압강하를 Python 수치 계산 모듈로 자동 검산합니다.
  2. **방폭(Ex) 및 SIS/C&E 교차 엔진**: Hazardous Area Classification 도면 좌표/구역 메타데이터와 장비·계기 태그 위치를 매핑하여 Zone 대비 Ex 보호등급 부적합을 즉시 Critical로 차단하고, C&E Matrix(Excel/PDF) ↔ P&ID(`SDV`/`BDV`/Transmitter) ↔ I/O List ↔ Wiring Diagram 4중 루프 검증을 내장합니다.

---

### 제4중 문답: 조달/POS 리드 ↔ 메이커 도면 검토 전문가
> **주제**: POS(Purchase Order Specification) 자동 작성·검토와 메이커 도면(Vendor Drawing) 경계점 역검증 폐루프(Closed-Loop) 구축

- **Q (조달/POS 리드)**: 현재 `posGeneratorEngine.ts`는 `POS-300-PKG`처럼 단일 패키지 초안과 공급범위 분배표(`PosScopeSplitRow`)를 만듭니다. 실제 조선/EPC 현장에서는 POS 작성 → 벤더 입찰서 기술검토(TBE) → 발주 → 메이커 도면(Approval Drawing) 접수 → 코멘트(CRS) 발행 → 최종 확정(As-Built)까지가 하나의 연속 파이프라인입니다. 이 단절을 어떻게 메울까요?
- **Challenge (메이커 도면 검토 전문가)**: 가장 큰 문제는 **POS 요구사항과 메이커 도면 간의 추적성(Traceability) 단절**입니다. 예를 들어 POS에서 요구한 노즐 규격(예: 6" 300# RF), 모터 전압/방폭(440V 3Ph 60Hz Ex d IIB T4), 계장 통신 프로토콜(Modbus RTU / HART / Profibus), 도장 사양(NORSOK/PSPC), 선급 검사(DNV/ABS/KR) 조건이 메이커가 제출한 GA/P&ID/Wiring 도면에서 슬쩍 변경되거나 누락되어도, 현재 `analyzeMakerDrawingProfile`은 텍스트 프로파일만 뽑을 뿐 **요구값(POS) vs 제출값(Maker DWG) vs 모도면(Parent P&ID/SLD)**의 3자 정량 대조(3-Way Reconciliation)를 수행하지 못합니다.
- **Resolution (합의)**:
  1. **구조화 POS 엔진**: POS를 단순 서술형 HTML이 아닌 **JSON/YAML 기반 요구사항 트리(Requirement Tree)**로 관리합니다. 모든 조항에 고유 ID(`REQ-300-MECH-014`)를 부여하고, 근거 도면·스펙 조항·Datasheet 수치를 자동 바인딩합니다.
  2. **Battery Limit & Interface 3자 대조 엔진**: 메이커 도면 접수 시 `Parent P&ID/SLD` ↔ `POS/Datasheet` ↔ `Maker Drawing` 간에 ① 배관 Tie-in 노즐(크기·등급·페이싱·좌표·유체), ② 전기 수전점(전압·상수·주파수·kW·단락용량·케이블 인입구), ③ 계장 I/O 및 신호타입(AI/AO/DI/DO, 4-20mA/Dry Contact, Ex 등급), ④ 구조/중량(Dry/Operating/Test Weight, Foundation Bolt)을 자동 대조합니다.
  3. **CRS(Comment Resolution Sheet) & VDRL 워크플로우**: 불일치 항목마다 [EngMind](https://engmind.ai/) 방식의 **심각도(Critical/Major/Minor) + 표준 조항 근거 + 도면 크롭 영역 + 조치 코드(Code 1 Approved / Code 2 Approved with Comments / Code 3 Revise & Resubmit)**를 자동 생성하고 Excel/PDF CRS로 내보냅니다.

---

### 제5중 문답: AI/MLOps 리드 ↔ 종합 설계가이드·보안·QA 리드
> **주제**: 멀티에이전트 오케스트레이션, 환각 통제, Human-in-the-Loop, 온프레미스 보안 및 '살아있는 종합 설계가이드' 완성

- **Q (AI/MLOps 리드)**: 6개 도메인 엔진이 모두 붙으면 단일 LLM 프롬프트 호출(`POST /api/analyze`)로는 컨텍스트 폭발, 환각(Hallucination), 재현성 결여 문제가 발생합니다. 에이전트 오케스트레이션과 지식 학습(`learnedKnowledgeEngine.ts`)을 어떻게 재설계해야 합니까?
- **Challenge (설계가이드·보안·QA 리드)**: 실무 엔지니어링에서 AI가 존재하지 않는 스펙 조항을 지어내거나, 검증되지 않은 규칙을 자동 학습해 덮어쓰면 대형 사고로 이어집니다. 또한 조선소/EPC 도면과 POS는 **핵심 영업비밀(IP)**이므로 클라우드 API 단일 의존(`@google/genai`)만으로는 보안 심의를 통과할 수 없습니다. 더불어 사용자가 원한 **'종합 설계가이드'** 역할을 하려면, 단순 오류 검출기가 아니라 *"이 상황에서 어떤 표준·계산식·과거 코멘트 사례·체크리스트를 적용해야 하는가"*를 설계 단계별로 안내하는 지식 허브가 되어야 합니다.
- **Resolution (합의)**:
  1. **결정론 우선 + [LangGraph](https://neo4j.com/labs/genai-ecosystem/genai-frameworks/langgraph/) 멀티에이전트**: 수치·규격·연결성 검증은 100% 결정론적 Python/Cypher 룰 엔진이 먼저 실행하고, LLM/VLM 에이전트는 비정형 노트 해석, 스펙 문장 대조, POS 초안 작성, CRS 문구 정제에만 투입합니다. 모든 AI 출력은 **원본 도면 좌표(BBox) + 스펙 페이지/조항 인용**이 없으면 자동 기각(Citation Guardrail)합니다.
  2. **GraphRAG + Hybrid Vector 검색**: [Neo4j](https://neo4j.com/blog/developer/neo4j-graphrag-workflow-langchain-langgraph/)(도면 토폴로지·태그 관계) + [Qdrant](https://github.com/qdrant/qdrant) 또는 [PostgreSQL + pgvector](https://github.com/pgvector/pgvector)(프로젝트 스펙·선급규정·과거 CRS·설계가이드 문서)를 결합합니다.
  3. **Human-in-the-Loop 승인 기반 지식 학습**: `learnedKnowledgeEngine.ts`를 **Draft → Senior Engineer Review → Approved Rule(버전/유효기간/적용 프로젝트 범위)** 워크플로우로 격상하고, 승인된 규칙과 과거 코멘트가 자동으로 **종합 설계가이드 Playbook**에 축적되도록 구축합니다.
  4. **하이브리드 LLM 추론(클라우드 + 온프레미스)**: LiteLLM/vLLM 추상화 계층을 두어, 외부 연동 가능 프로젝트는 Gemini API를 쓰고, 보안 프로젝트는 사내 온프레미스 VLM/LLM(예: Qwen-VL / Llama 계열)으로 코드 변경 없이 스위칭할 수 있게 설계합니다.

---

## 3. 목표 시스템 아키텍처 및 권장 기술스택 마스터 매트릭스

| 아키텍처 레이어 | 기존 `dwg_anl1` | 목표 권장 기술스택 | 도입 목적 및 기대 효과 |
| :--- | :--- | :--- | :--- |
| **프론트엔드 UI** | React 19, TS 7, Vite 8, Tailwind v4, D3.js | 기존 React 19 + Vite 8 유지 + **Konva.js / Fabric.js**(도면 어노테이션·레드라인) + **Cytoscape.js / React Flow**(토폴로지 그래프 탐색) + **TanStack Query/Table** | 대용량 A0 도면 60fps 팬/줌, 레드라인 마크업, 그래프 경로 추적, 수천 행 BOM/CRS 가상 스크롤 |
| **API / 오케스트레이션** | Express 4.21 단일 서버 | **[FastAPI](https://github.com/fastapi/fastapi)** (Python 3.12+, Pydantic v2) + **Celery / Temporal + Redis** (비동기 배치 워커) | 장시간 소요되는 다중 도면 OCR·CV·그래프 검증의 비동기 파이프라인화 및 재시도·진행률 스트리밍(SSE/WebSocket) |
| **CAD / PDF / 문서 파싱** | `pdfjs-dist`, `tesseract.js` | **ODA File Converter + [ezdxf](https://blog.fileformat.com/cad/cad-automation-without-autocad-top-open-source-frameworks-for-developers/)** (DWG/DXF) + **[PyMuPDF](https://github.com/pymupdf/pymupdf)** (벡터 PDF) + **[Docling](https://github.com/docling-project/docling)** (스펙·POS·데이터시트 표/문서) | 도면 원본 벡터·블록 무손실 파싱 및 복잡한 병합 셀(Line List, Cable Schedule, Datasheet) 고정밀 구조화 |
| **비전 / OCR / 토폴로지** | 6-Zone `tesseract.js` | **[PaddleOCR](https://github.com/PADDLEPADDLE/PADDLEOCR)** (다국어·회전 텍스트) + **[Ultralytics YOLO](https://github.com/ultralytics/ultralytics)** (ISA 5.1 / IEC 60617 심볼 검출) + **OpenCV / Shapely / NetworkX** (배관선·신호선 추적) | 스캔 도면 심볼·텍스트·연결선 자동 인식 및 토폴로지 그래프 복원 |
| **데이터베이스 / RAG** | 없음 (정적 TS 시드 파일) | **PostgreSQL + [pgvector](https://github.com/pgvector/pgvector)** (RDB + 하이브리드 벡터) + **[Neo4j](https://neo4j.com/labs/genai-ecosystem/genai-frameworks/langgraph/)** (도면/태그/인터페이스 지식그래프) + **[Qdrant](https://github.com/qdrant/qdrant)** (대규모 스펙 청크 필터링) + **MinIO/S3** (도면/스냅샷 객체저장) | 다중 프로젝트 영속성, 리비전 이력, GraphRAG 기반 다중 도면·스펙 교차 추론 |
| **AI 에이전트 / LLM** | `@google/genai` 직접 호출 | **[LangGraph](https://neo4j.com/labs/genai-ecosystem/genai-frameworks/langgraph/)** (상태 기반 멀티에이전트) + **LiteLLM / vLLM** (Gemini API + 온프레미스 VLM/LLM 추상화) + **Instructor / Pydantic** (엄격 JSON 스키마) | 공종별 전문 에이전트 병렬 실행, 환각 차단(Citation Guardrail), 보안 환경 온프레미스 전환 |
| **품질 / 배포 / 보안** | 없음 (`Dockerfile`·`README` 부재) | **Docker Compose / Kubernetes**, **pytest + Vitest + Playwright**, **OpenTelemetry + Langfuse**, **Keycloak / OIDC (RBAC)** | 재현 가능한 배포, 골든 데이터셋 회귀 테스트(정밀도/재현율), 감사 로그 및 권한 통제 |

---

## 4. `dwg_anl1` 엔진 강화 마스터 지시서: 1부터 99까지 전 항목 실행 명세

아래 99개 항목은 9개 영역(각 11개 항목)으로 구성되어 있으며, 개발팀 및 AI 코딩 에이전트가 순차·병렬로 즉시 착수할 수 있는 구체적 작업 지시서입니다.

### 영역 1 (01~11): 기반 아키텍처, 모노레포 전환 및 데이터 영속성 인프라

| 번호 | 지시 항목 | 대상/신규 모듈 | 핵심 구현 지시 내용 | 필수 기술스택 | 완료 기준 (DoD) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **01** | 모노레포 구조 재편 및 README 문서화 | 루트 디렉터리, `README.md` | `apps/web`(기존 React), `apps/api`(FastAPI), `packages/shared-schema`(OpenAPI/JSON Schema)로 구조화하고 아키텍처·실행법·환경변수를 담은 `README.md` 작성 | pnpm workspace / Turborepo, Markdown | 신규 개발자가 `README.md`만으로 10분 내 로컬 기동 성공 |
| **02** | Python 분석 백엔드 서비스 신설 | `apps/api/` (신규), `server.ts` | `server.ts`의 무거운 분석 로직을 FastAPI 기반 Python 서비스로 이관하고, OpenAPI 3.1 스펙으로 TS 클라이언트 타입 자동 생성 | [FastAPI](https://github.com/fastapi/fastapi), Python 3.12, Pydantic v2, `openapi-typescript` | `/api/v1/health` 및 도면 업로드·분석 API 스키마 100% 타입 동기화 |
| **03** | 비동기 작업 큐 및 상태 스트리밍 | `apps/api/workers/` (신규) | 대용량 다중 도면(A0 수십 장) 분석 시 HTTP 타임아웃 방지를 위해 작업 큐 도입 및 단계별 진행률 SSE/WebSocket 실시간 전송 | Celery (또는 Temporal), Redis, FastAPI SSE | 50장 패키지 동시 업로드 시 무중단 처리 및 단계별 진행률 UI 표시 |
| **04** | 관계형 DB 스키마 및 영속화 | `apps/api/db/`, `h042Dataset.ts` | 하드코딩된 `h042Dataset.ts`·`h042NotesSeed.ts`를 제거하고 Project, Drawing, Revision, Tag, SpecClause, Comment, PosDoc, User 테이블 설계 | PostgreSQL 16, SQLAlchemy 2.0, Alembic | `H042` 외 임의의 신규 프로젝트를 UI에서 생성·저장·재조회 가능 |
| **05** | 도면/크롭/리포트 객체 스토리지 | `apps/api/storage/` (신규) | `public/assets/aistudio/` 정적 파일 의존 제거, 원본 PDF/DWG·고해상도 타일·이슈 크롭 PNG·내보내기 리포트를 S3 호환 스토리지에 저장 | MinIO (로컬/온프렘) / AWS S3, Presigned URL | 도면 업로드→크롭 이미지 생성→보안 URL 서빙 전 과정 영속화 |
| **06** | 지식 그래프 DB 연동 계층 | `apps/api/graph/`, `diagramGraphBuilder.ts` | 메모리 내 임시 그래프(`diagramGraphBuilder.ts`)를 영구 그래프 DB로 승격하여 다중 도면 간 태그·배관·케이블·인터페이스 관계 저장 | [Neo4j](https://neo4j.com/labs/genai-ecosystem/genai-frameworks/langgraph/), `neo4j` Python driver, Cypher | P&ID↔SLD↔GAR↔Maker 도면 간 3-Hop 이상 경로 쿼리 200ms 이내 응답 |
| **07** | 하이브리드 벡터 검색 저장소 구축 | `apps/api/rag/` (신규) | 프로젝트 스펙·국제표준·과거 CRS·설계가이드 문서를 Dense+Sparse(BM25) 하이브리드 인덱스로 저장하고 프로젝트/공종 메타데이터 필터 지원 | [pgvector](https://github.com/pgvector/pgvector) 또는 [Qdrant](https://github.com/qdrant/qdrant) | 스펙 조항 검색 시 Top-5 Recall ≥ 92% 및 프로젝트 격리 보장 |
| **08** | 프로젝트·리비전·문서 제어(DCC) 모델 | `apps/api/dcc/` (신규) | 도면 번호, 리비전(`Rev.A`, `Rev.0`, `IFA`, `IFC`, `AFC`), 발행일, 상태(Superseded/Active)를 관리하는 엔지니어링 문서 제어 계층 구현 | PostgreSQL, Pydantic | 구 리비전 도면이 최신 분석에 혼입되지 않도록 자동 필터링 |
| **09** | 컨테이너화 및 원클릭 배포 | `Dockerfile`, `docker-compose.yml` | Web, FastAPI, Worker, PostgreSQL, Neo4j, Redis, MinIO를 포함한 개발/운영용 Docker Compose 및 헬스체크 구성 | Docker, Docker Compose, Nginx | `docker compose up` 단일 명령으로 전체 스택 정상 기동 |
| **10** | LLM/VLM 게이트웨이 추상화 | `apps/api/llm/`, `server.ts` | `@google/genai` 하드코딩 호출을 추상화하여 Gemini API와 사내 온프레미스 VLM/LLM(vLLM)을 환경설정으로 전환 및 비용/토큰 추적 | LiteLLM, `@google/genai`, vLLM | 설정 파일 1줄 변경으로 클라우드/온프레미스 모델 무중단 스위칭 |
| **11** | 인증·권한(RBAC) 및 감사 로그 | `apps/api/auth/` (신규) | 설계자(Engineer), 검토자(Lead/Checker), 승인자(Approver), 벤더(Vendor), 관리자(Admin) 역할 분리 및 모든 승인/수정 이력 불변 기록 | Keycloak / OIDC, JWT, Audit Trail Table | 모든 코멘트 승인·규칙 변경·POS 확정 이력에 사용자·시각·사유 기록 |

---

### 영역 2 (12~22): CAD / 벡터 PDF / 스캔 도면 멀티모달 파싱 & CV 토폴로지 엔진

| 번호 | 지시 항목 | 대상/신규 모듈 | 핵심 구현 지시 내용 | 필수 기술스택 | 완료 기준 (DoD) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **12** | DWG/DXF 네이티브 파싱 파이프라인 | `apps/api/parsers/cad_parser.py` | DWG를 DXF로 무손실 변환 후 레이어, 블록 정의(INSERT/ATTRIB), 폴리라인, 텍스트 좌표를 직접 추출 | ODA File Converter, [ezdxf](https://blog.fileformat.com/cad/cad-automation-without-autocad-top-open-source-frameworks-for-developers/) | DWG/DXF 도면의 태그·레이어·블록 속성 99% 이상 무손실 추출 |
| **13** | 벡터 PDF 정밀 텍스트·도형 추출기 | `apps/api/parsers/pdf_vector.py`, `pdfLocator.ts` | `pdfjs-dist` 브라우저 추출을 보완하여 서버에서 폰트·회전각·선분·곡선(`get_drawings()`)·BBox를 정밀 추출하고 벡터/스캔 자동 판별 | [PyMuPDF](https://github.com/pymupdf/pymupdf) (`fitz`), `pdfplumber` | 벡터 PDF 텍스트 위치 오차 1pt 미만 및 벡터/래스터 자동 분기 |
| **14** | 고해상도 적응형 타일링 엔진 | `apps/api/parsers/tiler.py`, `ocrAnalyzer.ts` | 고정 6분할 Zone을 폐기하고, A0/A1 대형 도면을 300~400 DPI로 렌더링 후 20% 오버랩 슬라이딩 윈도우 타일로 분할·재병합(NMS) | `pypdfium2` / PyMuPDF, NumPy, OpenCV | 타일 경계에 걸친 태그·심볼 절단 및 중복 검출률 1% 미만 |
| **15** | 다국어·회전 텍스트 고정밀 OCR | `apps/api/parsers/ocr_engine.py`, `ocrAnalyzer.ts` | `tesseract.js`를 대체하여 수직(90°/270°) 배관 라인번호, 한글/영문 혼용 주석, 소형 심볼 내부 텍스트를 고정밀 인식 | [PaddleOCR](https://github.com/PADDLEPADDLE/PADDLEOCR) (Angle Classifier 포함) | 회전/소형 엔지니어링 텍스트 인식 정확도(CER) 3% 이하 |
| **16** | 타이틀블록·리비전 테이블 자동 파서 | `apps/api/parsers/title_block.py` | 도면 우하단 타이틀블록 및 리비전 이력표의 위치를 레이아웃 모델로 탐지하여 도면번호, 제목, 공종, 축척, 리비전, 프로젝트명 자동 추출 | [Docling](https://github.com/docling-project/docling), PaddleOCR, Pydantic | 다양한 조선소/EPC/메이커 양식에서 타이틀블록 핵심 필드 95%+ 추출 |
| **17** | P&ID / SLD 심볼 객체 검출 엔진 | `apps/api/vision/symbol_detector.py` | [ISA 5.1](https://pathnovo.com/standards), [ISO 10628](https://ifluids.com/standard/iso-10628-pfd-symbols-rules-and-common-mistakes/), [IEC 60617 / IEEE 315](https://deskely.com/resources/single-line-diagram) 심볼(밸브, 펌프, 열교환기, 계기 버블, 차단기, 변압기, 모터 등) 전용 검출 모델 학습·서빙 | [Ultralytics YOLO](https://github.com/ultralytics/ultralytics) (YOLO11/YOLO26), ONNX Runtime | 주요 60종 이상 공정·배관·전기 심볼 mAP@0.5 ≥ 0.90 달성 |
| **18** | 선분·배관선·신호선 토폴로지 복원 | `apps/api/vision/topology_extractor.py` | 심볼 마스킹 후 배관 실선(주배관/보조배관), 계장 점선/파선(전기/공압 신호), 흐름 화살표, 교차점(점프/티 분기)을 그래프 엣지로 복원 | OpenCV (Morphology/Skeletonization), Shapely, NetworkX | 인접 심볼 간 실제 연결 관계(From-To) 복원 F1 ≥ 0.88 |
| **19** | 태그-심볼 공간 결합(Spatial Binding) | `apps/api/vision/tag_binder.py`, `autoTagger.ts` | 검출된 텍스트(태그, 구경, Fail-Safe, 스펙)를 최근접 심볼/배관선과 기하학적 거리·방향·리더선(Leader Line) 기반으로 자동 결합 | Shapely, KD-Tree (SciPy), VLM Tie-breaker | 태그와 해당 심볼/배관선의 정확한 1:1 바인딩률 95%+ |
| **20** | 범례(Legend) 및 노트(General Notes) 파서 | `apps/api/parsers/legend_notes.py` | 프로젝트별 Legend 시트에서 커스텀 심볼·약어를 자동 색인하고, 도면 우측 General Notes·Hold List를 구조화 항목으로 추출 | [Docling](https://github.com/docling-project/docling), VLM Cropped Parsing | 도면 내 모든 `HOLD` 항목과 프로젝트 고유 약어를 자동 등록 |
| **21** | 다중 포맷 엔지니어링 테이블 파서 | `apps/api/parsers/table_parser.py` | PDF/Excel/Word로 제공되는 Line List, Valve List, Equipment List, Load List, Cable Schedule, I/O List의 병합 셀·다단 헤더를 정밀 파싱 | [Docling](https://github.com/docling-project/docling), `openpyxl`, `pandas`, `pdfplumber` | 다단 헤더 및 페이지 분할 표의 행/열 깨짐 없이 정규화 JSON 출력 |
| **22** | 시각적 Diff 및 클라우드(Cloud) 마크업 감지기 | `apps/api/vision/visual_diff.py`, `diffEngine.ts` | 리비전 간 도면 이미지를 정합(Homography/Feature Matching) 후 픽셀·벡터·텍스트 변경점과 Revision Cloud 영역을 자동 탐지 | OpenCV (ORB/SIFT Align), PyMuPDF, Shapely | 리비전 간 추가/삭제/수정된 심볼·배관·텍스트를 좌표 오버레이로 표시 |

---

### 영역 3 (23~33): 표준 온톨로지(DEXPI / ISO 15926 / CFIHOS) 및 지식 그래프 엔진

| 번호 | 지시 항목 | 대상/신규 모듈 | 핵심 구현 지시 내용 | 필수 기술스택 | 완료 기준 (DoD) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **23** | DEXPI 2.0.1 호환 데이터 모델 구현 | `packages/shared-schema/dexpi/` | [DEXPI 2.0.1](https://dexpi.org/) 핵심 클래스(`PipingNetworkSystem`, `Equipment`, `Nozzle`, `PipingComponent`, `ProcessInstrumentationFunction`)를 Pydantic/TS 스키마로 정의 | Pydantic v2, JSON Schema, XML(Proteus) | 추출된 P&ID 그래프를 DEXPI-XML/JSON으로 무결성 검증 후 내보내기 |
| **24** | CFIHOS 2.0 / ISO 15926 속성 매핑 | `apps/api/ontology/cfihos_mapper.py` | [CFIHOS 2.0 및 ISO 15926 RDL](https://pathnovo.com/standards) 기준 자산 클래스별 필수 속성(설계압력, 재질, 방폭등급, 제조사, 문서번호) 스키마 매핑 | Neo4j, RDFLib / JSON-LD | 모든 장비·계기·밸브 노드에 표준 클래스 URI 및 필수 속성 결측 체크 |
| **25** | 프로젝트 가변 태그 문법(Tag Grammar) 엔진 | `apps/api/ontology/tag_grammar.py`, `drawingContentAnalyzer.ts` | 하드코딩된 정규식(`INLINE_TAG_RE` 등)을 프로젝트별 설정 가능한 규칙(System-Area-Discipline-Type-Seq-Suffix) 및 파서로 일반화 | YAML/JSON Config, Lark/Regex Engine | 신규 프로젝트 등록 시 코드 수정 없이 태그 명명규칙 설정 및 적용 |
| **26** | 크로스 도면 엔티티 해소(Entity Resolution) | `apps/api/graph/entity_resolver.py`, `diagramMatcher.ts` | P&ID(`100-SDV-001`), SLD(`SDV-100-001`), Cable Schedule(`100SDV001`) 등 표기 편차가 있는 동일 실체를 정규화·매칭하여 단일 마스터 노드로 통합 | Neo4j, RapidFuzz, Rule-based Canonicalizer | 공종 간 표기 편차에도 동일 태그 매칭 정밀도 98%+ |
| **27** | OPC(Off-Page Connector) 자동 연결 엔진 | `apps/api/graph/opc_linker.py` | 도면 간 이어지는 배관/신호 화살표(From/To Sheet No, Line No, Continuation Tag)를 자동 페어링하고 단방향/불일치 OPC를 오류로 검출 | Neo4j Cypher, Python | 전체 P&ID 패키지 내 OPC 연결 누락·시트번호 오기 100% 검출 |
| **28** | 공종 통합 지식 그래프 구축 | `apps/api/graph/unified_kg.py` | `(:Project)-[:HAS_DRAWING]->(:Drawing)`, `(:Equipment)-[:HAS_NOZZLE]->(:Nozzle)-[:CONNECTED_TO]->(:PipeSegment)`, `(:Equipment)-[:POWERED_BY]->(:Feeder)` 통합 스키마 구축 | [Neo4j](https://neo4j.com/labs/genai-ecosystem/genai-frameworks/langgraph/) | 단일 태그 클릭 시 연결된 배관·계기·전원·케이블·POS·메이커도면 일괄 조회 |
| **29** | 스펙·표준 문서 조항 단위(Clause) 파싱 | `apps/api/rag/spec_chunker.py` | 프로젝트 기술사양서, 선급규정, 국제코드를 임의 길이 청크가 아닌 **조항 번호(Section 4.2.1) + 표 + 예외 단서** 단위로 구조화 인덱싱 | [Docling](https://github.com/docling-project/docling), Hierarchical Chunker | 모든 검색 결과가 정확한 문서명·섹션·페이지 번호를 메타데이터로 보유 |
| **30** | GraphRAG 하이브리드 검색 파이프라인 | `apps/api/rag/graph_rag.py` | 질의 의도에 따라 Vector 검색(스펙 조항) + Graph 순회(연결 장비/루프)를 라우팅·결합하는 GraphRAG 검색기 구현 | `neo4j-graphrag`, [LangGraph](https://neo4j.com/blog/developer/neo4j-graphrag-workflow-langchain-langgraph/), Qdrant/pgvector | "Module 300 Recondenser 관련 방폭/케이블 요구사항" 질의에 도면+스펙 통합 답변 |
| **31** | 단위 정규화 및 공학 수치 변환기 | `apps/api/ontology/unit_converter.py` | `bar(g)/MPa/psi`, `°C/°F/K`, `DN/NPS(inch)`, `kW/HP`, `mm²/AWG` 등 혼재된 단위를 SI 기준으로 정규화하여 수치 비교 오류 원천 차단 | `pint` (Python), Pydantic | SI/Imperial 혼용 도면·메이커 데이터시트 간 자동 환산 비교 |
| **32** | 마스터 태그 레지스터(MTR) 자동 생성 | `apps/api/graph/mtr_generator.py` | 통합 그래프에서 전 공종 Master Tag Register 및 Tag-Document Cross-Reference Matrix를 자동 집계·동기화 | Neo4j, PostgreSQL, `openpyxl` | 프로젝트 내 모든 태그의 출현 도면·상태·누락 문서 매트릭스 실시간 생성 |
| **33** | 변경 영향도 분석(Change Impact Analysis) | `apps/api/graph/impact_analyzer.py` | 특정 P&ID 라인 등급이나 모터 kW가 변경될 때 그래프를 순회해 영향받는 밸브, 케이블, 차단기, POS 조항, 메이커 도면을 자동 추적 | Neo4j Cypher (Variable-Length Path) | 단일 속성 변경 시 파급 대상 문서·태그 리스트 1초 내 산출 |

---

### 영역 4 (34~44): 배관(Piping)·공정(Process) P&ID / PFD / PMS 정합성 검증 엔진

| 번호 | 지시 항목 | 대상/신규 모듈 | 핵심 구현 지시 내용 | 필수 기술스택 | 완료 기준 (DoD) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **34** | PMS(Piping Material Spec) 디지털 카탈로그 | `apps/api/piping/pms_store.py` | 프로젝트 PMS(Pipe Class별 재질, 스케줄, 부식여유, 압력-온도 등급, 플랜지/개스킷/볼트, 밸브 코드, Branch Table)를 DB화 | PostgreSQL, JSONB, Pydantic | Pipe Class 입력 시 구경별 허용 배관·피팅·밸브 규격 즉시 조회 |
| **35** | ASME B31.3 설계 조건 검증기 | `apps/api/piping/b31_3_checker.py` | [ASME B31.3](https://www.pipingmaterialguide.com/asme-b31-3-process-piping-guide.html) 기준 유체 서비스 등급(Normal, Cat. D, Cat. M, High Pressure)과 설계압력/온도가 Pipe Class 허용 범위 내인지 검증 | Python, PMS DB, ASME P-T Table | 설계압력/온도 초과 Pipe Class 적용 라인 100% Critical 검출 |
| **36** | Spec Break 및 재질 경계 검증기 | `apps/api/piping/spec_break.py` | 서로 다른 Pipe Class가 만나는 지점에 Spec Break 심볼 존재 여부, 고압측 플랜지/밸브 등급 우선 적용 원칙 및 이종금속(Galvanic) 절연 여부 검증 | Neo4j, Python Rule Engine | Spec Break 누락 또는 저압 등급 밸브 오배치 자동 검출 |
| **37** | 밸브·플랜지·페이싱 정합성 검증기 | `apps/api/piping/valve_checker.py` | [ASME B16.34 / B31.3](https://www.vajravyuh.com/standard/asme-b31-3) 기준 밸브 태그 코드와 PMS 허용 밸브 매칭, 플랜지 페이싱(RF/FF/RTJ) 및 End Connection(BW/SW/THD) 일치 확인 | Python, PMS DB | 나사식(THD) 금지 구경 초과 또는 RF↔FF 플랜지 불일치 검출 |
| **38** | 리듀서(Reducer)·구경 연속성 검증기 | `apps/api/piping/size_continuity.py` | 배관 경로상 구경 변화 지점에 Reducer 심볼 존재 여부, 펌프 흡입측 편심 리듀서(Flat-on-Top) 적용 등 배관 설계 가이드 규칙 검증 | Neo4j, Vision Symbol Attributes | 구경 불연속 배관 및 펌프 흡입측 동심 리듀서 오적용 경고 |
| **39** | PFD ↔ P&ID 스코프 및 스트림 정합성 | `apps/api/piping/pfd_pid_matcher.py` | [ISO 10628](https://ifluids.com/standard/iso-10628-pfd-symbols-rules-and-common-mistakes/) 기준 PFD 주요 장비·스트림 번호·운전/설계 조건이 P&ID에 누락 없이 반영되었는지 교차 검증 | Neo4j, Python | PFD 대비 P&ID 누락 장비·스트림 및 설계 조건 불일치 목록 생성 |
| **40** | P&ID ↔ Line List ↔ Valve List 3자 대조 | `apps/api/piping/list_reconciler.py` | P&ID 추출 라인·밸브와 Excel Line List·Valve List 간의 누락, 중복, 구경·Class·보온코드·From/To 불일치 전수 대조 | `pandas`, Neo4j, Diff Engine | 3자 간 불일치 항목을 Excel/UI 매트릭스로 자동 리포트 |
| **41** | 안전밸브(PSV/PRV) 및 블로우다운 검토 | `apps/api/piping/relief_checker.py` | PSV 전후 차단밸브 잠금표시(CSO/LO), 출구 배관 구경 ≥ 입구 구경, 드레인/벤트 유무, 플레어 헤더 경사(Slope) 표기 여부 검증 | Neo4j, Python Rule Engine | PSV 차단밸브 CSO 누락 및 출구 구경 축소 치명 오류 검출 |
| **42** | 보온(Insulation)·히트트레이싱 검증 | `apps/api/piping/insulation_checker.py` | 라인번호 보온코드(H/C/PP/ET/ST)와 공정 온도 조건(화상방지 ≥60°C, 동결방지 등) 및 전기 히트트레이싱 부하 연동 검증 | Python, Line List, Electrical Module | 고온 라인 인체보호(PP) 누락 및 ET 라인 전기 부하 누락 연동 경고 |
| **43** | 계장 노즐·탭 및 훅업(Hook-up) 검증 | `apps/api/piping/inst_tap_checker.py` | 압력/유량/온도/레벨 계기 연결부의 Root Valve, Drain/Vent, Thermowell, Orifice 직관부 요구사항 표시 여부 확인 | Neo4j, Rule Engine | 고압/위험유체 계기 Double Block & Bleed(DBB) 누락 경고 |
| **44** | 배관 경계(Battery Limit) 및 Tie-in 관리 | `apps/api/piping/tie_in_tracker.py` | 패키지 경계(Module 100/200/300 등) 및 메이커 Tie-in 포인트의 번호, 구경, 등급, 위치 일치 여부 자동 추적 | Neo4j, Python | 모듈 간 Tie-in 번호·구경·Class 불일치 100% 검출 |

---

### 영역 5 (45~55): 전기(Electrical)·계장(Instrument) SLD / 케이블 / 방폭 / SIS 검증 엔진

| 번호 | 지시 항목 | 대상/신규 모듈 | 핵심 구현 지시 내용 | 필수 기술스택 | 완료 기준 (DoD) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **45** | SLD 전원-부하 계통 트리 복원기 | `apps/api/electrical/sld_graph.py`, `electricalCommentEngine.ts` | [SLD 검토 기준](https://teinse.es/en/blog/single-line-diagram-review-before-panel-build/)에 따라 발전기/변압기→배전반(MSB/ESB/MCC)→피더 차단기→케이블→부하의 계층 트리를 그래프화 | Neo4j, YOLO/CV, Python | 모든 부하의 상류 전원·모선·차단기·페이지 참조 경로 추적 가능 |
| **46** | 전기 부하 합산 및 변압기/발전기 용량 검증 | `apps/api/electrical/load_calc.py` | SLD 및 Load List의 연속/간헐/비상 부하(kW, kVA, 역률, 수용률)를 합산해 변압기·배전반 정격 및 예비 피더(Spare ≥ 15~20%) 확보 여부 검산 | Python (`numpy`/`scipy`), `pandas` | 배전반/변압기 과부하 및 예비 용량 부족 자동 경고 |
| **47** | 단락전류·차단기 용량 및 보호협조 검토 | `apps/api/electrical/protection_checker.py` | 각 모선의 예상 단락전류(Isc) 대비 차단기 정격차단용량(Icu/Ics) 충족 여부 및 보호계전기(ANSI 50/51, 87, 27, 59 등) 표기 누락 검증 | Python Rule Engine, IEC 60909/61363 로직 | Isc 미기재 또는 차단용량 미달 차단기 Critical 플래그 |
| **48** | 케이블 규격·허용전류·전압강하 검산기 | `apps/api/electrical/cable_calc.py` | [IEC 61892-6 / IEC 60092-350](https://webstore.iec.ch/en/publication/29080) 기준 케이블 타입(동력/제어/계장, 난연/내화), 도체 단면적(mm²), 코어 수, 보정계수, 정상/기동 시 전압강하 자동 검산 | Python, Cable Ampacity Table | 허용전류 초과 또는 전압강하 기준(예: 정상 3~5%) 초과 케이블 검출 |
| **49** | SLD ↔ Load List ↔ Cable Schedule ↔ WD 4자 대조 | `apps/api/electrical/elec_reconciler.py`, `electricalCommentEngine.ts` | 기존 6종 전기 이슈(`CABLE_MISSING`, `WD_MISSING` 등)를 확장하여 4개 문서 간 태그·정격·케이블번호·코어수·From/To 전수 대조 | Neo4j, `pandas` | 누락 케이블, 미할당 HOLD, 블록 복사 오류(`BLOCK_COPY_ERROR`) 100% 추출 |
| **50** | 접지 계통(Earthing) 및 EMC/차폐 검증 | `apps/api/electrical/earthing_checker.py` | 시스템 접지 방식(IT/TN-S/TT), 보호접지(PE) 도체 크기, 계장 실드(Screen) 일점 접지 및 동력/신호 케이블 분리 표기 여부 검증 | Python Rule Engine, [IEC 61892](https://webstore.iec.ch/en/publication/28085) | 접지 방식 불일치 또는 계장 케이블 차폐/접지 누락 경고 |
| **51** | 방폭 구역(HAC) ↔ 전장/계기 Ex 마킹 교차 검증 | `apps/api/safety/ex_checker.py`, `specReviewEngine.ts` | [IEC 60079-10-1 / 60079-14](https://electricaltrader.com/blogs/news/iec-60079-parts-comparison-for-installers) 기준 Zone 0/1/2, 가스그룹(IIA/IIB/IIC), 온도등급(T1~T6)과 장비 Ex 등급(Ex d/e/ia/ib/p) 및 IP 등급 적합성 검증 | Neo4j, Python Rule Engine | Zone 1에 Ex n/일반품 배치 등 방폭 부적합 100% Critical 차단 |
| **52** | 본질안전(Ex i) 루프 파라미터 검산기 | `apps/api/safety/is_loop_calc.py` | [IEC 60079-11](https://www.weimiaocontrolpanels.com/post/a-complete-guide-to-explosion-proof-protection-types-ex-d-ex-e-ex-i-ex-p-ex-m-explained) 기준 배리어(Uo, Io, Po, Co, Lo)와 현장 계기(Ui, Ii, Pi, Ci, Li) + 케이블(Cc, Lc) 간의 본질안전 수식(`Uo≤Ui`, `Co≥Ci+Cc`, `Lo≥Li+Lc`) 자동 검산 | Python, Instrument Datasheet DB | IS 루프 에너지/커패시턴스/인덕턴스 초과 시 자동 불합격 판정 |
| **53** | SIS / ESD 밸브(`SDV`/`BDV`) 및 SIL 검증 | `apps/api/safety/sis_checker.py` | [IEC 61511](https://www.vajravyuh.com/blog/emergency-shutdown-esd-valve-guide) 기준 `SDV`/`BDV`의 SIL 등급, Fail-Safe(FC/FO), 솔레노이드(De-energize to trip), 리미트 스위치, PST, Fire-Safe(API 607) 요건 검증 | Neo4j, Python Rule Engine | ESD 밸브에 일반 제어밸브 오용 또는 Fail-Safe 누락 즉시 검출 |
| **54** | Cause & Effect(C&E) ↔ P&ID ↔ I/O List 연동 | `apps/api/safety/ce_reconciler.py` | C&E 매트릭스의 개시신호(Cause: PSHH, LSHH 등)와 최종요소(Effect: SDV, Pump Trip)가 P&ID 및 I/O List(DI/DO/AI/AO, Fail-Safe)와 일치하는지 대조 | `pandas`, Neo4j | C&E에 정의된 인터록이 P&ID 또는 I/O List에서 누락된 건 100% 검출 |
| **55** | 전기 코멘트 패키지 자동 크롭·리포트 고도화 | `apps/api/electrical/comment_packager.py`, `electricalCommentEngine.ts` | 기존 `CropRegionPct` 방식을 서버 고해상도 크롭 PNG + 근거 표준 조항 + 수정 권고안 + Excel/PDF/HTML 패키지 출력으로 확장 | PyMuPDF, Pillow, `openpyxl` | 검토자가 즉시 발송 가능한 공종별 전기 코멘트 패키지 원클릭 생성 |

---

### 영역 6 (56~66): 스펙 연동(Spec Compliance) 및 하이브리드 룰 엔진

| 번호 | 지시 항목 | 대상/신규 모듈 | 핵심 구현 지시 내용 | 필수 기술스택 | 완료 기준 (DoD) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **56** | 프로젝트 스펙 자동 분해·요구사항 추출기 | `apps/api/spec/spec_extractor.py`, `specReviewEngine.ts` | 수백 페이지 프로젝트 기술사양서(PDF/DOCX)에서 `shall`/`must` 의무 조항을 공종(배관/전기/계장/방폭/도장/시험)별 구조화 요구사항으로 자동 분해 | [Docling](https://github.com/docling-project/docling), LangGraph, Pydantic | 스펙 1권 업로드 시 공종별 체크리스트 항목 및 원문 페이지 자동 매핑 |
| **57** | 결정론적 룰 DSL 및 실행 엔진 | `apps/api/rules/rule_engine.py`, `verificationRules.ts` | 코드 수정 없이 YAML/JSON DSL로 수치·조건·존재성 검증 규칙을 정의하고 Cypher/Python으로 결정론적 실행하는 엔진 구축 | YAML, CEL / Python AST Sandbox, Neo4j | 비개발자 시니어 엔지니어도 UI 폼으로 신규 검증 규칙 등록·테스트 가능 |
| **58** | 표준 코드 레퍼런스 팩(Standard Packs) | `apps/api/spec/standards/` | ASME B31.3, ISA 5.1, ISO 10628, IEC 61892, IEC 60092, IEC 60079, IEC 61511, 선급(DNV/ABS/KR)별 재사용 가능한 기본 룰 팩 모듈화 | PostgreSQL, Qdrant/pgvector | 프로젝트 생성 시 적용 표준 팩 체크박스 선택만으로 즉시 룰셋 활성화 |
| **59** | 스펙 우선순위(Order of Precedence) 해소기 | `apps/api/spec/precedence.py` | 선주 요구사항(Client Spec) > 선급 규정(Class Rule) > 프로젝트 일반사양(General Spec) > 국제표준 간 충돌 시 우선순위 규칙으로 자동 판정 | Python Rule Engine | 상충하는 두 스펙 조항 발견 시 상위 우선순위 기준 적용 및 충돌 경고 |
| **60** | 하이브리드 판정기(Deterministic + LLM Judge) | `apps/api/spec/hybrid_judge.py` | 1차 결정론적 룰 판정 후, 비정형 서술 조항(예: 접근성, 유지보수 공간, 예비품 조건)만 LLM 판정기에 위임하고 신뢰도 점수(Confidence) 산출 | LangGraph, Pydantic | 정량 오류 False Positive < 3%, 비정형 판정에 근거 인용 100% 첨부 |
| **61** | 인용 강제 가드레일(Citation Guardrail) | `apps/api/spec/citation_guard.py` | 모든 스펙 위반 지적사항에 **원본 스펙 조항 번호 + 도면 좌표 크롭**이 실존하는지 교차 검증하여 환각 지적을 자동 폐기/보류 | Python Verifier, PyMuPDF | 근거 없는 AI 지적사항 출력률 0% |
| **62** | 심각도 자동 등급화 및 리스크 스코어링 | `apps/api/spec/severity_scorer.py`, `severitySummary.ts` | 안전/방폭/법규(Blocker·Critical), 기능/인터페이스(Major), 표기/문서(Minor) 기준 자동 등급화 및 프로젝트/모듈별 품질 점수 산출 | Python, PostgreSQL | 모듈·공종별 리스크 히트맵 및 승인 차단(Gate) 기준 자동 산출 |
| **63** | Human-in-the-Loop 학습 규칙 거버넌스 | `apps/api/rules/learned_governance.py`, `learnedKnowledgeEngine.ts` | 기존 `learnedKnowledgeEngine.ts`에 `Draft → Review → Approved → Deprecated` 상태 머신과 프로젝트 적용 범위(Global vs Project-only) 도입 | PostgreSQL, RBAC | 시니어 검토자 승인 없이 학습 규칙이 운영 검증에 자동 반영되지 않도록 통제 |
| **64** | 오탐(False Positive) 피드백 루프 | `apps/api/rules/feedback_loop.py` | 검토자가 "Dismiss(사유: 설계 예외/오인식)" 처리한 케이스를 패턴화해 유사 오탐 억제 및 규칙/모델 재학습 데이터셋으로 축적 | PostgreSQL, Langfuse | 반복 검토 회차당 동일 유형 오탐률 50% 이상 감소 |
| **65** | 예외·면제(Deviation / Waiver) 추적기 | `apps/api/spec/waiver_tracker.py` | 선주/선급 승인을 득한 스펙 예외(Deviation/TQ)를 등록하여 이후 리비전 재검토 시 승인된 예외를 중복 오류로 띄우지 않고 근거 표시 | PostgreSQL | 승인된 Deviation 번호 연결 시 상태를 `Approved Waiver`로 자동 구분 |
| **66** | 공종 간 크로스 스펙 일관성 검사기 | `apps/api/spec/cross_discipline.py` | 배관 스펙(유체/온도/압력) ↔ 전기 스펙(모터 kW/방폭/히트트레이싱) ↔ 계장 스펙(재질/SIL/신호) 간 3자 모순을 통합 탐지 | Neo4j, LangGraph | 단일 공종 검토에서 놓치는 공종 경계 스펙 모순 자동 적발 |

---

### 영역 7 (67~77): POS(Purchase Order Specification) 작성·검토·TBE 자동화 엔진

| 번호 | 지시 항목 | 대상/신규 모듈 | 핵심 구현 지시 내용 | 필수 기술스택 | 완료 기준 (DoD) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **67** | 요구사항 트리 기반 POS 데이터 모델 | `apps/api/pos/pos_model.py`, `posGeneratorEngine.ts` | `PurchaseOrderSpecDoc`를 정적 텍스트가 아닌 조항 ID, 출처(도면/스펙), 수치, 책임주체(Buyer/Vendor)를 가진 구조화 요구사항 트리로 재설계 | PostgreSQL, Pydantic v2 | POS의 모든 조항이 근거 도면·스펙과 양방향 링크(Traceability) 유지 |
| **68** | 도면·스펙 기반 POS 자동 초안 생성기 | `apps/api/pos/pos_generator.py`, `posGeneratorEngine.ts` | 대상 패키지(예: `POS-300-PKG` Recondenser) 선택 시 지식그래프에서 연결된 장비·배관·밸브·전기·계장·방폭·시험 요건을 자동 집계해 POS 초안 생성 | Neo4j, LangGraph, Jinja2 | 패키지 선택 후 2분 내 실무 표준 목차의 POS 초안 자동 생성 |
| **69** | Scope of Supply / Scope Split 매트릭스 자동화 | `apps/api/pos/scope_split.py` | 본체, 보조설비, 배관/밸브, 로컬 패널, 케이블/글랜드, 도장, 시운전, 예비품의 공급·설치·시험 책임(Vendor vs Shipyard/EPC)을 누락 없이 자동 배분 | Python Rule Engine, React Table | Scope Gap(양측 모두 미담당) 및 중복 공급 항목 100% 사전 경고 |
| **70** | 기자재 데이터시트(Datasheet) 자동 바인딩 | `apps/api/pos/datasheet_binder.py` | P&ID/Line List/Load List에서 추출한 공정·기계·전기 수치(유량, 압력, 온도, 재질, 모터 kW, 전압, Ex)를 표준 Datasheet 템플릿에 자동 기입 | `openpyxl`, Pydantic, Neo4j | POS 본문 수치와 첨부 Datasheet 수치 간 불일치 0건 보장 |
| **71** | VDRL(Vendor Data Requirements List) 자동 생성 | `apps/api/pos/vdrl_generator.py` | 기자재 유형(회전기계, 압력용기, 패키지, 배전반 등)별 필수 제출 도면(GA, P&ID, Wiring, Calculation, Mill Cert, FAT) 및 제출 기한(ARO + N주) 자동 생성 | PostgreSQL Template, Python | 패키지 유형에 맞는 표준 VDRL 목록 및 마일스톤 자동 첨부 |
| **72** | 검사·시험 계획(ITP / FAT / SAT) 및 선급 요건 연동 | `apps/api/pos/itp_builder.py` | 적용 선급(DNV/ABS/KR 등) 및 코드(ASME/IEC)에 따라 필수 Witness/Hold Point, 수압시험, NDT, FAT, 선급 증서(Certificate) 요구조항 자동 삽입 | Standard Packs, Python | 선급 증서 누락 및 필수 시험 항목 누락 방지 |
| **73** | POS 내부 일관성·누락 자가 검토 엔진 | `apps/api/pos/pos_reviewer.py` | 작성 완료된 POS 문서 자체를 스캔하여 ① 본문 vs Datasheet 수치 충돌, ② 미확정 `HOLD`/`TBD` 잔존, ③ 누락된 참조 스펙, ④ 모호한 책임 조항 검출 | LangGraph, Deterministic Checker | 발주 전 POS 품질 게이트 체크리스트 자동 채점 및 경고 |
| **74** | 벤더 기술제안서 파싱 및 TBE(기술입찰평가) 엔진 | `apps/api/pos/tbe_engine.py` | 복수 벤더의 기술제안서·견적사양서(PDF/Excel)를 파싱해 POS 요구사항 트리 대비 항목별 준수(`Comply` / `Deviation` / `Missing`) 비교표 자동 생성 | [Docling](https://github.com/docling-project/docling), LangGraph, `openpyxl` | 3개 이상 벤더 제안서의 TBE 매트릭스 및 TQ(Technical Query) 초안 자동 산출 |
| **75** | TQ(Technical Query) 및 Deviation 관리 루프 | `apps/api/pos/tq_manager.py` | 입찰·설계 단계에서 발생하는 기술 질의(TQ)와 벤더 예외 요청(Deviation)의 답변·승인 결과를 POS 최종 리비전에 자동 반영 | PostgreSQL, Audit Trail | 발주 확정 POS(For Purchase)에 합의된 모든 TQ/Deviation 누락 없이 반영 |
| **76** | 예비품(Spare Parts) 및 특수공구·보증 조항 검토 | `apps/api/pos/spares_checker.py` | 시운전용 예비품(Commissioning Spares), 2년 운전 예비품(2-Year Operational Spares), 특수공구, 성능보증(Performance Guarantee) 조항 충족 여부 검증 | Python Rule Engine, LLM Judge | 상업/기술 분쟁 빈발 조항 누락 자동 검출 |
| **77** | POS 다중 포맷 공식 문서 내보내기 | `apps/api/pos/pos_exporter.py`, `templateReportHtmlExporter.ts` | 회사 표준 헤더/리비전 블록이 적용된 Word(`.docx`), PDF, Excel(Datasheet/VDRL/Scope Split) 일괄 패키징 출력 | `python-docx`, `openpyxl`, Chromium PDF | 발주 부서에 즉시 이관 가능한 공식 POS 패키지 원클릭 다운로드 |

---

### 영역 8 (78~88): 메이커 도면(Vendor Drawing) 검토·경계점·CRS 자동화 엔진

| 번호 | 지시 항목 | 대상/신규 모듈 | 핵심 구현 지시 내용 | 필수 기술스택 | 완료 기준 (DoD) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **78** | 메이커 도면 자동 분류 및 VDRL 매칭 | `apps/api/maker/vdrl_matcher.py`, `universalDrawingAnalyzer.ts` | 벤더 제출 파일(GA, P&ID, Wiring, Foundation, Datasheet, Calc, Manual)을 자동 분류하고 POS의 VDRL 목록과 매칭해 미제출·지연 도면 추적 | Layout Classifier, PostgreSQL | 벤더 제출물 업로드 즉시 VDRL 진도율 및 누락 도면 자동 갱신 |
| **79** | 메이커 도면 ↔ POS 요구사항 자동 대조 | `apps/api/maker/pos_compliance.py` | 발주 확정 POS 요구사항 트리(재질, 용량, 압력, 방폭, 도장, 선급, 예비품)와 메이커 제출 도면·데이터시트의 수치를 1:1 자동 대조 | Neo4j, Unit Converter, LangGraph | POS 대비 임의 다운그레이드·사양 변경 항목 100% 자동 적발 |
| **80** | 배관 Battery Limit(노즐·플랜지) 3자 검증 | `apps/api/maker/piping_interface.py` | 메이커 GA/P&ID의 노즐 리스트(Nozzle Tag, Size, Rating, Facing, Elevation/Coords)와 모도면(Parent P&ID) 및 POS 간 3자 정합성 검증 | Neo4j, `pandas`, Unit Converter | 노즐 구경·플랜지 등급·페이싱·좌표 불일치 즉시 Critical 리포트 |
| **81** | 전기 Battery Limit(전원·용량·단자) 3자 검증 | `apps/api/maker/elec_interface.py` | 메이커 로컬 패널/모터의 전압·상수·주파수·소비전력(kW/FLA)·기동방식·케이블 인입구(Gland Size)·접지 요건을 모도면 SLD/Load List와 대조 | Neo4j, Electrical Calc Module | 전원 사양 불일치 및 케이블 글랜드 규격 오차 자동 검출 |
| **82** | 계장·통신 인터페이스(I/O·Protocol) 검증 | `apps/api/maker/inst_interface.py` | 메이커 패키지 내부 계기의 원격 신호(AI/AO/DI/DO, 4-20mA, Dry Contact, Modbus/Profibus/OPC-UA)와 조선소/EPC 제어시스템(IAS/DCS/ESD) I/O 매핑 검증 | Neo4j, `pandas` | 신호 타입 불일치, 통신 맵 누락, ESD 하드와이어드 누락 검출 |
| **83** | 구조·중량·설치공간(GA) 검토 보조기 | `apps/api/maker/ga_checker.py` | 메이커 GA 도면에서 전체 치수(L×W×H), Dry/Operating/Test 중량, 무게중심(CoG), 앵커볼트 패턴, 유지보수 공간(Maintenance Clearance) 추출 및 GAR 도면과 대조 | PaddleOCR, VLM Cropped Parsing, Unit Converter | 치수/중량 누락 또는 기존 배치도(GAR) 대비 중량/외형 급변 경고 |
| **84** | 메이커 도면 리비전 간 재검토(Back-Check) | `apps/api/maker/back_checker.py` | Rev.0에서 발행한 코멘트(CRS)가 Rev.1 재제출 도면의 해당 좌표 영역에서 실제로 수정 반영되었는지 Visual Diff + 텍스트 재파싱으로 자동 검증 | OpenCV Diff, PyMuPDF, VLM | 이전 라운드 코멘트의 미반영(Unresolved) 항목 자동 플래깅 |
| **85** | CRS(Comment Resolution Sheet) 자동 생성 | `apps/api/maker/crs_generator.py` | 모든 메이커 도면 불일치 항목을 표준 CRS 양식(No, DWG No, Page/Zone, Severity, Comment, Standard/POS Ref, Crop Image, Vendor Reply, Status)으로 생성 | `openpyxl`, PyMuPDF, Pillow | 벤더 회신용 표준 Excel/PDF CRS 및 도면 레드라인 패키지 자동 출력 |
| **86** | 도면 승인 코드(Review Status Code) 자동 권고 | `apps/api/maker/status_recommender.py` | 검출된 이슈의 심각도 분포에 따라 `Code 1 (Approved)`, `Code 2 (Approved with Comments)`, `Code 3 (Revise & Resubmit)` 권고 및 최종 승인자 결재 연동 | Python Rule Engine, RBAC | Critical 이슈 1건 이상 시 Code 1 승인 원천 차단(Gate) |
| **87** | 벤더 회신(Vendor Reply) 자동 분석기 | `apps/api/maker/reply_analyzer.py` | 벤더가 회신한 CRS Excel을 업로드하면 각 코멘트별 수용/거절/조건부 수용 의도를 파싱하고 거절·미흡 답변만 검토자에게 우선 하이라이트 | `openpyxl`, LLM Judge | 수백 건 CRS 회신 검토 시간 70% 이상 단축 |
| **88** | 메이커 확정 도면 → 모도면 역반영(As-Built Sync) | `apps/api/maker/asbuilt_sync.py` | Code 1 승인된 메이커 도면의 확정 수치(최종 중량, 확정 kW, 노즐 좌표, 태그)를 지식 그래프와 모도면 업데이트 대기열(ECR)에 자동 반영 | Neo4j, PostgreSQL | 벤더 확정 데이터와 조선소/EPC 모도면 간 최신화 누락 방지 |

---

### 영역 9 (89~99): 종합 설계가이드 UX, 멀티에이전트, QA·보안 및 단계별 로드맵

| 번호 | 지시 항목 | 대상/신규 모듈 | 핵심 구현 지시 내용 | 필수 기술스택 | 완료 기준 (DoD) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **89** | 종합 설계가이드(Living Design Guide) 허브 | `apps/web/src/pages/DesignGuideHub.tsx` | 단순 오류 대시보드를 넘어 공종별(배관/전기/계장/방폭/POS/메이커) 설계 기준, 계산 공식, 필수 체크리스트, 표준 요약, 과거 교훈(Lessons Learned)을 탐색·적용하는 가이드 허브 구축 | React 19, GraphRAG, Markdown/KaTeX | 설계자가 작업 전 해당 공종 설계가이드·체크리스트를 원클릭 조회 |
| **90** | LangGraph 공종별 멀티에이전트 오케스트레이터 | `apps/api/agents/orchestrator.py` | Router → Parser → Piping/Electrical/Safety/POS/Maker 전문 에이전트 병렬 실행 → Cross-Discipline Arbitrator → Citation Guardrail → Human Approval 상태 그래프 구현 | [LangGraph](https://neo4j.com/labs/genai-ecosystem/genai-frameworks/langgraph/), Python | 단일 도면/패키지 투입 시 공종별 에이전트 자동 라우팅 및 병렬 완료 |
| **91** | 고성능 웹 도면 뷰어 및 레드라인 어노테이션 | `apps/web/src/components/DrawingCanvas.tsx`, `SplitPdfViewer.tsx` | 대용량 도면 60fps 팬/줌, 좌우 Split 비교(P&ID vs SLD, Rev.0 vs Rev.1), 이슈 클릭 시 해당 좌표 자동 포커스 및 브라우저 레드라인·클라우드 마크업 지원 | Konva.js / Fabric.js, `pdfjs-dist` | 이슈 클릭 0.2초 내 도면 좌표 하이라이트 및 레드라인 저장/내보내기 |
| **92** | 인터랙티브 토폴로지 그래프 탐색기 | `apps/web/src/components/TopologyExplorer.tsx` | D3 단순 시각화에서 발전시켜 특정 태그 기준 상류/하류 배관·전원·제어 루프·연관 스펙·POS를 노드 확장으로 탐색하는 그래프 UI 구현 | Cytoscape.js / React Flow, Neo4j API | 500개 이상 노드 그래프의 부드러운 필터링·경로 하이라이트 |
| **93** | 대화형 근거 기반 엔지니어링 코파일럿 | `apps/web/src/components/EngineeringCopilot.tsx` | [Provision AI Chat Agent](https://provision.com/blog/8-best-ai-agents-for-reviewing-construction-drawings-specs-and-contrac) 수준으로 도면·스펙·POS·CRS 전체에 자연어 질의하고, 모든 답변에 클릭 가능한 도면 좌표·스펙 페이지 링크 제공 | GraphRAG, LangGraph Streaming | 모든 질의응답에 출처 문서·페이지·도면 좌표 링크 100% 포함 |
| **94** | SAP / ERP / PLM / 문서관리(EDMS) 연계 API | `apps/api/integrations/`, `SapSidebar.tsx` | 기존 `SapSidebar.tsx` UI를 실제 ERP/PLM(SAP 자재코드·구매요청 PR, EDMS 도면 리비전, Procore/AVEVA/SmartPlant) 웹훅·REST 연동 어댑터로 구현 | FastAPI, REST/Webhook, OAuth2 | 자재/장비 마스터 코드 동기화 및 POS→PR 초안 연계 지원 |
| **95** | 골든 데이터셋 및 자동 평가(Eval) 파이프라인 | `tests/eval/` (신규) | H042 포함 공종별 정답(Ground Truth) 도면·스펙·메이커 도면 세트를 구축하고 태그 추출 F1, 이슈 재현율(Recall), 오탐률(FPR), 환각률을 CI에서 자동 측정 | `pytest`, Vitest, Promptfoo / Ragas | PR 머지 시 골든셋 기준 핵심 지표 회귀(Regression) 자동 차단 |
| **96** | 단위·통합·E2E 테스트 체계 확립 | `tests/`, `src/utils/*.test.ts` | 기존 Vitest 유틸 테스트를 유지·확장하고, Python 엔진(`pytest`), API 계약 테스트, 프론트엔드 핵심 워크플로우(`Playwright`) E2E 자동화 | `pytest`, Vitest, Playwright, GitHub Actions | CI 파이프라인 테스트 통과율 100% 및 핵심 엔진 커버리지 ≥ 80% |
| **97** | 관측성(Observability) 및 LLM 트레이싱 | `apps/api/telemetry/` (신규) | API 지연, OCR/CV 처리 시간, LLM 토큰·비용, 에이전트 단계별 입출력·실패 원인을 실시간 추적하는 대시보드 구축 | OpenTelemetry, Prometheus/Grafana, Langfuse | 모든 분석 잡의 단계별 소요시간·비용·에러 트레이스 실시간 확인 |
| **98** | 엔터프라이즈 보안·암호화·온프레미스 격리 | `deploy/security/` (신규) | 도면·POS 영업비밀 보호를 위한 저장 암호화(AES-256), 전송 암호화(TLS 1.3), 민감정보 마스킹, 망분리(Air-gapped) 온프레미스 배포 패키지 검증 | TLS, Vault/KMS, Docker Air-gap Bundle | 외부 인터넷 차단 환경에서도 온프레미스 모델로 전 기능 정상 동작 |
| **99** | 4단계 실행 로드맵 및 마일스톤 게이트 | `docs/ROADMAP.md` (신규) | **Phase 1(1~4주)**: 인프라·DB·FastAPI·PyMuPDF/PaddleOCR·ezdxf(항목 01~22) → **Phase 2(5~8주)**: DEXPI/Neo4j·배관/전기/방폭/SIS 결정론적 엔진(23~55) → **Phase 3(9~12주)**: 스펙연동·POS·TBE·메이커도면/CRS(56~88) → **Phase 4(13~16주)**: 종합 설계가이드·LangGraph·보안·골든셋 QA(89~99) | GitHub Projects / Jira, CI Gate | 각 Phase 종료 시 골든 데이터셋 정량 KPI 통과 후 다음 Phase 진입 |

---

## 5. AI 코딩 에이전트 및 개발팀용 즉시 착수 지시 프롬프트 (Execution Brief)

개발팀 또는 코딩 에이전트에게 `byjay/dwg_anl1` 고도화 작업을 지시할 때는 아래 순서와 원칙을 강제합니다.

1. **원칙 1 (결정론 우선, LLM 보조)**: 배관 Class/압력-온도, 전기 전류/전압강하/차단용량, 방폭 Zone/Ex 마킹, 본질안전 수식, OPC 연결, 노즐 규격 대조는 **반드시 Python 결정론적 코드 및 Neo4j Cypher 쿼리**로 구현하고, LLM은 비정형 노트 해석·스펙 문장 매칭·POS/CRS 문구 작성에만 사용한다.
2. **원칙 2 (근거 없는 출력 금지)**: 모든 검토 코멘트, 스펙 지적, POS 조항, 메이커 도면 불일치 결과는 반드시 `source_document`, `page_or_sheet`, `bbox_or_crop_url`, `standard_clause_ref` 4개 필드를 포함해야 하며, 누락 시 파이프라인에서 자동 필터링한다.
3. **원칙 3 (H042 하드코딩 제거)**: `src/data/h042Dataset.ts`와 `h042NotesSeed.ts`는 **골든 테스트 시드(Fixture)**로만 격리 이동시키고, 운영 로직은 100% 프로젝트 독립적 DB·그래프·가변 Tag Grammar 기반으로 동작하게 리팩터링한다.
4. **원칙 4 (단계별 검증 게이트)**: 영역 1~2(파싱·인프라) 완료 시 `H042` 8종 PDF에서 기존 정규식 대비 태그·심볼·연결성 재현율 향상을 수치로 증명한 뒤 영역 3~8(도메인 엔진)으로 진입한다.
