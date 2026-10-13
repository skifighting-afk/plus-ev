# 100개 개선 적용·검증 기록

2026-10-14. 아래 표는 승인 명세 100개와 코드의 대응이다. `코드 확인`은 실제 초보 사장님의 사용성 검증을 뜻하지 않는다.

기존 전체 화면은 자세히보기에 보존한다. 숨김·접기·이동은 업무 데이터 삭제가 아니다.

검증: 16개 Node 테스트 통과(기존 엔진 2,726,292회 포함), 서버 SQL 전체 롤백 사전검증 통과, 독립 검토 P1/P2 해소. 로컬 390px/PC 홈·주간 근무·매출·직원·헬퍼 지급/취소·금고 연결 확인.

미검증: 실제 휴대폰 카메라·위치 권한, 초보 사장님 사용성 측정, 운영 계정의 실제 송금. 운영 DB에 가짜 근무·지급·출금을 만들지 않았다.

| 번호 | 변경 | 구현·보존 위치 | 확인 |
|---:|---|---|---|
| 1 | 엔트리 입력 제거 | app.js: vSimpleHome / simpleMenu / 자세히보기 | 코드 확인 · 간편/상세 홈 데모 |
| 2 | 엔트리 요구 분석 안내 숨김 | app.js: vSimpleHome / simpleMenu / 자세히보기 | 코드 확인 · 간편/상세 홈 데모 |
| 3 | 홈 퀘스트 숨김 | app.js: vSimpleHome / simpleMenu / 자세히보기 | 코드 확인 · 간편/상세 홈 데모 |
| 4 | 홈 레벨·경험치 숨김 | app.js: vSimpleHome / simpleMenu / 자세히보기 | 코드 확인 · 간편/상세 홈 데모 |
| 5 | 가입 준비 단계 숨김 | app.js: vSimpleHome / simpleMenu / 자세히보기 | 코드 확인 · 간편/상세 홈 데모 |
| 6 | 자료 가져오기 이동 | app.js: vSimpleHome / simpleMenu / 자세히보기 | 코드 확인 · 간편/상세 홈 데모 |
| 7 | 가입 혜택 축소 | app.js: vSimpleHome / simpleMenu / 자세히보기 | 코드 확인 · 간편/상세 홈 데모 |
| 8 | PRO 안내 통합 | app.js: vSimpleHome / simpleMenu / 자세히보기 | 코드 확인 · 간편/상세 홈 데모 |
| 9 | 요금제 메뉴 이동 | app.js: vSimpleHome / simpleMenu / 자세히보기 | 코드 확인 · 간편/상세 홈 데모 |
| 10 | 업데이트 장문 제거 | app.js: vSimpleHome / simpleMenu / 자세히보기 | 코드 확인 · 간편/상세 홈 데모 |
| 11 | 포스터 홈 숨김 | app.js: vSimpleHome / simpleMenu / 자세히보기 | 코드 확인 · 간편/상세 홈 데모 |
| 12 | AI 홈 입력창 숨김 | app.js: vSimpleHome / simpleMenu / 자세히보기 | 코드 확인 · 간편/상세 홈 데모 |
| 13 | 교육 광고 숨김 | app.js: vSimpleHome / simpleMenu / 자세히보기 | 코드 확인 · 간편/상세 홈 데모 |
| 14 | 준비 중 강의 숨김 | app.js: vSimpleHome / simpleMenu / 자세히보기 | 코드 확인 · 간편/상세 홈 데모 |
| 15 | 강의 알림 신청 숨김 | app.js: vSimpleHome / simpleMenu / 자세히보기 | 코드 확인 · 간편/상세 홈 데모 |
| 16 | 중고 장터 이동 | app.js: vSimpleHome / simpleMenu / 자세히보기 | 코드 확인 · 간편/상세 홈 데모 |
| 17 | 점포 양도양수 이동 | app.js: vSimpleHome / simpleMenu / 자세히보기 | 코드 확인 · 간편/상세 홈 데모 |
| 18 | 가맹 모집 이동 | app.js: vSimpleHome / simpleMenu / 자세히보기 | 코드 확인 · 간편/상세 홈 데모 |
| 19 | 손님앱 소개 홈 숨김 | app.js: vSimpleHome / simpleMenu / 자세히보기 | 코드 확인 · 간편/상세 홈 데모 |
| 20 | 지역 딜러 통계 홈 숨김 | app.js: vSimpleHome / simpleMenu / 자세히보기 | 코드 확인 · 간편/상세 홈 데모 |
| 21 | 오늘 매장 카드 통합 | app.js: vSimpleHome / simpleMenu / 자세히보기 | 코드 확인 · 간편/상세 홈 데모 |
| 22 | 오늘 매출 중복 제거 | app.js: vSimpleHome / simpleMenu / 자세히보기 | 코드 확인 · 간편/상세 홈 데모 |
| 23 | 손익 명칭 통일 | app.js: vSimpleHome / simpleMenu / 자세히보기 | 코드 확인 · 간편/상세 홈 데모 |
| 24 | 월별 그래프 이동 | app.js: vSimpleHome / simpleMenu / 자세히보기 | 코드 확인 · 간편/상세 홈 데모 |
| 25 | 지난달 비교 이동 | app.js: vSimpleHome / simpleMenu / 자세히보기 | 코드 확인 · 간편/상세 홈 데모 |
| 26 | 주변 순위 이동 | app.js: vSimpleHome / simpleMenu / 자세히보기 | 코드 확인 · 간편/상세 홈 데모 |
| 27 | 점장 성적 이동 | app.js: vSimpleHome / simpleMenu / 자세히보기 | 코드 확인 · 간편/상세 홈 데모 |
| 28 | 단일 매장 다점포 기능 숨김 | app.js: vSimpleHome / simpleMenu / 자세히보기 | 코드 확인 · 간편/상세 홈 데모 |
| 29 | 3개월 예측 이동 | app.js: vSimpleHome / simpleMenu / 자세히보기 | 코드 확인 · 간편/상세 홈 데모 |
| 30 | 레이더 차트 이동 | app.js: vSimpleHome / simpleMenu / 자세히보기 | 코드 확인 · 간편/상세 홈 데모 |
| 31 | 경고 요약 | app.js: vSimpleHome / simpleMenu / 자세히보기 | 코드 확인 · 간편/상세 홈 데모 |
| 32 | 정상 카드 숨김 | app.js: vSimpleHome / simpleMenu / 자세히보기 | 코드 확인 · 간편/상세 홈 데모 |
| 33 | 할 일 통합 | app.js: vSimpleHome / simpleMenu / 자세히보기 | 코드 확인 · 간편/상세 홈 데모 |
| 34 | 할 일 정렬 | app.js: vSimpleHome / simpleMenu / 자세히보기 | 코드 확인 · 간편/상세 홈 데모 |
| 35 | 완료 할 일 숨김 | app.js: vSimpleHome / simpleMenu / 자세히보기 | 코드 확인 · 간편/상세 홈 데모 |
| 36 | 확인 공지 숨김 | app.js: vSimpleHome / simpleMenu / 자세히보기 | 코드 확인 · 간편/상세 홈 데모 |
| 37 | 미확인 공지 축소 | app.js: vSimpleHome / simpleMenu / 자세히보기 | 코드 확인 · 간편/상세 홈 데모 |
| 38 | 알림 내역 이동 | app.js: vSimpleHome / simpleMenu / 자세히보기 | 코드 확인 · 간편/상세 홈 데모 |
| 39 | POS 반복 안내 제거 | app.js: vSimpleHome / simpleMenu / 자세히보기 | 코드 확인 · 간편/상세 홈 데모 |
| 40 | 설치 반복 안내 제거 | app.js: vSimpleHome / simpleMenu / 자세히보기 | 코드 확인 · 간편/상세 홈 데모 |
| 41 | 매출 날짜 기본값 | app.js: vSales / closeCalc / fixedFor; cash-engine.js; record_cash | 코드 확인 · 매출/금고 테스트 |
| 42 | 현금 매출 계산 | app.js: vSales / closeCalc / fixedFor; cash-engine.js; record_cash | 코드 확인 · 매출/금고 테스트 |
| 43 | 현금 중복 입력 제거 | app.js: vSales / closeCalc / fixedFor; cash-engine.js; record_cash | 코드 확인 · 매출/금고 테스트 |
| 44 | 오픈 간소화 | app.js: vSales / closeCalc / fixedFor; cash-engine.js; record_cash | 코드 확인 · 매출/금고 테스트 |
| 45 | 전일 시재 후보 | app.js: vSales / closeCalc / fixedFor; cash-engine.js; record_cash | 코드 확인 · 매출/금고 테스트 · 기존 기능 보존 |
| 46 | 오픈 후 입력 접기 | app.js: vSales / closeCalc / fixedFor; cash-engine.js; record_cash | 코드 확인 · 매출/금고 테스트 |
| 47 | 마감 후 입력 접기 | app.js: vSales / closeCalc / fixedFor; cash-engine.js; record_cash | 코드 확인 · 매출/금고 테스트 · 기존 기능 보존 |
| 48 | 권종 입력 접기 | app.js: vSales / closeCalc / fixedFor; cash-engine.js; record_cash | 코드 확인 · 매출/금고 테스트 |
| 49 | 금고 대사 통합 | app.js: vSales / closeCalc / fixedFor; cash-engine.js; record_cash | 코드 확인 · 매출/금고 테스트 |
| 50 | 정상 차액 설명 축소 | app.js: vSales / closeCalc / fixedFor; cash-engine.js; record_cash | 코드 확인 · 매출/금고 테스트 |
| 51 | 대표 인출·비용 분리 | app.js: vSales / closeCalc / fixedFor; cash-engine.js; record_cash | 코드 확인 · 매출/금고 테스트 |
| 52 | 금고 행동 통합 | app.js: vSales / closeCalc / fixedFor; cash-engine.js; record_cash | 코드 확인 · 매출/금고 테스트 |
| 53 | 현금 급여 연결 | app.js: vSales / closeCalc / fixedFor; cash-engine.js; record_cash | 코드 확인 · 매출/금고 테스트 |
| 54 | 고정비 이어받기 | app.js: vSales / closeCalc / fixedFor; cash-engine.js; record_cash | 코드 확인 · 매출/금고 테스트 · 기존 기능 보존 |
| 55 | 고정비 입력 접기 | app.js: vSales / closeCalc / fixedFor; cash-engine.js; record_cash | 코드 확인 · 매출/금고 테스트 |
| 56 | 고정비 연간 이동 | app.js: vSales / closeCalc / fixedFor; cash-engine.js; record_cash | 코드 확인 · 매출/금고 테스트 · 기존 기능 보존 |
| 57 | 금액 쉼표 | app.js: vSales / closeCalc / fixedFor; cash-engine.js; record_cash | 코드 확인 · 매출/금고 테스트 |
| 58 | 금액 단위 중복 축소 | app.js: vSales / closeCalc / fixedFor; cash-engine.js; record_cash | 코드 확인 · 매출/금고 테스트 |
| 59 | 선택값 0 제거 | app.js: vSales / closeCalc / fixedFor; cash-engine.js; record_cash | 코드 확인 · 매출/금고 테스트 |
| 60 | 저장 검토 축소 | app.js: vSales / closeCalc / fixedFor; cash-engine.js; record_cash | 코드 확인 · 매출/금고 테스트 |
| 61 | 스케줄 의존 제거 | erp-ui.js / labor-engine.js / simple-erp-ledger·payments.sql | 코드 확인 · 인건비/지급 회귀 테스트 |
| 62 | 예정·실제 구분 | erp-ui.js / labor-engine.js / simple-erp-ledger·payments.sql | 코드 확인 · 인건비/지급 회귀 테스트 |
| 63 | QR 재입력 제거 | erp-ui.js / labor-engine.js / simple-erp-ledger·payments.sql | 코드 확인 · 인건비/지급 회귀 테스트 · 실기기 카메라/위치 미검증 |
| 64 | 중복 근무 차단 | erp-ui.js / labor-engine.js / simple-erp-ledger·payments.sql | 코드 확인 · 인건비/지급 회귀 테스트 |
| 65 | 근무 추가 간소화 | erp-ui.js / labor-engine.js / simple-erp-ledger·payments.sql | 코드 확인 · 인건비/지급 회귀 테스트 |
| 66 | 급여 조건 자동 적용 | erp-ui.js / labor-engine.js / simple-erp-ledger·payments.sql | 코드 확인 · 인건비/지급 회귀 테스트 |
| 67 | 헬퍼 등록 간소화 | erp-ui.js / labor-engine.js / simple-erp-ledger·payments.sql | 코드 확인 · 인건비/지급 회귀 테스트 |
| 68 | 헬퍼 전화 선택 | erp-ui.js / labor-engine.js / simple-erp-ledger·payments.sql | 코드 확인 · 인건비/지급 회귀 테스트 |
| 69 | 현금 헬퍼 계좌 선택 | erp-ui.js / labor-engine.js / simple-erp-ledger·payments.sql | 코드 확인 · 인건비/지급 회귀 테스트 |
| 70 | 일당 환산 입력 제거 | erp-ui.js / labor-engine.js / simple-erp-ledger·payments.sql | 코드 확인 · 인건비/지급 회귀 테스트 |
| 71 | 헬퍼·근무 통합 | erp-ui.js / labor-engine.js / simple-erp-ledger·payments.sql | 코드 확인 · 인건비/지급 회귀 테스트 |
| 72 | 기존 헬퍼 재사용 | erp-ui.js / labor-engine.js / simple-erp-ledger·payments.sql | 코드 확인 · 인건비/지급 회귀 테스트 |
| 73 | 직원 목록 축소 | erp-ui.js / labor-engine.js / simple-erp-ledger·payments.sql | 코드 확인 · 인건비/지급 회귀 테스트 |
| 74 | 직원 상세 접기 | erp-ui.js / labor-engine.js / simple-erp-ledger·payments.sql | 코드 확인 · 인건비/지급 회귀 테스트 |
| 75 | 직원 설명 중복 제거 | erp-ui.js / labor-engine.js / simple-erp-ledger·payments.sql | 코드 확인 · 인건비/지급 회귀 테스트 · 기존 기능 보존 |
| 76 | 급여 지급액 우선 | erp-ui.js / labor-engine.js / simple-erp-ledger·payments.sql | 코드 확인 · 인건비/지급 회귀 테스트 |
| 77 | 수당 상세 접기 | erp-ui.js / labor-engine.js / simple-erp-ledger·payments.sql | 코드 확인 · 인건비/지급 회귀 테스트 |
| 78 | 내보내기 통합 | erp-ui.js / labor-engine.js / simple-erp-ledger·payments.sql | 코드 확인 · 인건비/지급 회귀 테스트 |
| 79 | 급여 설정 이동 | erp-ui.js / labor-engine.js / simple-erp-ledger·payments.sql | 코드 확인 · 인건비/지급 회귀 테스트 · 기존 기능 보존 |
| 80 | 누락 조건부 노출 | erp-ui.js / labor-engine.js / simple-erp-ledger·payments.sql | 코드 확인 · 인건비/지급 회귀 테스트 |
| 81 | 이번 주 우선 | app.js: vCurrentWeek / vJobs / compactChrome; workflow·QR SQL | 코드 확인 · 주간 화면/구인·QR 정책 테스트 |
| 82 | 월 달력 전환 | app.js: vCurrentWeek / vJobs / compactChrome; workflow·QR SQL | 코드 확인 · 주간 화면/구인·QR 정책 테스트 |
| 83 | 지난주 복사 | app.js: vCurrentWeek / vJobs / compactChrome; workflow·QR SQL | 코드 확인 · 주간 화면/구인·QR 정책 테스트 |
| 84 | 다음 달 투표 접기 | app.js: vCurrentWeek / vJobs / compactChrome; workflow·QR SQL | 코드 확인 · 주간 화면/구인·QR 정책 테스트 |
| 85 | 자동 스케줄 접기 | app.js: vCurrentWeek / vJobs / compactChrome; workflow·QR SQL | 코드 확인 · 주간 화면/구인·QR 정책 테스트 |
| 86 | 로테이션 조건부 | app.js: vCurrentWeek / vJobs / compactChrome; workflow·QR SQL | 코드 확인 · 주간 화면/구인·QR 정책 테스트 |
| 87 | 출퇴근 명칭 변경 | app.js: vCurrentWeek / vJobs / compactChrome; workflow·QR SQL | 코드 확인 · 주간 화면/구인·QR 정책 테스트 |
| 88 | 매장 QR 중심 | app.js: vCurrentWeek / vJobs / compactChrome; workflow·QR SQL | 코드 확인 · 주간 화면/구인·QR 정책 테스트 · 실기기 카메라/위치 미검증 |
| 89 | 직원 홈 출퇴근 통합 | app.js: vCurrentWeek / vJobs / compactChrome; workflow·QR SQL | 코드 확인 · 주간 화면/구인·QR 정책 테스트 · 실기기 카메라/위치 미검증 |
| 90 | 위치 요청 최소화 | app.js: vCurrentWeek / vJobs / compactChrome; workflow·QR SQL | 코드 확인 · 주간 화면/구인·QR 정책 테스트 · 실기기 카메라/위치 미검증 |
| 91 | 구인 기본값 | app.js: vCurrentWeek / vJobs / compactChrome; workflow·QR SQL | 코드 확인 · 주간 화면/구인·QR 정책 테스트 |
| 92 | 대타 구하기 통합 | app.js: vCurrentWeek / vJobs / compactChrome; workflow·QR SQL | 코드 확인 · 주간 화면/구인·QR 정책 테스트 |
| 93 | 광고 옵션 접기 | app.js: vCurrentWeek / vJobs / compactChrome; workflow·QR SQL | 코드 확인 · 주간 화면/구인·QR 정책 테스트 |
| 94 | 가격 비교 장문 숨김 | app.js: vCurrentWeek / vJobs / compactChrome; workflow·QR SQL | 코드 확인 · 주간 화면/구인·QR 정책 테스트 |
| 95 | 공고 업무 통합 | app.js: vCurrentWeek / vJobs / compactChrome; workflow·QR SQL | 코드 확인 · 주간 화면/구인·QR 정책 테스트 · 기존 기능 보존 |
| 96 | 화면 설정 통합 | app.js: simpleMenu / uiTabs / compactChrome | 코드 확인 · 메뉴/권한 회귀 테스트 |
| 97 | 외관 설정 이동 | app.js: simpleMenu / uiTabs / compactChrome | 코드 확인 · 메뉴/권한 회귀 테스트 |
| 98 | 주요 메뉴 정리 | app.js: simpleMenu / uiTabs / compactChrome | 코드 확인 · 메뉴/권한 회귀 테스트 |
| 99 | 쉬운 명칭 | app.js: simpleMenu / uiTabs / compactChrome | 코드 확인 · 메뉴/권한 회귀 테스트 |
| 100 | 업무 경로 일관화 | app.js: simpleMenu / uiTabs / compactChrome | 코드 확인 · 메뉴/권한 회귀 테스트 |

## 전환·복구 판단

- 기존 매장은 배포 시점의 다음 미개시 영업일부터 실제 근무 집계를 시작한다. 이전 월은 실제 입력이 없는 한 기존 급여 계산·지급 표시를 유지한다.
- 이전 월에 직접 추가한 실제 근무는 해당 일의 스케줄 비용을 대체한다. 전환 전 지급 완료 표시는 중복 지급 차단 근거로 보존한다.
- 추가 주휴·인센티브는 새 근무 ID 없이 서버가 계산한 월 차액으로 정산한다.
- 이미 지급한 기록은 취소 후 보정한다. 지급·금고 원본은 삭제하지 않는다.
- 소스 백업: `backups/plusev-20261013-234535`(작업 루트). 업무 DB 전체 백업은 포함하지 않는다. 스키마·기존 함수 읽기 전용 스냅샷은 `work/erp-schema-before.json`, `work/erp-access-before.json`.
- 롤백은 새 테이블을 삭제하지 않는다. QR 수집을 중단하고 새 업무 기록을 대조한 뒤 백업 소스를 복구한다.

배포 상태는 PR 및 최종 배포 검증 기록을 따른다.
