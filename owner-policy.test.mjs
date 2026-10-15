import assert from 'node:assert/strict';
import { visibleNotifications, advertStatus } from './owner-policy.js';
const rows=[{body:'[운영 점검] 자동작업 실패 plusev-health (1회)'},{body:'시드 급여 지급 확인'},{body:'최저임금 확인'},{body:'매장 공지입니다'}];
assert.deepEqual(visibleNotifications(rows,'store'),[rows[3]]);assert.equal(visibleNotifications(rows,'hq').length,4);assert.equal(visibleNotifications(rows,'staff').length,3);assert.equal(rows.length,4);
assert.equal(advertStatus({status:'open',expires_at:'2020-01-01'},Date.parse('2026-10-15')),'expired');assert.equal(advertStatus({status:'unpaid'},0),'unpaid');
console.log('Owner policy: operations alerts HQ-only, requested home notices hidden and advert expiry passed');
