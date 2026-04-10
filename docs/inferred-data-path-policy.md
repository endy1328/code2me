# Inferred Data Path Policy

`Architecture Context`의 `추정 데이터 경로`는 확정 실행 경로가 아니다.

## Purpose

- 초보 사용자가 공통 백엔드 연결 후보를 빠르게 훑을 수 있게 한다.
- `Flow Details`가 못 채우는 구조적 힌트를 보조적으로 제공한다.
- 잘못된 확신을 주지 않도록 확정 흐름과 시각적으로 분리한다.

## Levels

- `confirmed`
  - 직접 edge와 메서드/SQL 근거가 함께 있는 경우
  - 예: `dao -> mapper queries` edge + DAO SQL 호출 흔적

- `inferred`
  - 의존 관계와 요청 연결은 보이지만 메서드 수준 근거가 약한 경우
  - 예: `controller -> service -> dao` 의존은 있으나 SQL 호출 확증은 없음

- `heuristic`
  - 이름 stem, namespace suffix, fallback 같은 휴리스틱이 중심인 경우
  - 예: DAO 이름과 mapper namespace 유사성만으로 매칭

## Default Visibility

- `heuristic` 카드는 기본 숨김
- `low confidence` 카드는 기본 숨김
- 근거 종류가 2개 미만인 카드는 기본 숨김
- 사용자가 `숨겨진 추정 후보 보기`를 눌렀을 때만 기본 숨김 카드를 노출한다

## Evidence Kinds

- `controller-service-edge`
- `controller-binding`
- `service-dao-edge`
- `biz-dao-edge`
- `dao-mapper-edge`
- `sql-call`
- `integration-call`
- `name-fallback`

## UX Rules

- 카드 태그는 `추정 경로`로 표시한다.
- 카드 상단에 `정적 분석 기반 추정 결과이며 실제 실행 경로와 다를 수 있다.`를 고정 노출한다.
- `Flow Details`보다 낮은 우선순위의 supporting card 스타일을 사용한다.
- `evidence kinds`와 `inference level`을 카드 상단 정보에 포함한다.
