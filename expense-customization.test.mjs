import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import * as E from './engine.js';
const src=readFileSync(new URL('./app.js',import.meta.url),'utf8');
const c={E,TODAY:'2026-10-15',S:{y:2026,m:10,store:{cfg:{}},hist:[],expAll:[
 {id:'a',category:'goods',amount:20000,spent_on:'2026-10-01',memo:'쿠팡',source:'bill'},
 {id:'b',category:'goods',amount:160000,spent_on:'2026-10-03',source:'bill'},
 {id:'c',category:'water',amount:100,spent_on:'2026-11-01'},
 {id:'d',category:'etc',amount:500,spent_on:'2026-10-20',source:'close'}]},
 monthRange:()=>['2026-10-01','2026-10-31'],fixedFor:()=>({fx:{rent:3100000},own:true}),
 monthSummary:()=>({sales:1000000,actualExp:{rent:1500000,goods:180000,card:1600}}),
 esc:s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;'),isOwner:()=>true,openSheet:html=>c.html=html};
vm.createContext(c);
vm.runInContext(src.slice(src.indexOf('const CAT ='),src.indexOf('const SLOT =')),c);
vm.runInContext(src.slice(src.indexOf('function expenseCategories('),src.indexOf('function fixedYearSheet(')),c);
assert.equal(c.expenseMonthData().rows.length,3);
assert.equal(c.expenseMonthData().total,3282100);
c.expenseList('goods');
assert.ok(c.html.includes('180,000')&&c.html.includes('2026-10-01')&&c.html.includes('쿠팡'));
assert.ok(!c.html.includes('2026-11-01'));
c.expenseList('rent');assert.ok(c.html.includes('고정비')&&c.html.includes('3,100,000'));
c.S.store.cfg.expense_display={labels:{goods:'<쿠팡>'},hidden:['goods'],order:['goods'],show_zero:false};
assert.equal(c.categoryName('goods'),'<쿠팡>');
assert.equal(c.expenseMonthData().total,3282100,'hiding never changes total');
assert.ok(!c.fixedCard().includes('data-category="goods"'));
c.expenseList('goods');assert.ok(c.html.includes('&lt;쿠팡>'));
const row=c.S.expAll[0], valid={category:'goods',amount:'30000',spent_on:'2026-10-02',memo:'test'};
assert.equal(c.expensePatch(row,valid).amount,30000);
assert.equal(c.expensePatch(row,{...valid,amount:'30,000'}).amount,30000,'formatted money input is accepted');
assert.ok(c.html.includes('data-act="exp-del"') && c.html.includes('data-act="bin"'),'delete and recovery remain reachable');
for(const amount of ['0','1.5','2147483648','NaN']) assert.throws(()=>c.expensePatch(row,{...valid,amount}));
assert.throws(()=>c.expensePatch(row,{...valid,spent_on:'2026-02-30'}));
assert.throws(()=>c.expensePatch(row,{...valid,category:'nope'}));
assert.throws(()=>c.expensePatch(c.S.expAll[3],valid));
const changed=[{row,patch:c.expensePatch(row,valid)},{row:c.S.expAll[1],patch:{...valid,amount:40000}}];
let calls=[];
let result=await c.saveExpenseChanges(changed,async(r,p)=>{calls.push(r.id);if(r.id==='b')throw Error('offline');});
assert.equal(result.failed.length,1);assert.equal(result.saved,1);assert.equal(row.amount,30000);
assert.equal(c.S.expAll[1].amount,160000,'failed row not mutated');
assert.equal(c.expenseChanged(row,changed[0].patch),false,'saved row not resent on retry');
console.log('Expense customization: totals, dates, settings, protected edits and partial-save recovery passed');
