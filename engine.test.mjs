import assert from 'node:assert';
import * as E from './engine.js';
const p={id:'b',hourly_rate:14000,contract:'4대',night_pay:true,labor_law:null};
const tpl=[0,1,2,3].map(w=>({member_id:'b',weekday:w,start_t:'18:00',end_t:'02:30',break_min:null}));
const r=E.payroll(p,2026,9,tpl,[],0,'2026-09-26',['22:00','06:00']);
assert.equal(r.base,1575000);assert.equal(r.np,416912);assert.equal(r.juhu,231000);assert.equal(r.days,15);
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
