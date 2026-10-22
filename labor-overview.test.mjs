import assert from 'node:assert/strict';
import { laborTotals, scheduleTotals } from './labor-overview.js';
const members=[{id:'a',nick:'직원',contract:'3.3'},{id:'b',nick:'퇴사자',contract:'4대',active:false}];
const payroll={members:[{member_id:'a',gross:3000000,projected_gross:6000000,hours:200,incomplete:2},{member_id:'b',gross:1000000,projected_gross:1000000,hours:70}],incomplete:2};
const r=laborTotals({members,payroll,sales:20000000,scheduled:{a:{hours:250,brk:300},b:{hours:70,brk:0}}});
assert.equal(r.gross,4000000);assert.equal(r.cost,4105000);assert.equal(r.ratio,20.525);assert.equal(r.rows[1].hours,70);assert.equal(r.rows[0].plannedHours,250);assert.equal(r.incomplete,2);assert.equal(laborTotals({members,payroll,sales:0}).ratio,null);
assert.equal(laborTotals({members:[],payroll:{members:[]},sales:1}).cost,0);
console.log('Labor overview: actual-sales ratio, former staff, gross cost, insurance, breaks/plans and missing confirmation passed');

const plan=scheduleTotals([{date:'2026-10-15',hours:8,brk:0},{date:'2026-10-16',hours:7.5,brk:30}],[{work_date:'2026-10-15',start_at:'2026-10-15T09:00:00Z',end_at:'2026-10-15T13:00:00Z',break_min:0,status:'planned'},{work_date:'2026-10-17',start_at:'2026-10-17T09:00:00Z',end_at:'2026-10-17T13:00:00Z',break_min:30,status:'confirmed'},{work_date:'2026-10-18',status:'void',start_at:'2026-10-18T09:00:00Z',end_at:'2026-10-18T13:00:00Z'}],'2026-10');
assert.deepEqual(plan,{hours:15,brk:60},'manual plans replace same-day templates, preserve explicit zero breaks and exclude void work');

// 2026-10-23: 식대(비과세)에는 4대보험 사업주분을 붙이지 않는다 — 노량진 김준영 180h10m × 15,000 + 식대 200,000
{ const { laborTotals: lt } = await import('./labor-overview.js');
  const r = lt({ members:[{id:'k',nick:'김준영',contract:'4대'}], payroll:{members:[{member_id:'k',contract:'4대',gross:2902500,meal:200000,hours:180.1667}]}, sales:30830000 });
  if (r.rows[0].cost !== 3186263) throw Error('식대 보험료 제외 실패: '+r.rows[0].cost); console.log('meal-insurance ok'); }
