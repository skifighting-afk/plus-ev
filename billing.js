// Session binding only. Provider authKey and billingKey are never stored in the browser.
export function createBillingClient({api,store,origin,pathname}) {
 return {
  status:company=>api('status',{company}),
  quote:(company,plan)=>api('quote',{company,plan}),
  begin:async(company,plan,quote)=>{const s=await api('begin',{company,plan,consent:'billing-v1',expected_amount:quote?.amount,expected_normal:quote?.normal_amount});store.setItem('ev-billing-session',JSON.stringify({session:s.session,customerKey:s.customer_key}));return s;},
  urls:session=>({successUrl:`${origin}${pathname}?billing=ok&billing_session=${encodeURIComponent(session)}`,failUrl:`${origin}${pathname}?billing=fail`}),
  complete:async params=>{
   let session;try{session=JSON.parse(store.getItem('ev-billing-session'));}catch{}
   if(!session||session.session!==params.get('billing_session')||session.customerKey!==params.get('customerKey'))throw Error('카드 등록 정보가 일치하지 않아요. 다시 등록해 주세요');
   const result=await api('complete',{session:session.session,customerKey:session.customerKey,authKey:params.get('authKey')});
   store.removeItem('ev-billing-session');return result;
  },
  cancel:company=>api('cancel',{company}),
  retry:company=>api('retry',{company})
 };
}
