import assert from 'node:assert/strict';
import * as E from './engine.js';
import {payslipBody,laborBody} from './docs.js';
assert.equal(E.dedOf(100000,'없음'),0);assert.equal(E.dedOf(100000,'3.3'),3300);assert.equal(E.dedOf(100000,'4대'),E.ins4(100000));
const p={id:'m',contract:'없음',hourly_rate:10000,labor_law:false,night_pay:false};const r=E.payroll(p,2026,1,[],[{member_id:'m',work_date:'2026-01-05',start_t:'09:00',end_t:'17:00',break_min:0}],0,'2026-02-01');assert.equal(r.gross,80000);assert.equal(r.net,80000);
const text=payslipBody({contract:'없음',lines:[],gross:80000,ded:0,net:80000});assert.ok(text.includes('공제 없음'));assert.ok(!text.includes('3.3%'));assert.ok(laborBody({contract:'없음'}).includes('공제 없음'));
console.log('No deduction: wages stay included, net equals gross, old contracts unchanged, documents accurate');
