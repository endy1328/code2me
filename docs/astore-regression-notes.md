# AStore Regression Notes

이 문서는 AStore 계열 분석 결과가 흔들릴 때 빠르게 비교할 대표 경로를 기록한다.

## Canonical Endpoints

- `AStore-Admin`
  - `/contentcategory/list.as`
  - 기대: `screen_flow`
  - 기대 화면: `contentCategory/contentCategoryList.jsp`
  - 기대 서비스: `CategoryService`

- `AStore-Seller`
  - `/accounting/financialReport.as`
  - 기대: `screen_flow`
  - 기대 화면: `accounting/financialReport.jsp`

- `AStore-Seller`
  - `/accounting/financialReportExcel.as`
  - 기대: `api_flow`
  - 기대 `responseKind`: `file`
  - 기대 태그: `download`

- `AStore-Carrier`
  - `/galaxyapi/aggregateOrderData.as`
  - 기대: `api_flow`
  - 기대 `responseKind`: `json`
  - 기대 태그: `external-facing candidate`

- `AStore-Carrier`
  - `/galaxyapi/blocklist`
  - 기대: `api_flow`
  - 기대 `responseKind`: `json`
  - 기대 태그: `external-facing candidate`

## Module Profiles

- `AStore-Admin`
  - 기대 성격: `mixed web app` 또는 `MVC-heavy web app`
  - 해석: 레거시 `*.as` + JSP 화면 중심, non-screen action 다수 공존

- `AStore-Seller`
  - 기대 성격: `mixed web app` 또는 `API-centric mixed app`
  - 해석: 화면 + 다운로드 + JSON 응답 혼합

- `AStore-Carrier`
  - 기대 성격: `API-centric mixed app`
  - 해석: `galaxyapi` 계열 연동이 강하지만 JSP/WebContent도 남아 있음

## Interpretation Rules

- `screen_flow`와 `api_flow`는 먼저 `화면 렌더링 여부`를 기준으로 나눈다.
- `api_flow`는 현재 `responseKind`로 `json`, `file`, `redirect`, `action`, `unknown`을 구분한다.
- `external-facing candidate`는 아직 확정 공개 API 분류가 아니라 보조 태그다.
