import assert from 'node:assert/strict';
globalThis.window={};const {createClient}=await import('./demo/mock-sb.js');const db=window.__DB,c=createClient();
window.__USERS['hq@view']={id:'hq'};window.__USERS['staff@view']={id:'staff'};
db.profiles.push({id:'hq',is_hq:true},{id:'staff',is_hq:false});db.companies.push({id:'c'});db.stores.push({id:'a',company_id:'c',labor_actual_from:'2026-01-01'},{id:'b',company_id:'c',labor_actual_from:'2026-01-01'});db.members.push({id:'ma',user_id:'staff',store_id:'a',role:'staff',active:true,hourly_rate:12000,contract:'3.3'},{id:'mb',store_id:'b',role:'staff',active:true,hourly_rate:12000,contract:'3.3'});
await c.auth.signInWithPassword({email:'hq@view'});const before=JSON.stringify(db);
for(const id of ['a','b']){const r=await c.rpc('actual_payroll',{p_store:id,p_month:'2026-10-01'});assert.equal(r.error,null);assert.equal(r.data.members.length,1)}
assert.ok((await c.rpc('record_cash',{p_store:'a',p_request:'x',p_amount:1,p_direction:'out',p_reason:'test'})).error);assert.ok((await c.rpc('record_work',{p_store:'a',p_member:'ma',p_request:'x'})).error);assert.equal(JSON.stringify(db),before);
await c.auth.signInWithPassword({email:'staff@view'});assert.ok((await c.rpc('actual_payroll',{p_store:'b',p_month:'2026-10-01'})).error);
console.log('HQ payroll: cross-store read, write denial, no mutations and unrelated staff denial passed');
