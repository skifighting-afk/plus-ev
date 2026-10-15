import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const db=new PGlite();
await db.exec(`create schema auth;
create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.uid',true),'')::uuid $$;
create function public.is_hq() returns boolean language sql as $$ select coalesce(current_setting('request.hq',true),'false')='true' $$;
create table companies(id uuid primary key default gen_random_uuid(),name text,brand text,biz_no text);
create table stores(id uuid primary key default gen_random_uuid(),company_id uuid,name text,area text);
create table members(company_id uuid,store_id uuid,user_id uuid,role text,nick text);
create table signup_log(id bigint generated always as identity,day date,company_id uuid,user_id uuid,company_name text,store_name text,area text,owner_name text,paid_at timestamptz,paid_to text);
insert into signup_log(day) select (now() at time zone 'Asia/Seoul')::date from generate_series(1,5);
select set_config('request.uid','11111111-1111-4111-8111-111111111111',false);`);
const migration=new URL('../migrations/retire-entry-promo.sql',import.meta.url);
await db.exec(await fs.readFile(migration,'utf8'));

test('sixth registration succeeds and creates no cash-benefit entry',async()=>{
 const result=await db.query("select create_company('test',null,'4305101099','test store',null,'owner') as id");
 assert.ok(result.rows[0].id);
 assert.equal((await db.query('select count(*)::int as n from companies')).rows[0].n,1);
 assert.equal((await db.query('select count(*)::int as n from signup_log')).rows[0].n,5);
 assert.equal((await db.query("select count(*)::int as n from members where role='owner'")).rows[0].n,1);
});
test('registration still requires login and a ten-digit business number',async()=>{
 await assert.rejects(db.query("select create_company('test',null,'123','test',null,'owner')"),/사업자등록번호/);
 await db.exec("select set_config('request.uid','',false)");
 await assert.rejects(db.query("select create_company('test',null,'4305101099','test',null,'owner')"),/로그인/);
 await db.exec("select set_config('request.uid','11111111-1111-4111-8111-111111111111',false)");
});
