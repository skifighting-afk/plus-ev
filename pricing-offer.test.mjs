import assert from 'node:assert/strict';
import * as pricing from './pricing.js';

assert.equal(typeof pricing.companyOffer, 'function', 'company offer policy exists');
const quote = pricing.companyOffer;
const company = { created_at: '2026-10-13T00:00:00Z' };
assert.deepEqual(quote(company, '2026-10-13'), { active: true, endsOn: '2027-04-13', basic: 0, pro: 9900 });
assert.equal(quote(company, '2027-04-12').active, true);
assert.deepEqual(quote(company, '2027-04-13'), { active: false, endsOn: '2027-04-13', basic: 25000, pro: 35000 });
assert.equal(quote(company, '2026-10-12').active, false, 'future registrations do not qualify early');
assert.equal(quote({ created_at: '2026-08-31T00:00:00Z' }, '2026-09-01').endsOn, '2027-02-28');
assert.equal(quote({ created_at: '2023-08-31T00:00:00Z' }, '2023-09-01').endsOn, '2024-02-29');
assert.equal(quote({ created_at: '2026-10-13T16:00:00Z' }, '2026-10-14').endsOn, '2027-04-14', 'registration day uses Korea time');
assert.equal(quote({ created_at: '2026-10-13' }, '2026-10-13').endsOn, '2027-04-13');
for (const c of [null, {}, { created_at: 'bad' }, { created_at: '2026-02-30' }]) {
  assert.deepEqual(quote(c, '2026-10-13'), { active: false, endsOn: null, basic: 25000, pro: 35000 });
}
pricing.applyPricing([{ key: 'basic_monthly', amount: 27000 }, { key: 'pro_monthly', amount: 39000 }]);
assert.equal(quote(company, '2026-10-13').pro, 9900, 'normal price changes do not overwrite introductory price');
assert.equal(quote(company, '2027-04-13').basic, 27000);
assert.equal(quote(company, '2027-04-13').pro, 39000);
console.log('company offer: six calendar months, KST, month ends, expiry and regular prices passed');
