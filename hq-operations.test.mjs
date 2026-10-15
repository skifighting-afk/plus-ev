import assert from 'node:assert/strict';
import { loadHQAdverts, advertHTML, trafficHTML } from './hq-operations.js';
let queried=false;const sb={from(){queried=true;const q={select(){return q},order(){return q},limit(){return q},then(r){r({data:[{id:'p',title:'<광고>',body:'<script>x</script>',store_id:'s',status:'unpaid'}],error:null})}};return q}};
await assert.rejects(()=>loadHQAdverts(sb,false));assert.equal(queried,false);
const posts=await loadHQAdverts(sb,true);assert.equal(posts.length,1);const html=advertHTML(posts[0],{name:'매장'});assert.ok(html.includes('&lt;광고&gt;'));assert.ok(!html.includes('<script>'));assert.ok(!html.includes('<form'));
const traffic=trafficHTML({daily:[{d:'2026-10-15',visitors:10,users:3,signups:2}],by_ref:[{ref:'<evil>',n:4}],people:[{name:'<이름>',days:2}],devices:[],pages:[],modes:[]},'2026-10-01','2026-10-15');assert.ok(traffic.includes('&lt;evil&gt;'));assert.ok(traffic.includes('&lt;이름&gt;'));assert.ok(traffic.includes('날짜별 방문'));
console.log('HQ operations: HQ authorization, escaped read-only adverts and traffic detail passed');
