import assert from 'node:assert/strict';
import { hasCompanyPro, nextAttendance } from './feature-policy.js';
const now = Date.parse('2026-10-13T00:00:00Z');
assert.equal(hasCompanyPro({plan:'pro',paid_until:'2026-11-01T00:00:00Z'},now),true);
for(const c of [null,{plan:'basic',paid_until:'2027-01-01'},{plan:'pro'},{plan:'pro',paid_until:'2026-10-13T00:00:00Z'}]) assert.equal(hasCompanyPro(c,now),false);
assert.equal(nextAttendance(null),'in');
assert.equal(nextAttendance({kind:'in',at:'2000-01-01'}),'out');
assert.equal(nextAttendance({kind:'out'}),'in');
console.log('feature policy ok');
