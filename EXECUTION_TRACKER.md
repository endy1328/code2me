# Execution Tracker

이 문서는 `범용 분석기` 목표를 유지하면서 현재 단계에서 `Legacy Java EE` 분석 코어를 끝까지 밀기 위한 실행 트래커다.

## Strategy

- 현재 집중 비중
  - `70%`: `Legacy Java EE` 정확도, 회귀, 실제 프로젝트 대응력
  - `20%`: 공통 코어 경계 정리
  - `10%`: 다음 프로파일 스켈레톤과 판정 규칙 초안
- 현재 primary persona
  - `유지보수/온보딩 담당자`
- 현재 secondary persona
  - `아키텍처 리뷰어`

## Ordered Checklist

### 1. Success Criteria

- [x] `Legacy Java EE` 완료 기준 문서 작성
- [x] `confirmed / inferred / heuristic` 정책과 merge 충돌 규칙을 코드/문서 기준으로 고정
- [x] 새 어댑터 추가 전 합격 기준을 문서로 연결

### 2. Regression Matrix

- [x] 현재 샘플/테스트 기준 회귀 매트릭스 문서 작성
- [x] fixture별 `profileDetection`, `flow detail`, `inferred card visibility` 점검 표 추가
- [x] 미검증 영역별 우선순위 확정

### 3. Synthetic Fixtures

- [x] XML-heavy `BeanNameUrlHandlerMapping` fixture 추가
- [x] entry-focused fixture 추가
- [x] mapping-focused fixture 추가
- [x] persistence-focused fixture 추가
- [x] view/layout-focused fixture 추가
- [x] view resolver variants fixture 추가
- [x] env/locale branch fixture 추가

### 4. Public / Real Project Validation

- [x] 공개 샘플 후보 목록 정리
- [x] 공개 샘플 실패 모드 기록 템플릿 작성
- [x] 익명화 실제 프로젝트 검증 게이트 문서 작성

### 5. Core Boundaries

- [x] 공통 메타모델 경계 정리
- [x] merge 규칙 정리
- [x] confidence 정책 정리
- [x] 프로파일 독립 규칙과 `Legacy Java EE` 전용 규칙 분리

### 6. Report Focus

- [x] 리포트 사용자 우선순위 결정
- [x] README에 primary persona 명시
- [x] `Start Here` / `Flow Details` 우선 노출 기준 문서화
- [x] 온보딩/아키텍처/운영이관 시나리오별 회귀 케이스 추가

### 7. Next Profile Preparation

- [x] 다음 프로파일 후보 1~2개 선정
- [x] 프로파일별 입력 신호 초안 작성
- [x] 프로파일별 최소 메타모델 차이 메모 작성
- [x] `action-family-legacy-web` 최소 골격 구현 시작
- [x] `action-family-legacy-web` 0.2 개발 시작: Stripes session alias evidence 보존
- [x] `code2me v0.2` 작업 계획 문서화

## Current Status

- 완료
  - XML mapping 복원 강화
  - `Action + ModelAndView` 기반 흐름 복원 강화
  - route specificity 기반 대표 URL/정렬 보강
  - XML-heavy fixture 추가
  - multi-dispatcher entry fixture 추가
  - persistence priority fixture 추가
  - mixed web/api mapping fixture 추가
  - view resolver variants fixture 추가
  - env/locale branch fixture 추가
  - SiteMesh excludes/defaultdir fixture 추가
  - handler 단위 SiteMesh include/exclude 해석 보강
  - 완료 기준 / 회귀 매트릭스 문서 추가
  - fixture validation checklist 추가
  - public sample candidate / failure log 문서 추가
  - Start Here / Flow Details 우선 노출 기준 문서 추가
  - persona scenario regression 문서 추가
  - next profile candidate 문서 추가
  - `action-family-legacy-web` profile / adapter 추가
  - Struts `redirectAction` / Stripes self redirect 최소 해석 추가
  - Struts / Stripes 최소 fixture 추가
  - Stripes `session.getAttribute("/actions/*.action")` alias를 `Flow Details > Request Path` supporting evidence로 보존
  - Stripes typed session alias `session.getAttribute("accountBean")`를 ActionBean route hint로 보존
  - Struts2 `redirectAction` / `chain` wildcard route hint 세분화
  - request handler 병합 시 `sessionRouteHints` / `redirectActionClasses` 메타데이터 보존
  - split report asset 구조에 맞춘 회귀 테스트 정리
  - mapper namespace suffix fallback과 screen flow variant grouping 보강
  - `dev_docs/03.development/007.code2me_v0.2_action_family_plan.md` 추가
  - README persona 반영
  - 관련 회귀 테스트 추가
- 현재 상태
  - `action-family-legacy-web` 0.2 개발 진행 중
- 재시작 시 다음 우선순위
  - `DynamicMappingFilter` boundary 정의
  - 실제 프로젝트 read-only gate 반복
  - Struts 1 `struts-config.xml` 1차 지원은 0.3 후보로 분리

## Verification Baseline

- 최근 확인 결과
  - `npm run check`: 통과
  - `npm test`: 통과
  - `npm run analyze -- samples/legacy-java-ee-action-mapping`: 통과
  - `npm run analyze -- samples/legacy-java-ee-bean-name-mapping`: 통과
  - `npm run analyze -- samples/legacy-java-ee-entry-multi-dispatcher`: 통과
  - `npm run analyze -- samples/legacy-java-ee-persistence-priority`: 통과
  - `npm run analyze -- samples/legacy-java-ee-mixed-web-api`: 통과
  - `npm run analyze -- samples/legacy-java-ee-view-resolver-variants`: 통과
  - `npm run analyze -- samples/legacy-java-ee-env-branch`: 통과
  - `npm run analyze -- samples/action-family-legacy-web-struts-minimal`: 통과
  - `npm run analyze -- samples/action-family-legacy-web-stripes-minimal`: 통과
  - `npm run analyze -- /tmp/jpetstore-6-code2me`: 통과
  - `npm run analyze -- /tmp/spring-framework-petclinic-code2me`: no-match boundary 확인
  - `npm run analyze -- /tmp/struts-examples-code2me/spring-struts`: `action-family-legacy-web`, soft fail 기록
  - `npm run analyze -- /tmp/struts-examples-code2me/form-validation`: `action-family-legacy-web`, soft pass 기록
  - `npm run analyze -- /tmp/stripes-code2me/examples`: `action-family-legacy-web`, soft fail 기록
  - `npm run analyze -- /tmp/legacy-java-ee-minimal-readonly`: read-only gate 통과
