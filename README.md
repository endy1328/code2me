# code2me

현재 저장소는 요구사항과 설계 정리를 마친 뒤, `TypeScript + Node.js` 기반 첫 수직 슬라이스 구현과 Legacy Java EE 진입 흐름 리포트 고도화에 들어간 상태다.

이 저장소는 메인 에이전트가 전체 작업을 조율하고, 필요 시 계획, 실행, 검증, 상태 보고용 서브에이전트를 생성해 병렬로 처리하는 운영 방식을 기본으로 사용한다. 업무 분할이 가능하면 효용성에 맞춰 추가 서브에이전트도 생성한다.

## Current State

- 코드베이스에는 CLI 코어, Legacy Java EE 어댑터, 샘플 입력, 테스트, 인터랙티브 리포트가 포함되어 있다.
- 운영 문서, 설계 문서, 개발/테스트 기준 문서가 함께 유지된다.
- 현재는 Legacy Java EE 기준 프레임워크 부트스트랩 흐름, 화면/API 요청 흐름, 메서드 단위 concrete flow, 화면 액션과 다음 흐름 추적, 공통 라이브러리 축, 대형 리포트 탐색성까지 포함한 첫 구현을 마친 상태다.

## Documents

- [agent.md](./agent.md): 메인 에이전트와 서브에이전트 운영 규칙
- [plan.md](./plan.md): 현재 기준 남은 작업과 실행 준비 목록
- [status.md](./status.md): 현재 진행 상태와 다음 체크포인트
- [verification.md](./verification.md): 작업 종료 시 적용할 검증 기준
- [worklog.md](./worklog.md): 메인 에이전트 기준 작업 이력
- `dev_docs/01.requirement_analysis`: 개발 전 요구사항 및 조사/분석 문서
- `dev_docs/02.design`: 런타임/아키텍처 결정 문서
- `dev_docs/03.development`: 구현 단계 계획 문서
- `dev_docs/04.testing`: 검증 시나리오 및 테스트 기준 문서

## Current Implementation

- `TypeScript + Node.js` 기반 CLI-first 구조로 첫 수직 슬라이스를 시작했다.
- 현재 구현 범위는 `Legacy Java EE` 프로파일, persistence/view/layout 확장 어댑터, 프레임워크 흐름/화면 흐름/API 흐름/흐름 상세/화면 액션/공통 라이브러리 리포트다.
- 샘플 입력은 `samples/legacy-java-ee-minimal`, `samples/legacy-java-ee-sitemesh-pattern`, `samples/legacy-java-ee-sitemesh-alias`, `samples/legacy-java-ee-sitemesh-direct` 아래에 있다.
- 분석 결과는 분석 대상 프로젝트 아래 `.code2me/` 디렉터리에 저장되고, 동시에 현재 프로그램 내부 `.code2me-result/projects/<project-key>/`에도 미러 저장된다.

## Requirements

- `Node.js >= 22`
- `npm >= 10`

## Quick Start

1. 의존성을 설치한다.

```bash
NPM_CONFIG_CACHE=/tmp/.npm npm install
```

2. 타입 체크와 테스트를 실행한다.

```bash
NPM_CONFIG_CACHE=/tmp/.npm npm run check
NPM_CONFIG_CACHE=/tmp/.npm npm test
```

3. 샘플 Legacy Java EE 프로젝트를 분석한다.

```bash
NPM_CONFIG_CACHE=/tmp/.npm npm run analyze -- samples/legacy-java-ee-minimal
NPM_CONFIG_CACHE=/tmp/.npm npm run analyze -- samples/legacy-java-ee-sitemesh-pattern
NPM_CONFIG_CACHE=/tmp/.npm npm run analyze -- samples/legacy-java-ee-sitemesh-alias
NPM_CONFIG_CACHE=/tmp/.npm npm run analyze -- samples/legacy-java-ee-sitemesh-direct
```

실행 중에는 `stderr`에 진행률이 표시된다.

```text
[  0%] Starting analysis
[  5%] Building file index
[ 15%] Detecting profile
[ 20%] Running adapter Ant build.xml Adapter (0/8)
...
[100%] Analysis complete
```

4. 생성된 결과를 확인한다.

```bash
cat samples/legacy-java-ee-minimal/.code2me/summary.md
```

5. 인터랙티브 HTML 리포트를 브라우저에서 연다.

```bash
xdg-open samples/legacy-java-ee-minimal/.code2me/report.html
```

CLI JSON 출력에는 선택된 `profileId` 외에도 `profileDetection.score`, `profileDetection.reasons`, `internalOutputDir`, `targetWriteError`가 포함되어 프로파일 자동 추천 근거와 내부 미러 저장 상태를 바로 확인할 수 있다. 대상 프로젝트 쓰기가 실패하면 기본 `outputDir`, `reportPath` 등은 내부 미러 경로를 가리키고, 원래 대상 경로는 `targetOutputDir`, `targetReportPath` 등으로 별도 노출된다.

## Commands

- 의존성 설치: `NPM_CONFIG_CACHE=/tmp/.npm npm install`
- 타입 체크: `NPM_CONFIG_CACHE=/tmp/.npm npm run check`
- 테스트: `NPM_CONFIG_CACHE=/tmp/.npm npm test`
- 빌드: `NPM_CONFIG_CACHE=/tmp/.npm npm run build`
- 샘플 분석: `NPM_CONFIG_CACHE=/tmp/.npm npm run analyze -- samples/legacy-java-ee-minimal`
- SiteMesh 패턴 샘플 분석: `NPM_CONFIG_CACHE=/tmp/.npm npm run analyze -- samples/legacy-java-ee-sitemesh-pattern`
- SiteMesh alias 샘플 분석: `NPM_CONFIG_CACHE=/tmp/.npm npm run analyze -- samples/legacy-java-ee-sitemesh-alias`
- SiteMesh direct 샘플 분석: `NPM_CONFIG_CACHE=/tmp/.npm npm run analyze -- samples/legacy-java-ee-sitemesh-direct`

## Output

분석 실행 후 대상 프로젝트 루트 아래 `.code2me/` 디렉터리가 생성된다. 같은 결과가 현재 프로그램 루트 아래 `.code2me-result/projects/<project-key>/`에도 함께 저장된다.

- `snapshot.json`: 병합된 그래프 결과
- `history.jsonl`: 실행 이력 요약
- `summary.md`: 사람이 바로 읽을 수 있는 Markdown 요약
- `report.html`: 안정적인 요약 전용 메인 리포트
- `explore.html`: 대형 결과에서 분리된 탐색 전용 미리보기 페이지
- `evidence.html`: 대형 결과에서 분리된 근거 전용 미리보기 페이지
- `raw.html`: 원본 파일 접근 허브 페이지

내부 미러 `.code2me-result/projects/<project-key>/`에는 같은 파일 세트가 복제된다. 대상 프로젝트가 읽기 전용이거나 `.code2me/` 쓰기에 실패해도 내부 미러는 먼저 저장되므로, 메인 에이전트는 이 경로 기준으로 결과를 계속 확인할 수 있다.

## Report Navigation

`report.html`은 초보자가 먼저 `앱이 어떻게 요청을 받는가`를 이해하고, 그다음 `특정 화면/API 요청이 어떤 코드 경로를 타는가`를 따라가도록 재구성된 요약 전용 페이지다.

- `Start Here`: 보고서 읽는 순서, 대표 `Framework Flow`, 대표 `Screen Flow`, 대표 `API Flow` 요약
- `Framework Flow`: `web.xml -> DispatcherServlet -> dispatcher-servlet.xml -> applicationContext*.xml -> request mapping` 부트스트랩 흐름 보기
- `Screen Flows`: `요청 URL -> Controller/Action -> Service -> DAO -> Mapper/SQL -> View -> Layout` 중심의 화면 요청 흐름 보기
- `API Flows`: `요청 URL -> Controller/Action -> Service -> DAO -> Mapper/SQL -> Response` 중심의 API/액션 요청 흐름 보기
- `Flow Details`: 각 흐름 카드를 눌렀을 때 `Entry Setup -> Request Path -> Business Steps -> Data Access -> View/Response -> UI Actions -> Related Configs` 순서로 상세 추적
- `Supporting Structure`: `Data Flow`, 모듈/배포 단위/설정 파일, `shared-lib` 같은 공통 라이브러리 축 보기
- `Explore`: 메인 리포트에서는 분리 페이지 `explore.html`로 이동
- `Evidence`: 메인 리포트에서는 분리 페이지 `evidence.html`로 이동
- `Raw / JSON`: 메인 리포트에서는 `raw.html`과 `snapshot.json` 링크로 이동

`type` 필터는 현재 탭 안에서 항목 종류를 좁히는 용도다. `가로형/카드형` 토글은 `Framework Flow`, `Screen Flows`, `API Flows`, `Supporting Structure` 카드 레이아웃을 바꾸는 용도다. 각 결과 목록 섹션 제목에는 현재 필터 기준 `조회 건수`가 함께 표시된다. `Framework Flow`는 `web.xml`의 `url-pattern`, `DispatcherServlet`, `contextConfigLocation`, 선언된 Spring 설정 파일을 기준으로 “이 앱이 왜 이 URL을 받을 수 있는가”를 설명한다. `Screen Flows`와 `API Flows`는 가능하면 controller class가 아니라 `handler method + 단일 URL` 기준의 concrete flow로 쪼개져, `URL -> action method -> service/dao -> view/response`를 그대로 보여준다. 여기에는 Spring annotation 기반 매핑뿐 아니라 `SimpleUrlHandlerMapping + PropertiesMethodNameResolver`로 정의된 `*.as` URL도 포함된다. `Flow Details`는 선택된 concrete flow를 기준으로 `UI Actions`까지 보여주며, JSP 안의 `a href`, `form action`, `onclick`, `fetch`, `ajax`, `location.href`, `window.open` 신호를 추출해 “이 버튼/링크를 누르면 다음에 어떤 URL/API 흐름으로 가는가”를 연결한다. 관련 데이터가 있을 때만 `Open Data Flow` 액션이 노출된다. `Data Flow`는 `queries` edge가 없더라도 `Controller -> Service -> DAO` 체인을 먼저 만들고, DAO 이름과 mapper namespace suffix가 맞으면 `Mapper/SQL`도 fallback으로 채운다. `SiteMesh`는 pattern decorator뿐 아니라 `name`이 alias이고 `page`가 실제 layout 파일인 direct decorator도 해석한다. `Shared Library Anchor`는 `shared-lib` 같은 공통 라이브러리 허브를 별도 카드로 요약해 `class/config/service/dao` 규모와 주요 연결 컨트롤러를 함께 보여준다. 대형 스냅샷에서는 메인 `report.html`이 흐름 요약 중심으로 유지되고, 무거운 `Explore`, `Evidence`, `Raw`는 각각 `explore.html`, `evidence.html`, `raw.html`로 분리된다.

## Working Rules

- 메인 에이전트가 작업 순서, 서브에이전트 배치, 최종 산출물을 정리한다.
- 계획이 필요하면 계획 서브에이전트를 생성한다.
- 분할 가능한 일은 업무별 서브에이전트로 나누고, 필요하면 추가 서브에이전트를 더 생성한다.
- 각 작업 종료 시 별도 검증 에이전트가 결과를 확인한다.
- 상태 보고는 별도 상태 에이전트가 주기적으로 맡는다.
- 최종 조율과 통합은 메인 에이전트가 담당한다.
- 개발 관련 문서는 작업 완료 시점 기준으로 항상 최신 상태를 유지한다.
