# H042 엔지니어링 AI 엔진 고도화 로드맵 (16주 · 4-Phase)

현재 코드베이스는 Node/Express + React/TypeScript 기반의 단일 컨테이너 워크벤치로 **결정론적 검증·PDF 벡터 좌표·반투명 AI 오버레이·공학 계산기·POS/코멘트 자동 생성**을 실행합니다. 대규모 전사 엔지니어링 플랫폼 확장을 위한 외부 인프라 전환 로드맵은 다음과 같습니다.

## Phase 1 (1~4주): 영속성 & 스토리지 인프라 전환 (Directives #03, #04, #08, #10)
- **PostgreSQL + Prisma**: `localStorage` 기반 핀 노트·학습 규칙·체크리스트 검증 이력을 관계형 DB(`projects`, `drawings`, `loops`, `pin_notes`, `audit_logs`)로 이관.
- **S3 / MinIO 객체 스토리지**: 대용량 다중 리비전 PDF/CAD 파일을 콘텐츠 해시 기반 불변 아카이브로 저장하고 Presigned URL 스트리밍 제공.
- **Docker Compose & Redis Rate Limiter**: API Gateway(`server.ts`)에 토큰 버킷 제한과 429 Exponential Backoff 적용.

## Phase 2 (5~8주): CAD 네이티브 파싱 & Graph Worker 분리 (Directives #05, #06, #16, #17, #19)
- **FastAPI + BullMQ/Celery 워커**: 무거운 PDF 타일링(Slicing + Overlap), `ezdxf`/Smart P&ID XML 파싱, CV 심볼 탐지(밸브/계기/Spec Break)를 비동기 워커로 분리.
- **SSE 실시간 진행률**: 도면 분석 및 N-Way 조인 진행 상황을 브라우저로 스트리밍.
- **Qdrant Vector RAG**: 선급 규칙(DNV/KR/ABS), 사내 표준 스펙 조항 하이브리드 검색(BM25 + Dense) 연동.

## Phase 3 (9~12주): 심화 공종 계산 & 3D/벤더 협업 확장 (Directives #29, #39, #41, #47, #53, #54, #70, #71, #80, #81)
- **Neo4j Dependency Graph**: N-Hop 변경 영향도 자동 전파(Line Spec 변경 → 밸브/보온/PSV/C&I 동시 알림).
- **전기/배관 심화 해석**: IEC 60909 단락 전류·차단기 협조, API 520 PSV 배압, Cause & Effect(C&E) 매트릭스 편집기.
- **VDRL / ITP / CRS**: 벤더 제출도서 일정 트래킹 및 Rev.A→Rev.B 코멘트 자동 Back-Check 클로징.

## Phase 4 (13~16주): 거버넌스, TBE, AI Eval Gate (Directives #07, #63, #72, #95)
- **Keycloak OIDC & RBAC**: 공종(배관/전기/계장/조달)별 승인 권한 및 Waiver 전자결재 감사 로그.
- **TBE(Technical Bid Evaluation)**: 다중 벤더 견적서 자동 비교 평가표 생성.
- **AI Eval Harness KPI Gate**: 골든 데이터셋 100+ 케이스 기준 Recall ≥ 95%, Citation Grounding = 100%, Hallucination Rate < 1% 통과 시 배포 승인.
