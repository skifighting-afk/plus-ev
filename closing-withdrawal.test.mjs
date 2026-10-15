import assert from 'node:assert/strict';
import {closingCash,withdrawalDelta} from './cash-engine.js';
const movements=[{id:'old',business_date:'2026-10-15',closing_report_date:'2026-10-15',direction:'out',amount:100000},{id:'pay',business_date:'2026-10-15',direction:'out',amount:50000},{id:'other',business_date:'2026-10-14',direction:'out',amount:90000}];
assert.equal(closingCash({date:'2026-10-15',opening:300000,cashSales:200000,cashExpenses:10000,ownerWithdrawal:150000,movements}),290000);
assert.equal(withdrawalDelta(100000,100000),0);
assert.equal(withdrawalDelta(100000,150000),50000);
assert.equal(withdrawalDelta(150000,0),-150000);
assert.throws(()=>withdrawalDelta(0,-1));assert.throws(()=>withdrawalDelta(0,1.5));
console.log('Closing withdrawal: replacement preview, other cash movements, corrections and validation passed');
