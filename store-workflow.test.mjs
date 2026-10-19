import assert from 'node:assert/strict';
import {formatHours,ratioParts,foldSection} from './store-workflow.js';
assert.equal(formatHours(9+50/60),'9시간 50분');assert.equal(formatHours(8),'8시간');assert.equal(formatHours(0),'0시간');
assert.deepEqual(ratioParts({cost:300,sales:1000,goal:2000,dayCost:100,daySales:500}),{actual:30,target:15,daily:20});assert.equal(ratioParts({cost:300,sales:0,goal:0}).actual,null);
const h=foldSection('briefing','브리핑','<p>내용</p>',false,{});assert.ok(!h.includes(' open'));assert.ok(h.includes('<summary>브리핑</summary>'));assert.ok(foldSection('briefing','브리핑','x',false,{briefing:true}).includes(' open'));
console.log('Store workflow: exact hour/minute labels, separate ratio denominators and saved folds passed');
