# code2me

`code2me`는 레거시 애플리케이션을 정적으로 분석해 `요청 URL -> Controller -> Service -> DAO -> View/Response` 흐름을 읽기 쉬운 보고서로 재구성하는 CLI 도구다.

현재 구현은 `TypeScript + Node.js` 기반이며, 첫 번째 분석 프로파일로 `Legacy Java EE`를 지원한다.

## Current State

- CLI 코어, Legacy Java EE 어댑터, 샘플 입력, 테스트, 인터랙티브 HTML 리포트가 포함되어 있다.
- 현재는 프레임워크 부트스트랩 흐름, 화면/API 요청 흐름, 메서드 단위 concrete flow, JSP UI action 추적, 데이터 접근 축 요약, 대형 리포트 분리 출력까지 포함한 첫 구현을 마친 상태다.

## Repository Layout

- `src/`: 분석 코어, 어댑터, 리포트 렌더러
- `tests/`: 회귀 테스트
- `samples/`: Legacy Java EE 샘플 프로젝트
- `dev_docs/`: 요구사항, 설계, 개발, 테스트 메모

## Current Implementation

- `TypeScript + Node.js` 기반 CLI-first 구조다.
- 현재 구현 범위는 `Legacy Java EE` 프로파일, persistence/view/layout 확장 어댑터, 프레임워크 흐름/화면 흐름/API 흐름/흐름 상세/아키텍처 맥락 리포트다.
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

특정 프로파일을 명시하거나, 고급 사용자라면 adapter 묶음을 override할 수도 있다.

```bash
NPM_CONFIG_CACHE=/tmp/.npm npm run analyze -- samples/legacy-java-ee-minimal --profile legacy-java-ee
NPM_CONFIG_CACHE=/tmp/.npm npm run analyze -- samples/legacy-java-ee-minimal --profile legacy-java-ee --adapter web-xml,spring-xml,java-source-basic
NPM_CONFIG_CACHE=/tmp/.npm npm run analyze -- --list-profiles
NPM_CONFIG_CACHE=/tmp/.npm npm run analyze -- --list-adapters
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

CLI JSON 출력에는 선택된 `profileId` 외에도 `profileDetection.score`, `profileDetection.reasons`, `internalOutputDir`, `targetWriteError`가 포함된다. 대상 프로젝트 쓰기가 실패하면 기본 `outputDir`, `reportPath` 등은 내부 미러 경로를 가리키고, 원래 대상 경로는 `targetOutputDir`, `targetReportPath` 등으로 별도 노출된다.

## Profiles And Adapters

이 도구는 `adapter-first`가 아니라 `profile-first` 구조다.

- `profile`: 프로젝트 유형을 어떻게 해석할지 결정하는 분석 프리셋
- `adapter`: 특정 파일/기술 신호를 읽는 개별 추출기

쉽게 말하면, 사용자가 직접 고르는 것은 보통 `분석 전략(profile)`이고, adapter는 그 전략 안에서 자동으로 실행되는 `세부 분석기`다.

예를 들어 사용자가 `--profile legacy-java-ee`를 선택하면, 내부에서는 “이 프로젝트를 Legacy Java EE 방식으로 읽겠다”는 뜻이 된다. 그러면 도구가 알아서 `web.xml`, Spring XML, Java 소스, JSP, iBATIS/MyBatis mapper, SiteMesh 설정, `build.xml`을 읽는 adapter들을 묶어서 실행한다. 사용자가 `web-xml`, `jsp-view`, `mybatis-mapper`를 하나씩 외울 필요는 없다.

즉 구조는 아래처럼 이해하면 된다.

1. 사용자는 프로젝트 유형에 맞는 `profile`을 고른다.
2. profile이 필요한 adapter 목록을 내부에서 결정한다.
3. 각 adapter가 자기 담당 파일을 읽고 부분 결과를 만든다.
4. 분석 코어가 그 결과를 병합해서 최종 그래프와 리포트를 만든다.

현재 구현에서는 `Legacy Java EE` 프로파일이 `ant-build-xml`, `web-xml`, `spring-xml`, `java-source-basic`, `ibatis-sql-map`, `mybatis-mapper`, `jsp-view`, `sitemesh-config`를 한 세트로 실행한다.

그래서 기본 사용 흐름은 이렇다.

- 초보자: `npm run analyze -- <project-root>`
- 명시적 사용: `npm run analyze -- <project-root> --profile legacy-java-ee`
- 고급 사용: `npm run analyze -- <project-root> --profile legacy-java-ee --adapter web-xml,spring-xml,java-source-basic`

`--adapter`는 기본 진입점이 아니라 디버깅, 실험, 부분 분석용 override 옵션이다. 자유 조합을 기본 UX로 두지 않는 이유는 adapter 간 입력 중복, 추출 충돌, merge 책임이 사용자의 부담으로 넘어가기 때문이다.

목록 확인은 아래처럼 할 수 있다.

```bash
NPM_CONFIG_CACHE=/tmp/.npm npm run analyze -- --list-profiles
NPM_CONFIG_CACHE=/tmp/.npm npm run analyze -- --list-adapters
```

실행 시에는 `stderr`에 실제 사용된 분석 구성이 함께 출력된다.

```text
[info] Using profile: legacy-java-ee
[info] Adapters: ant-build-xml, web-xml, spring-xml, java-source-basic, ibatis-sql-map, mybatis-mapper, jsp-view, sitemesh-config
```

새 adapter를 붙이는 기본 절차는 이렇다.

1. `AnalyzerAdapter` 인터페이스를 구현한다.
2. adapter가 추출한 결과가 기존 merge 규칙에 맞는지 확인한다.
3. 적절한 profile의 adapter 묶음에 등록한다.
4. 샘플 fixture와 회귀 테스트를 추가한다.
5. README와 개발 문서를 함께 갱신한다.

## Commands

- 의존성 설치: `NPM_CONFIG_CACHE=/tmp/.npm npm install`
- 타입 체크: `NPM_CONFIG_CACHE=/tmp/.npm npm run check`
- 테스트: `NPM_CONFIG_CACHE=/tmp/.npm npm test`
- 빌드: `NPM_CONFIG_CACHE=/tmp/.npm npm run build`
- 샘플 분석: `NPM_CONFIG_CACHE=/tmp/.npm npm run analyze -- samples/legacy-java-ee-minimal`
- 프로파일 명시: `NPM_CONFIG_CACHE=/tmp/.npm npm run analyze -- samples/legacy-java-ee-minimal --profile legacy-java-ee`
- adapter override: `NPM_CONFIG_CACHE=/tmp/.npm npm run analyze -- samples/legacy-java-ee-minimal --profile legacy-java-ee --adapter web-xml,spring-xml,java-source-basic`
- 프로파일 목록: `NPM_CONFIG_CACHE=/tmp/.npm npm run analyze -- --list-profiles`
- 어댑터 목록: `NPM_CONFIG_CACHE=/tmp/.npm npm run analyze -- --list-adapters`
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
- `Flow Details`: 선택된 흐름의 현재 컨텍스트, 진입 경로, 비즈니스 단계, 데이터 접근, 출력, UI action을 단계별로 추적
- `Architecture Context`: 현재 흐름 뒤의 `Data Access Backbone`, 공통 모듈 허브, 런타임 구조 요약 보기
- `Explore`: 메인 리포트에서는 분리 페이지 `explore.html`로 이동
- `Evidence`: 메인 리포트에서는 분리 페이지 `evidence.html`로 이동
- `Raw / JSON`: 메인 리포트에서는 `raw.html`과 `snapshot.json` 링크로 이동

`type` 필터는 현재 탭 안에서 항목 종류를 좁히는 용도다. `가로형/카드형` 토글은 `Framework Flow`, `Screen Flows`, `API Flows`, `Architecture Context` 카드 레이아웃을 바꾸는 용도다. 각 결과 목록 섹션 제목에는 현재 필터 기준 `조회 건수`가 함께 표시된다.

`Framework Flow`는 `web.xml`의 `url-pattern`, `DispatcherServlet`, `contextConfigLocation`, 선언된 Spring 설정 파일을 기준으로 “이 앱이 왜 이 URL을 받을 수 있는가”를 설명한다. `Screen Flows`와 `API Flows`는 가능하면 controller class가 아니라 `handler method + 단일 URL` 기준의 concrete flow로 분리되어 `URL -> action method -> service/dao -> view/response`를 보여준다. 여기에는 Spring annotation 기반 매핑뿐 아니라 `SimpleUrlHandlerMapping + PropertiesMethodNameResolver`로 정의된 `*.as` URL도 포함된다.

`Flow Details`는 상단에 현재 선택된 흐름 컨텍스트를 먼저 보여주고, 그 아래에서 `Entry Setup -> Request Path -> Business Steps -> Data Access -> View/Response -> UI Actions -> Related Configs`를 따라가게 한다. JSP 안의 `a href`, `form action`, `onclick`, `fetch`, `ajax`, `location.href`, `window.open` 신호를 추출해 “이 버튼/링크를 누르면 다음에 어떤 URL/API 흐름으로 가는가”를 연결한다. 관련 데이터가 있을 때만 `Open Data Flow` 액션이 노출된다.

`Architecture Context`는 확정 실행 경로가 아니라, 현재 흐름 뒤에서 공통으로 보이는 데이터 접근 축과 공유 모듈을 요약한다. `Controller -> Service -> DAO` 체인을 우선 만들고, DAO 이름과 mapper namespace suffix가 맞으면 `Mapper/SQL`도 fallback으로 채운다. 데이터 카드에는 전체 요청 URL 목록과 판단 근거가 함께 표시된다. 대형 스냅샷에서는 메인 `report.html`이 흐름 요약 중심으로 유지되고, 무거운 `Explore`, `Evidence`, `Raw`는 각각 `explore.html`, `evidence.html`, `raw.html`로 분리된다.
