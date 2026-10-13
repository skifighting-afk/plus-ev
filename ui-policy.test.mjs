import assert from 'node:assert/strict';
import { initialHomeView, ownerNavigation } from './ui-policy.js';
assert.equal(initialHomeView(null),'simple');
assert.equal(initialHomeView('detail'),'detail');
assert.equal(initialHomeView('simple'),'simple');
assert.equal(initialHomeView('bad'),'simple');
assert.deepEqual(ownerNavigation({storeCount:1}).map(x=>x.label),['홈','매출','근무','직원','더보기']);
console.log('UI policy: simple default, saved preference and focused navigation passed');
