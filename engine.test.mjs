import assert from 'node:assert';
import * as E from './engine.js';
import { PRICING } from './pricing.js';
// 요금 계산식 검사용 고정값 (실제 요금은 서버 pricing 테이블 값을 씀)
Object.assign(PRICING.jobs, { base: { 1: 4400, 3: 8800, 5: 12100, 14: 19800, 30: 33000 }, urgent: 10000, matchPct: 5 });
const p={id:'b',hourly_rate:14000,contract:'4대',night_pay:true,labor_law:null};
const tpl=[0,1,2,3].map(w=>({member_id:'b',weekday:w,start_t:'18:00',end_t:'02:30',break_min:null}));
const r=E.payroll(p,2026,9,tpl,[],0,'2026-09-26',['22:00','06:00']);
assert.equal(r.base,1575000);assert.equal(r.np,416912);assert.equal(r.juhu,252000);assert.equal(r.days,15);
assert.equal(E.hireFee({days:14,jump:5,flash:true,top:false,heads:2}),19800+Math.round((19800+5500)*14*0.9/100)*100);
assert.equal(E.urgentFee({pay:100000,heads:1}),115000);
assert.equal(E.urgentFee({pay:130000,heads:2,flash:true}),260000+20000+13000+5500);assert.equal(E.hireFee({days:1,heads:1}),4400);assert.equal(E.hireFee({days:3,heads:1}),8800);
assert.equal(E.hireFee({days:14,top:true,heads:1}),19800+Math.round(29700*14*0.9/100)*100);
assert.equal(E.hireFee({days:30,jump:0,heads:1}),33000);
// 날짜 예외: 9/28 휴무, 9/29 20~06 휴게 90분
const ov=[{member_id:'b',work_date:'2026-09-28',off:true},{member_id:'b',work_date:'2026-09-29',start_t:'20:00',end_t:'06:00',break_min:90,off:false}];
const sh=E.shiftsOf(p,2026,9,tpl,ov,'2026-09-26',['22:00','06:00']);
assert.ok(!sh.find(x=>x.d===28));const d29=sh.find(x=>x.d===29);assert.equal(d29.hours,8.5);assert.equal(d29.ot,0.5);
assert.equal(E.wdOf(2026,10,1),3);
console.log('engine ok',r.fullGross);
// 주휴: 9/28~10/4 주는 10월에 지급 (9월 28~30일 근무 포함)
const o10=E.payroll(p,2026,10,tpl,[],0,'2026-11-01',['22:00','06:00']);
assert.equal(o10.juhu, 84000*4); // 9/28주(9월 28~30일 포함)·10/5·10/12·10/19 주. 10/26주는 11/1에 끝나서 11월 지급
