# +EV 간편 운영 100개 개선 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 기본 화면과 반복 입력을 줄이고 실제 근무·헬퍼 정산·금고 기록을 연결한다.

**Architecture:** 기존 정적 웹 앱·Supabase·자세히보기를 유지한다. 화면 정책, 실제 근무 계산, 금고 계산을 독립 모듈로 분리하고 서버 RPC에서 권한·중복·급여 마감·원자적 저장을 보장한다. 데모도 같은 계약을 구현한다.

**Tech Stack:** JavaScript ES modules, node:test/assert, PostgreSQL/Supabase, 기존 HTML/CSS, GitHub Pages.

**Spec:** `docs/superpowers/specs/2026-10-13-simple-erp-design.md` — 사용자가 2026-10-13 승인.

**상태:** 실행 계획 검토본. 제품 코드·DB·배포는 아직 변경하지 않음.

## Global Constraints

- 기존 전체 화면은 자세히보기로 보존한다. 숨김·이동은 데이터 삭제를 뜻하지 않는다.
- 기본 홈은 간편보기. 기존에 자세히보기를 선택한 기기는 선택을 유지한다.
- 과거 엔트리 값과 실제 기록 없는 과거 급여를 0으로 덮어쓰지 않는다.
- 가입일부터 6개월 혜택·무한지원·PRO 서버 판정·명시적 QR 출퇴근·위치 확인을 유지한다.
- 금액은 원 단위 정수, 시각은 timestamptz, 영업일은 한국 시간의 명시적 date로 저장한다.
- 기존 급여 계산·공제·수당 설정을 일당 선택만으로 끄지 않는다.
- 실제 근무와 예정 근무를 중복 합산하지 않는다. 미완료·겹침은 확인 대상이다.
- 지급 완료는 송금 실행이 아닌 지급 사실 기록이다.
- 실제 업무 데이터에 가짜 근무·지급·출금을 생성해 테스트하지 않는다.
- 새 업무 기록이 생긴 테이블을 복구 목적으로 삭제하지 않는다.
- 원격 배포는 검토된 커밋을 PR로 병합하고 Pages 완료 및 실제 화면 반영을 확인한다.

## Review Focus

1. 한국 시간 자정·08시 영업일 경계·월말을 넘는 실제 근무: 명시된 근무일과 시작/종료 시각을 보존한다. Task 3에서 테스트.
2. 여러 매장 소속·대표/점장/직원·급여 권한 제한: 다른 매장 기록을 읽거나 수정할 수 없다. Task 2·6에서 테스트.
3. 출근만 존재·출퇴근 중복·수동/QR 겹침: 0원 또는 이중 인건비로 확정하지 않는다. Task 3에서 테스트.
4. 지급 더블클릭·취소 재시도·마감 후 지급: 지급/금고 원자성, 멱등성, 대사 재확인을 보장한다. Task 4에서 테스트.
5. 기존 저장된 자세히보기·과거 엔트리·과거 월 급여: 신기능 전환이 기존 선택과 기록을 훼손하지 않는다. Task 1·3·6에서 테스트.

## 실행 방식과 기록

권장 방식은 **현재 대화에서 직접 순서대로 구현하고 마지막에 독립 코드 검토**하는 방식이다. 계산 모듈과 DB 계약을 공유하므로 구현을 여러 작업자로 나누는 것보다 변경 맥락을 유지하기 쉽다. 대안은 작업별 구현자·검토자를 따로 두는 방식이며 독립 검토 횟수와 비용이 증가한다.

승인 후 `docs/superpowers/implementation-ledger.md`에 단계별 기준 커밋·변경 파일·실행 테스트·결과·판단·100개 항목 상태를 기록한다. 구현하지 않은 항목은 완료로 표시하지 않는다.

## Task 1: 간편 홈·탐색·매출 입력 정리

**Files:** `app.js`, `app.css`, `index.html`, `demo/index.html`, 새 `ui-policy.js`, 새 `ui-policy.test.mjs`, 수정 `home-view.test.mjs`, 새 `sales-input.test.mjs`.

**Interfaces:**
- `initialHomeView(saved: string|null): 'simple'|'detail'` — 유효한 기존 선택 유지, 나머지는 simple.
- `ownerNavigation({storeCount,rotationEnabled,role}): Array<{key,label}>` — 홈·매출·근무·직원·더보기.
- `cashSales({sales,card,transfer}): number` — 정수·음수 검증, 차액 계산.
- `reportPatch(input,previous): object` — 기본 폼에 없는 entries는 previous 값 유지; 새 기록은 기존 서버 기본값 사용.
- 기존 `vSimpleHome`, `storeHead`, `render`, `SUBNAV`, 보고서 저장 흐름을 이 정책에 연결한다. 이벤트·권한·deep link 경로를 유지한다.

- [ ] 다음 계약을 실패하는 테스트로 먼저 작성하고 실행한다.

```js
assert.equal(initialHomeView(null), 'simple');
assert.equal(initialHomeView('detail'), 'detail');
assert.equal(cashSales({sales:300000,card:200000,transfer:50000}), 50000);
assert.throws(() => cashSales({sales:100,card:200,transfer:0}));
assert.equal(reportPatch({sales:300000}, {entries:17}).entries, 17);
```

- [ ] `node ui-policy.test.mjs`, `node home-view.test.mjs`, `node sales-input.test.mjs`가 의도한 새 동작 부재로 실패하는지 확인한다.
- [ ] 홈을 주 숫자 세 개·주 행동 세 개·확인할 일·오늘 근무·월 요약으로 정리한다. Task 3 이전 실제 인건비가 준비되지 않으면 확정 숫자 대신 집계 기준·준비 상태를 표시한다.
- [ ] 과거 자세히보기를 유지하고 광고·교육·장터·설정·분석 진입을 더보기/상세로 연결한다. 단순 CSS 숨김만으로 권한을 바꾸지 않는다.
- [ ] 엔트리 제거, 오픈/마감 상태별 폼, 권종 접기, 금액·고정비 기본값을 적용한다. 기존 현금 비용 저장 의미를 코드·서버 함수에서 확인해 ledger에 기록한다.
- [ ] 위 세 테스트 및 기존 전체 테스트 통과 후 PC/모바일·일반/PRO·단일/다점포 화면을 확인하고 커밋한다.

**100개 범위:** 1–50 중 45 제외, 54–60, 86–87, 93–94, 96–99. 45는 Task 4에 포함.

## Task 2: 실제 근무·헬퍼·지급·금고 저장 계약

**Files:** 새 `migrations/simple-erp-ledger.sql`, 새 `migrations/simple-erp-ledger-rollback.sql`, 새 `tests/sql/simple-erp-ledger.sql`, 수정 `demo/mock-sb.js`, 새 `ledger-rpc.test.mjs`.

**데이터 계약:**
- `work_records`: id, store_id, member_id, work_date, start_at, end_at(nullable), break_min, source(qr/manual), status(open/confirmed/conflict/void), attendance_in_id, attendance_out_id, pay_basis(hourly/daily), base_rate, pay_snapshot(jsonb), revision, created_by, created_at.
- `work_payments`: id, store_id, member_id, work_date, period_month, amount_gross, amount_deduction, amount_net, method(cash/transfer), status(paid/reversed), request_id(uuid unique), created_by, created_at, reversed_by_id(nullable).
- `cash_movements`: id, store_id, business_date, direction(in/out), amount, reason, source(owner/expense/payroll/other/reversal), payment_id(nullable unique), reverses_id(nullable unique), request_id(uuid unique), created_by, created_at.
- `stores.labor_actual_from`: nullable date. 미설정 매장은 기존 계산을 유지한다. 새 집계로 전환할 때 시작일을 명시적으로 저장한다.

**RPC interfaces:**
- `record_work(p_request uuid,p_store uuid,p_member uuid,p_date date,p_start timestamptz,p_end timestamptz,p_break int,p_revision int default null) returns uuid`.
- `register_helper_work(p_request uuid,p_store uuid,p_member uuid,p_nick text,p_basis text,p_amount int,p_date date,p_start timestamptz,p_end timestamptz,p_break int) returns uuid`. 기존 p_member가 있으면 재사용, 없으면 신규 헬퍼. 등록과 근무 저장은 한 트랜잭션.
- `actual_payroll(p_store uuid,p_month date) returns jsonb` — member_id별 기본급·수당·공제·실제/미완료/충돌 집계.
- Task 4의 `record_pay`, `reverse_pay`, `record_cash`, `reverse_cash`는 여기서 가짜 완료 함수로 만들지 않는다.

- [ ] 실제 DB의 members/stores/급여 마감/기존 지급/점장 권한/attendance의 타입·제약·권한 판정을 읽기 전용으로 확인하고 기존 함수와 스키마 검사 결과를 ledger에 저장한다. 실제 업무 데이터 본문은 불필요하다.
- [ ] 다른 매장 접근 거부·직원 직접 쓰기 거부·잘못된 금액/시간·급여 마감·요청 재시도 테스트를 먼저 작성해 실패를 확인한다.
- [ ] 새 테이블은 RLS를 켜서 만든다. 일반 직원은 본인 근무·급여만 읽고 변경은 authenticated 전용 RPC로 처리한다. PUBLIC/anon 실행을 차단한다. 요청 중복·QR 원본 중복은 제약으로 막는다.
- [ ] RPC에서 auth.uid, 매장·소속·현재 권한·회사 이용 상태·월 마감을 검사하고 트랜잭션 잠금으로 동시 변경을 직렬화한다. 금액을 브라우저 계산만 믿고 저장하지 않는다.
- [ ] `node ledger-rpc.test.mjs`와 SQL 트랜잭션 롤백 검증을 통과시킨다. 실존 직원에게 가짜 지급을 만들지 않는다.
- [ ] 되돌림은 추가 기능을 중단하고 호환 읽기를 유지한다. 업무 기록이 생긴 테이블은 삭제하지 않는다. 변경 SQL·데모·테스트를 커밋한다.

**100개 범위:** 51–53과61–80의 저장 기반, 100의 공통 저장 계약. UI 완료는Task 3/4를 기다린다.

## Task 3: 실제 근무·급여 계산과 헬퍼 입력

**Files:** 새 `labor-engine.js`, 새 `labor-engine.test.mjs`, 수정 `engine.js`(기존 API 유지), `app.js`, `demo/mock-sb.js`, 새 `tests/fixtures/labor-payroll.json`, 새 `tests/sql/labor-payroll.sql`.

**Interfaces:**
- `reconcileWork({memberId,storeId,attendance,manualRecords}): {confirmed,open,conflicts}` — QR 원본 ID 중복은 제외, 수동/QR 겹침은 확인 대상으로 분리.
- `calculateActualPayroll({member,records,previousWeekRecords,period,nightWindow}): PayrollResult` — 기존 엔진 결과 형식에 basis, openCount, conflictCount 추가.
- `projectLabor({actual,scheduled,actualFrom,period}): {actualGross,projectedGross,incompleteCount}` — 같은 근무를 중복 합산하지 않음.
- `actual_payroll` SQL을 같은 fixture로 대조한다. 확정 지급액의 기준은 서버 계산이며 화면·내보내기도 같은 결과를 사용한다.
- 기존 `payOf`, `laborOf`, `dayLaborOf`, 직원/사장님 화면, 급여 CSV·명세서 호출 경로를 공통 결과로 연결한다.

- [ ] 스케줄 없는 QR 완료, 출근만 있는 미완료, 수동/QR 충돌, 일당이 시간 수만큼 곱해지지 않음, 월 경계 야간 근무, 마감 월, 과거 스케줄 보존, 복수 매장 격리를 fixture에 먼저 작성한다. `node labor-engine.test.mjs`를 실패→통과 순서로 진행한다.
- [ ] 근무일·시작/종료·휴게·야간을 계산한다. 일당은 약정 기준액을 보존하고 기존 계약별 수당·공제를 임의로 0으로 바꾸지 않는다. 근무 당시 조건을 보존해 과거 급여를 고정한다.
- [ ] 전환 전 달과 실제 기록 없는 과거 급여는 기존 E.payroll을 유지한다. 전환 이후 예정 근무만 있는 상태를 실제 근무로 확정하지 않는다.
- [ ] 헬퍼 등록에 시급/일당·금액·날짜·시간·휴게·기존 사람 선택을 추가한다. 전화·계좌 없이 저장되는지 확인한다.
- [ ] 직원 선택→근무 추가, 중복 확인·보정, 단일/복수 매장을 같은 RPC로 연결한다. 급여 목록은 지급액 우선·상세 펼치기·내보내기 통합으로 바꾼다.
- [ ] 월 경계 주휴·공제·과거 월 내보내기·오늘 완료된 근무의 즉시 집계를 fixture·SQL·브라우저로 확인한다.
- [ ] `node labor-engine.test.mjs`, 기존 엔진 테스트, RPC 테스트가 통과하면 커밋한다.

**100개 범위:** 61–80,100. 현금 지급 UI는Task 4에서 연결한다.

## Task 4: 금고 입출금·지급 원자성·마감 계산

**Files:** 새 `cash-engine.js`, 새 `cash-engine.test.mjs`, 새 `migrations/simple-erp-payments.sql`, 새 `tests/sql/simple-erp-payments.sql`, 수정 `app.js`, `demo/mock-sb.js`, 새 `payment-rpc.test.mjs`.

**Interfaces:**
- `expectedCash({opening,cashSales,cashExpenses,movements}): number` — 대표 출금은 현금만, 급여 지급은 실지급액만, 동일 비용 사건은 한 번만 차감.
- `record_pay(p_request uuid,p_store uuid,p_work_ids uuid[],p_method text,p_business_date date) returns uuid` — 근무 잠금·미지급/확정/마감 검사 후 서버 계산으로 지급 기록 생성, cash일 때만 금고 기록 생성.
- `reverse_pay(p_request uuid,p_payment uuid,p_reason text) returns uuid` — 지급·금고 반대 기록을 같은 트랜잭션에 저장.
- `record_cash(p_request uuid,p_store uuid,p_date date,p_direction text,p_amount int,p_reason text) returns uuid` — 대표/기타 사건만 생성, 급여 지급 사건을 임의로 위조하지 못함.
- `reverse_cash(p_request uuid,p_movement uuid,p_reason text) returns uuid` — 급여와 연결된 금고 기록의 단독 취소 금지.

- [ ] `시재300000+현금매출50000−대표인출100000=250000`, 현금 급여의 비용 이중 차감 방지, 이체 시 금고 유지, 취소 한 번만 복원, 재시도 시 같은 사건 반환, 마감 이후 대사 재확인을 먼저 테스트한다.
- [ ] Task 1에서 확인한 expenses source=close와report.expense 의미에 맞춰 기존 지출의 이중 차감 방지 adapter를 만든다. 과거 마감값을 자동 수정하지 않는다.
- [ ] 지급/출금/취소 RPC가Task 2의 권한·잠금·마감·요청 규칙을 공유하게 한다. 미완료/충돌/미확정 급여를 지급 완료로 저장하지 않는다.
- [ ] 금고 패널은 입금/출금·금액·사유·이력 중심으로 만든다. 지급 화면은 현금/이체와 지급 사실 기록임을 명시한다. 실제 송금 API는 호출하지 않는다.
- [ ] 전일 시재 후보, closeCalc, 마감 저장을 cash-engine과 서버 결과에 연결한다. 과거 마감에 추가된 사건은 재확인 상태를 표시한다.
- [ ] `node cash-engine.test.mjs`, `node payment-rpc.test.mjs`, SQL 롤백 검증을 통과시키고 데모에서 현금 지급→취소, 이체 지급을 확인해 커밋한다.

**100개 범위:** 45,49–53,70–72/76의 지급 부분,100.

## Task 5: 근무·QR·구인의 짧은 작업 경로

**Files:** 수정 `app.js`, `app.css`, `ui-policy.js`, `demo/mock-sb.js`, 새 `workflow-policy.test.mjs`.

**Interfaces:**
- `weekCopyPlan({sourceWeek,targetWeek,memberIds,existing,locked}): {rows,conflicts}` — 기존 근무를 임의로 덮어쓰지 않음.
- `jobDefaults({store,shift}): object` — 현재 매장과 필요한 근무로 공고 기본값 생성.
- 기존 폼·저장 RPC를 재사용하고 진입점별로 별도 계산/저장을 늘리지 않는다.

- [ ] 주 복사의 월 경계·기존 근무·급여 마감 거부, 매장 전환 후 구인 기본값, 광고 미선택 시 값 보존을 실패 테스트로 먼저 작성한다.
- [ ] 근무 메뉴를 이번 주 우선·월 전환·지난주 복사로 정리한다. 다음 달 투표·자동 설정은 필요한 때만 펼친다.
- [ ] QR 화면 명칭·크기·갱신 상태를 정리하고 직원 홈과 기록 화면의 역할을 구분한다. 위치 권한은 기존 서버가 요구할 때만 요청한다.
- [ ] 대타 구하기→공고→지원자→채용 흐름을 연결하고 매장·시간 재입력, 광고 기본 펼침, 타 서비스 가격 비교를 덜어낸다.
- [ ] `node workflow-policy.test.mjs`와QR·선택 출퇴근·긴급구인 요금 테스트를 통과시킨 뒤 권한별 화면을 확인하고 커밋한다.

**100개 범위:** 81–95,100. Task 1의86–87/93–94는 실제 동작도 다시 확인한다.

## Task 6: 100개 완료 감사·전체 검토·배포

**Files:** 새 `docs/superpowers/100-item-acceptance.md`, 수정 `index.html`, `demo/index.html`, 필요시 `sw.js`.

- [ ] 수락 표100행에 번호·구현 파일·화면 확인/테스트·남은 작업을 적는다. 숨긴 기능의 새 접근 경로도 기록한다.
- [ ] import map의 mock URL과 명시적 import URL을 맞추고 HTML/CSS/app/module 버전을 갱신한다. 서비스워커 갱신·앱 복귀 시 신구 코드 혼용을 검사한다.
- [ ] 전체 `*.test.mjs`, JS 문법, `git diff --check`를 실행한다. 실패를 놓치지 않도록 종료 코드를 집계한다.
- [ ] 데모에서 모바일/PC, 일반/PRO, 직원/점장/대표, 단일/복수 매장, 영업 전/영업 중/마감 완료를 확인한다. 실기기 카메라·위치 미검증은 명시한다.
- [ ] 초보 사용자 검증은 실제 시행 여부를 표시한다. 설명 없이 헬퍼→급여→마감을 끝내는지와 막힌 지점을 기록한다.
- [ ] `superpowers:requesting-code-review`로 전체 브랜치 독립 검토를 수행한다. 중요 지적을 수정하고 영향 테스트를 재실행한다.
- [ ] 적용 직전 DB 함수·스키마를 저장하고 SQL을 롤백 트랜잭션에서 검증한다. 업무 데이터 백업은 범위와 보관 위치를 따로 명시한다.
- [ ] SQL 적용 후 전환 상태·권한을 확인한다. 실제 직원에게 가짜 지급·출금을 만들지 않는다.
- [ ] 검증한 브랜치를 push해 PR을 만들고 attach_artifact로 채팅에 첨부한다. 검증한head SHA를 지정해 병합한다.
- [ ] GitHub Pages built 커밋 일치와 실제 주소의 핵심 동작을 확인하고 화면 증빙을 저장한다.
- [ ] 수락 표100항목과 실기기/사용성 미검증 범위를 보고한다. 미완료가 있으면100개 완료라고 주장하지 않는다.

## 실행 전 셀프리뷰

- 전체100번호를Task에 대응했다. 중복 번호는 저장/화면/동작의 서로 다른 검증이며 완료 수를 중복 집계하지 않는다.
- 명세의 과거 데이터 보존·예상/실제·현금/비용·헬퍼·권한·복구를 각각 배치했다.
- 실제 계산이 연결되기 전 화면에서 계산 완료로 가장하지 않는다. 의존 데이터가 준비되지 않은 숫자는 준비 상태로 표시한다.
- 실DB 타입·제약은Task 2의 읽기 전용 사전 검사로 대조한다. 다르면 SQL 작성 전에 ledger에 변경 판단을 남긴다.
- 중간 상태를 공개하지 않고 전체 테스트·검토·신구 호환을 확인한 뒤 배포한다.
