// Run only against a development deployment/project: node --experimental-strip-types --env-file=.env scripts/verify-orders-live.mjs
// Uses disposable, randomly identified fixtures and removes only those fixtures.
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { POLICY_VERSION } from '../src/data/policies.ts';
const origin = process.env.WHF_TEST_ORIGIN || 'http://127.0.0.1:4322';
const db = createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SECRET_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const requestId=randomUUID(); const password=randomBytes(30).toString('hex');
const email=`whf-check-${randomUUID()}@example.invalid`; let userId; let orderId;
const customer={name:'WHF disposable verification',email,address:'123 Test Street',city:'Fresno',state:'CA',zip:'93701'};
const payload={requestId,customer,payment:{method:'cashapp',account:'$WHFTest'},cart:[{id:'demo-sandia',quantity:1}],terms:true,policyVersion:POLICY_VERSION,locale:'en'};
const send = (path,body,cookie='',method='POST') => fetch(`${origin}${path}`,{method,redirect:'manual',headers:{Origin:origin,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:JSON.stringify(body)});
const login=()=>fetch(`${origin}/admin/login/`,{method:'POST',redirect:'manual',headers:{Origin:origin,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({email,password})});
try {
  const locked=await fetch(`${origin}/admin/orders/`,{redirect:'manual'}); assert.equal(locked.status,302); assert.match(locked.headers.get('location'),/admin\/login/); assert.match(locked.headers.get('cache-control'),/no-store/);
  assert.equal((await send('/api/admin/orders/00000000-0000-4000-8000-000000000000/',{},'','PATCH')).status,401);
  assert.equal((await fetch(`${origin}/api/orders/`,{method:'POST',headers:{Origin:'https://other.example','Content-Type':'application/json'},body:'{}'})).status,403);
  const invalid=await send('/api/orders/',{...payload,payment:{method:'cashapp',account:''}}); assert.equal(invalid.status,400);
  for (const payment of [{method:'paypal',account:email},{method:'zelle',account:email},{method:'cash',account:''}]) {
    assert.equal((await send('/api/orders/',{...payload,payment})).status,400);
  }
  const submissions=await Promise.all([send('/api/orders/',payload),send('/api/orders/',payload)]);
  const receipts=await Promise.all(submissions.map(async r=>{const body=await r.json();assert.equal(r.status,201,JSON.stringify(body));return body.confirmation;}));
  assert.deepEqual(receipts[0],receipts[1]); assert.equal(receipts[0].total,7000);
  const saved=await db.from('whf_orders').select('id,version,items,customer,payment,shipping',{count:'exact'}).eq('request_id',requestId); assert.ifError(saved.error); assert.equal(saved.count,1); orderId=saved.data[0].id;
  const created=await db.auth.admin.createUser({email,password,email_confirm:true}); assert.ifError(created.error); userId=created.data.user.id;
  const denied=await login(); assert.equal(denied.status,200); assert.match(await denied.text(),/does not have WHF admin access/);
  assert.ifError((await db.from('whf_admins').insert({user_id:userId})).error);
  const signedIn=await login(); assert.equal(signedIn.status,303); const cookie=signedIn.headers.getSetCookie().map(v=>v.split(';')[0]).join('; '); assert.match(cookie,/sb-/);
  assert.ok(signedIn.headers.getSetCookie().every(v=>/HttpOnly/i.test(v)));
  const list=await fetch(`${origin}/admin/orders/`,{headers:{Cookie:cookie}}); assert.equal(list.status,200); assert.match(await list.text(),/WHF disposable verification/);
  const detail=await fetch(`${origin}/admin/orders/${orderId}/`,{headers:{Cookie:cookie}}); assert.equal(detail.status,200); assert.match(await detail.text(),/Payment request/);
  const edit={version:1,customer,payment:payload.payment,cart:payload.cart,payment_status:'paid',fulfillment_status:'packing',tracking:'',carrier:'',notes:'Disposable test note'};
  const updated=await send(`/api/admin/orders/${orderId}/`,edit,cookie,'PATCH'); const updateBody=await updated.json(); assert.equal(updated.status,200,JSON.stringify(updateBody)); assert.equal(updateBody.order.version,2);
  assert.equal((await send(`/api/admin/orders/${orderId}/`,edit,cookie,'PATCH')).status,409);
  assert.equal((await send(`/api/admin/orders/${orderId}/`,{...edit,version:2,fulfillment_status:'shipped'},cookie,'PATCH')).status,400);
  const history=await db.from('whf_order_events').select('id',{count:'exact'}).eq('order_id',orderId); assert.equal(history.count,2);
  assert.equal((await send(`/api/admin/orders/${orderId}/`,{...edit,version:2,fulfillment_status:'shipped',tracking:'TEST123'},cookie,'PATCH')).status,200);
  assert.equal((await send(`/api/admin/orders/${orderId}/`,{...edit,version:3,fulfillment_status:'shipped',tracking:'TEST123',notes:'Updated after shipping'},cookie,'PATCH')).status,200);
  assert.equal((await send(`/api/admin/orders/${orderId}/`,{...edit,version:4,fulfillment_status:'shipped',tracking:'TEST123',customer:{...customer,address:'456 Changed Street'}},cookie,'PATCH')).status,400);
  let version=4;
  for(const method of ['paypal','zelle']) {
    const legacyPayment={method,account:email};
    assert.ifError((await db.from('whf_orders').update({payment:legacyPayment}).eq('id',orderId)).error);
    const legacyDetail=await fetch(`${origin}/admin/orders/${orderId}/`,{headers:{Cookie:cookie}});
    assert.equal(legacyDetail.status,200);assert.match(await legacyDetail.text(),/retains its original payment method/);
    const retained=await send(`/api/admin/orders/${orderId}/`,{...edit,version,payment:legacyPayment,fulfillment_status:'shipped',tracking:'TEST123'},cookie,'PATCH');
    assert.equal(retained.status,200);version++;
  }
  const publicClient=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false}});
  assert.ok((await publicClient.from('whf_orders').select('*')).error);
  assert.ifError((await db.from('whf_admins').delete().eq('user_id',userId)).error);
  assert.equal((await fetch(`${origin}/admin/orders/`,{headers:{Cookie:cookie}})).status,403);
  console.log('Live checks passed: checkout, payment restrictions, retained legacy payments, concurrent retry, admin login, authorization, edits, conflicts, history, and public data isolation.');
} finally {
  if (!orderId) { const lookup=await db.from('whf_orders').select('id').eq('request_id',requestId).maybeSingle();orderId=lookup.data?.id; }
  if(orderId){assert.ifError((await db.from('whf_order_events').delete().eq('order_id',orderId)).error);assert.ifError((await db.from('whf_orders').delete().eq('id',orderId)).error);}
  if(userId){assert.ifError((await db.from('whf_admins').delete().eq('user_id',userId)).error);assert.ifError((await db.auth.admin.deleteUser(userId)).error);}
  console.log('Disposable verification records removed.');
}
