# H042 Engineering Diagram & Spec Workbench (SAP-Style E&I / Piping / POS Platform)

Marine FGSS (H042) 프로젝트의 배관 도면(`P&ID`, `GAR`), 전장·계장 결선도(`iCAMS`, `PSDS`), 메이커 패키지 도면(`CS15`), 스펙 검토(`CL03`), 엔지니어링 룰·학습 지식베이스(`ZRL1`, `ZP01`), POS 발주사양서(`ME21N`), 첨부 양식 기반 전기 코멘트 보고서(`QM02`), 그리고 1~99 종합 체크리스트·설계 계산 허브(`ZCL99`)를 하나로 통합한 엔지니어링 검증 워크벤치입니다.

## 주요 모듈 (SAP T-Code 매핑)

| T-Code | 모듈명 | 핵심 기능 |
| --- | --- | --- |
| `CV03N` | 도면·OCR 분석 | PDF 벡터 텍스트/테이블 추출, 다각도 Tesseract OCR, 자동 태그 분류 |
| `CS15` | 메이커 도면·I/O 분석 | 300-V-001 Recondenser 등 벤더 패키지 Battery Limit 및 I/O 경계 검증 |
| `MD04` | 3-Way 교차 매칭 | P&ID ↔ GAR ↔ iCAMS/PSDS 병렬 매칭 및 D3 Sunburst 현황 시각화 |
| `CC03` | 변경·리비전 비교 | 4-Layer Cross-Diff 및 리비전 드래프트 추적, 좌/우 PDF 동시 이동 |
| `CL03` | 스펙(Spec) 검토 | 6.6kV 케이블(6/10kV), 30C SLD 연계, EL-GAR 누락, 방폭·극저온 스펙 감사 |
| `ZRL1` | 엔지니어링 룰 검토 | 결정론적 규칙 검증 및 커스텀 룰 추가/심각도 관리 |
| `ZP01` | 학습된 지식베이스 | HITL(Human-in-the-Loop) 경험 규칙 축적 및 스펙/POS 자동 반영 |
| `ME21N` | POS 발주사양서 생성 | Scope Split 매트릭스, Material Code 라인아이템, Hold Gate & HTML 출력 |
| `QM02` | 문제점 보고서(첨부양식) | 원본 PDF 스냅샷·근거 페이지 포함 전기 다이어그램 코멘트 보고서 자동 생성 |
| `VA03` | 시그널 루프 추적 | 아이콘·케이블 기반 토폴로지 및 단자/JB/캐비닛 End-to-End 추적 |
| `CV04N` | 분할 PDF 도면 뷰어 | 좌/우 동기화 PDF 캔버스, **AI 텍스트 영역 반투명 오버레이**, 실시간 포인터 공유 세션 |
| `ZAI1` | 병렬 AI 정밀 감사 | 로컬 PDF 벡터 즉시 스캔(무료) 및 Gemini 3-Track 병렬 추론 |
| `ZCL99` | 1~99 체크리스트·가이드 | 9개 영역 99개 지시사항 적용 점검표, 공학 계산기(ΔV%/Ex-i/B31.3/SI/DEXPI) |

## 실행 및 검증

```bash
npm install
npm run dev       # Express + Vite 개발 서버 (Port 3000)
npm run build     # 프로덕션 번들 빌드
npm run lint      # TypeScript 타입 검사 (tsc --noEmit)
npx --yes tsx --test src/utils/*.test.ts  # 순수 도메인/계산 엔진 단위 테스트
```

## 환경 변수 및 보안 가이드

- `GEMINI_API_KEY`: 서버 측(`server.ts`)에서만 읽으며 브라우저 클라이언트에 노출되지 않습니다. API 키가 없어도 `ZAI1`의 **로컬 PDF 벡터 즉시 스캔**, `CV03N`, `CV04N` 반투명 오버레이, `QM02`, `ME21N`, `ZCL99` 모든 결정론적 기능이 정상 동작합니다.
- `GET /api/health`: 현재 모델, Thinking Level, 카탈로그 수량, Citation Guardrail 활성 상태를 JSON으로 반환합니다.
