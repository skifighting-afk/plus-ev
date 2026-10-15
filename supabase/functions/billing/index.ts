import {createClient} from 'https://esm.sh/@supabase/supabase-js@2';
import {createBillingService,createTossProvider,createKeyCipher} from './core.mjs';

const env=(key:string)=>Deno.env.get(key)||'';
const origin=env('BILLING_APP_ORIGIN')||'https://plusevapp.kr';
const headers={'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info, x-billing-scheduler','Access-Control-Allow-Methods':'POST, OPTIONS','Cache-Control':'no-store','Vary':'Origin'};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...headers,'Content-Type':'application/json'}});
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(req.method!=='POST')return json({ok:false,message:'POST required'},405);
 if(req.headers.get('origin')&&req.headers.get('origin')!==origin)return json({ok:false,message:'허용되지 않은 요청이에요'},403);
 try{
  const body=await req.json();
  if(['begin','quote'].includes(body.action)&&env('BILLING_ENROLLMENT_ENABLED')!=='true')return json({ok:false,message:'정기결제 연결을 준비 중이에요'},503);
  const clientKey=env('TOSS_BILLING_CLIENT_KEY'),secret=env('TOSS_BILLING_SECRET_KEY');
  const test=clientKey.startsWith('test_');
  if(!/^(test|live)_/.test(clientKey)||!secret.startsWith(test?'test_':'live_')||!env('BILLING_ENCRYPTION_KEY'))return json({ok:false,message:'정기결제 연결을 준비 중이에요'},503);
  const sb=createClient(env('SUPABASE_URL'),env('SUPABASE_SERVICE_ROLE_KEY'),{auth:{persistSession:false,autoRefreshToken:false}});
  let user:string|null=null,scheduler=false;
  if(body.action==='run'){
   const expected=env('BILLING_SCHEDULER_SECRET');
   scheduler=expected.length>=32&&req.headers.get('x-billing-scheduler')===expected;
   if(!scheduler)return json({ok:false,message:'권한이 없어요'},403);
  }else{
   const token=(req.headers.get('authorization')||'').replace(/^Bearer\s+/i,'');
   const {data,error}=await sb.auth.getUser(token);
   if(error||!data.user)return json({ok:false,message:'로그인이 필요해요'},401);
   user=data.user.id;
  }
  const repo={command:async(action:string,uid:string|null,args:unknown,test:boolean)=>{const {data,error}=await sb.rpc('billing_command',{p_action:action,p_user:uid,p_args:args,p_test:test});if(error)throw Error(error.message);return data;}};
  const cipher=await createKeyCipher(env('BILLING_ENCRYPTION_KEY'));
  const service=createBillingService({repo,provider:createTossProvider(secret),...cipher,config:{clientKey,test}});
  return json({ok:true,...await service(body.action,user,body,scheduler)});
 }catch(error){
  // Only safe, user-oriented errors are returned. Never log request bodies or provider payloads.
  const message=error instanceof Error?error.message:'';
  return json({ok:false,message:/[가-힣]/.test(message)?message:'정기결제 처리에 실패했어요. 운영사에 문의해 주세요'},400);
 }
});
