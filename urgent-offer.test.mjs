import assert from 'node:assert/strict';
import { feeLines } from './engine.js';
import { PRICING } from './pricing.js';
Object.assign(PRICING.jobs, { urgent: 10000, matchPct: 6, flashDay: 5500 });
const lines = feeLines('urgent', { pay: 100000, heads: 2, urgentFree: true });
assert.equal(lines.reduce((s, x) => s + x[1], 0), 200000, 'eligible company pays wages without service fees');
assert.equal(feeLines('urgent', { pay: 100000, heads: 2, urgentFree: true, flash: true }).reduce((s,x)=>s+x[1],0),205500);
assert.equal(feeLines('urgent', { pay: 100000, heads: 2 }).reduce((s,x)=>s+x[1],0),232000);
console.log('urgent offer: wages retained, service fees waived, optional ads separate, regular fees retained');
