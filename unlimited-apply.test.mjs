import assert from 'node:assert/strict';
globalThis.window = {};
const { createClient } = await import(process.argv[2] || './demo/mock-sb.js');
const db = window.__DB;
window.__USERS['dealer@test.dev'] = { id: 'dealer', email: 'dealer@test.dev' };
db.profiles.push({ id: 'dealer', kind: 'dealer' });
db.stores.push({ id: 'store', company_id: 'company' });
const client = createClient();
await client.auth.signInWithPassword({ email: 'dealer@test.dev' });
for (let i = 0; i < 25; i++) {
  const id = `post-${i}`;
  db.job_posts.push({ id, store_id: 'store', status: 'open' });
  const result = await client.rpc('apply_job', { p_post: id });
  assert.equal(result.error, null, 'applications succeed with zero tickets and no quota');
}
assert.equal(db.applications.length,25);
assert.equal(db.ticket_ledger.length,0,'no ticket is reserved or consumed');
assert.ok((await client.rpc('apply_job',{p_post:'post-0'})).error,'duplicate applications still rejected');
assert.ok((await client.rpc('pay_start',{p_kind:'tickets',p_arg:{pack:1}})).error,'ticket sales disabled');
console.log('unlimited apply: 25 zero-ticket applications, no ledger consumption, duplicate protection and ticket-sale block passed');
