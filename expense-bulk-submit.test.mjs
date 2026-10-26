import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const src=readFileSync(new URL('./app.js',import.meta.url),'utf8');
const rows=[{id:'a',category:'goods',spent_on:'2026-10-01',amount:20000,memo:null},{id:'b',category:'goods',spent_on:'2026-10-02',amount:30000,memo:null}];
const fields=rows.map(r=>({dataset:{id:r.id},status:{textContent:''},inputs:Object.entries({...r,amount:r.id==='a'?'25,000':'35,000',memo:''}).filter(([name])=>name!=='id').map(([name,value])=>({name,value})),querySelectorAll(){return this.inputs},querySelector(){return this.status}}));
const button={disabled:false},status={textContent:''};let calls=[],closed=false,fail=true;
const c={S:{store:{id:'store',cfg:{}},expAll:rows,expenses:rows},f:{querySelectorAll:()=>fields,querySelector:()=>button},id:'expense-bulk-form',v:{},$:()=>status,toast:()=>{},render:()=>{},reload:async()=>{},closeSheet:()=>{closed=true},q:async p=>{const r=await p;if(r.error)throw r.error;return r.data}};
c.sb={from(table){
  assert.equal(table,'expenses');let id,store;
  return {update(){return this},eq(k,v){if(k==='id')id=v;if(k==='store_id')store=v;return this},select(){return this},async single(){
    assert.equal(store,'store');calls.push(id);return id==='b'&&fail?{error:Error('offline')}:{data:{id}};
  }};
}};
vm.createContext(c);
vm.runInContext(src.slice(src.indexOf('const CAT ='),src.indexOf('const SLOT =')),c);
vm.runInContext(src.slice(src.indexOf('function expenseCategories('),src.indexOf('function fixedYearSheet(')),c);
const start=src.indexOf("    if (id === 'expense-bulk-form')"),end=src.indexOf("    if (id === 'expense-settings-form')",start);
const submit=vm.runInContext('(async()=>{'+src.slice(start,end)+'})',c);
await submit();assert.deepEqual(calls,['a','b']);assert.equal(closed,false);assert.equal(rows[0].amount,25000);assert.equal(rows[1].amount,30000);assert.equal(fields[1].inputs.find(x=>x.name==='amount').value,'35,000');assert.match(fields[1].status.textContent,/저장 실패/);assert.equal(button.disabled,false);
fail=false;calls=[];await submit();assert.deepEqual(calls,['b']);assert.equal(closed,true);assert.equal(rows[1].amount,35000);
closed=false;calls=[];fields[0].inputs.find(x=>x.name==='amount').value='26,000';fields[1].inputs.find(x=>x.name==='spent_on').value='2026-02-30';await submit();assert.deepEqual(calls,[]);assert.match(status.textContent,/유효한 날짜/);
console.log('Expense submit: all-row validation, store scope, partial failure draft retention and retry passed');
