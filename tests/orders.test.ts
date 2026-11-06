import test from 'node:test';
import assert from 'node:assert/strict';
import { buildOrderDetails, buildPublicOrderDetails, parsePayment, parseCustomer, paymentMethods, paymentMethodLabel, validateWorkflow, type Order } from '../src/lib/orders.ts';
import { isCashByMailReady, paymentDestinations } from '../src/data/payments.ts';
import { POLICY_VERSION } from '../src/data/policies.ts';
import { strains,offers,isOfferAvailable } from '../src/data/catalog.ts';
const customer = {name:'Test Customer',email:'test@example.com',address:'123 Test Street',city:'Fresno',state:'CA',zip:'93701'};
const input = {customer,payment:{method:'cashapp',account:'$TestCustomer'},cart:[{id:'demo-sandia',quantity:1}]};

test('public orders reject missing, false, forged or stale consent and retain the accepted wording',()=>{
  for (const patch of [{}, {terms:false,policyVersion:POLICY_VERSION}, {terms:'true',policyVersion:POLICY_VERSION}, {terms:true}, {terms:true,policyVersion:'old'}]) {
    assert.throws(()=>buildPublicOrderDetails({...input,...patch}),/current order terms/);
  }
  for (const locale of ['en','es']) {
    const raw={...input,terms:true,policyVersion:POLICY_VERSION,locale,agreement:{version:'forged'}};
    const details=buildPublicOrderDetails(raw);
    assert.equal(details.agreement.version,POLICY_VERSION);
    assert.match(details.agreement.statements.en,/21/);
    assert.match(details.agreement.statements.es,/21/);
    // Retrying the same request must not generate a new timestamp or change its snapshot.
    assert.deepEqual(buildPublicOrderDetails(raw),details);
    assert.deepEqual(buildPublicOrderDetails({...raw,locale:locale === 'en' ? 'es':'en'}),details);
  }
});
test('new payment choices are Cash App, Apple Pay and cash without a payment-app account',()=>{
  assert.deepEqual(Object.keys(paymentMethods),['cashapp','apple_pay','cash']);
  for(const [method,account] of [['cashapp','$TestCustomer'],['apple_pay','test@example.com'],['apple_pay','+1 (555) 555-0100']]) assert.deepEqual(parsePayment({method,account}),{method,account});
  assert.deepEqual(parsePayment({method:'cash',account:''}),{method:'cash',account:''});
  assert.deepEqual(parsePayment({method:'cash',account:'stale-account'}),{method:'cash',account:''});
  for(const value of [null,{}, {method:'card',account:'test'}, {method:'cashapp',account:'a b'}, {method:'paypal',account:'test@example.com'}, {method:'zelle',account:'test@example.com'}, {method:'apple_pay',account:'1234567'}, {method:'__proto__',account:'test'}]) assert.throws(()=>parsePayment(value));
});

test('retired payment methods remain editable only on orders already using that method',()=>{
  for(const method of ['paypal','zelle'] as const) {
    const original=buildOrderDetails(input);
    const previous={...original,payment:{method,account:'test@example.com'}} as Order;
    const payload={...input,payment:previous.payment};
    assert.equal(buildOrderDetails(payload,previous).payment.method,method);
    assert.throws(()=>buildOrderDetails(payload),/supported payment/);
    assert.throws(()=>buildOrderDetails(payload,{...previous,payment:original.payment}),/supported payment/);
    assert.equal(buildOrderDetails(input,previous).payment.method,'cashapp');
    assert.ok(paymentMethodLabel(method));
  }
});

test('cash cannot be submitted until a complete mailing destination is configured',()=>{
  assert.equal(isCashByMailReady(null),false);
  const address={recipient:'WHF verification',poBox:'PO Box 123',city:'Fresno',state:'CA',zip:'93701'};
  for(const field of Object.keys(address)) assert.equal(isCashByMailReady({...address,[field]:''}),false);
  assert.equal(isCashByMailReady(address),true);
  const saved=paymentDestinations.cashMailAddress;
  try {
    paymentDestinations.cashMailAddress=null;
    const raw={...input,payment:{method:'cash',account:'stale-account'},terms:true,policyVersion:POLICY_VERSION};
    assert.throws(()=>buildPublicOrderDetails(raw),/P.O. Box/);
    paymentDestinations.cashMailAddress=address;
    assert.deepEqual(buildPublicOrderDetails(raw).payment,{method:'cash',account:''});
  } finally {paymentDestinations.cashMailAddress=saved;}
});
test('server validates bounded US contact details',()=>{
  assert.equal(parseCustomer({...customer,name:'  Test Customer '}).name,'Test Customer');
  for(const patch of [{state:'ZZ'},{email:'invalid'},{zip:'123'},{name:'x'.repeat(121)},{address:null}]) assert.throws(()=>parseCustomer({...customer,...patch}));
});
test('order totals and item snapshots come from trusted catalog data',()=>{
  const details=buildOrderDetails({...input,subtotal:1,total:1,cart:[{id:'demo-sandia',quantity:2,unitCents:1,name:'forged'}]});
  assert.equal(details.total,13000); assert.equal(details.items[0].name,'La Sandía'); assert.equal(details.items[0].unitCents,6000);
  for(const cart of [[],[{id:'unknown',quantity:1}],[{id:'demo-sandia',quantity:3}],[{id:'demo-sandia',quantity:1.5}],[{id:'demo-sandia',quantity:1},{id:'demo-sandia',quantity:1}],[{id:'demo-sandia',quantity:0}]]) assert.throws(()=>buildOrderDetails({...input,cart}));
});
test('unavailable items are rejected, while existing order lines retain agreed prices',()=>{
  const strain=strains.find(s=>s.id==='la-sandia')!; const available=strain.available;
  const original=buildOrderDetails(input); const previous={...original,shipping:850} as Order;
  try {
    strain.available=false;
    assert.throws(()=>buildOrderDetails(input));
    const edit=buildOrderDetails(input,previous); assert.equal(edit.items[0].unitCents,6000); assert.equal(edit.shipping,850);
    assert.throws(()=>buildOrderDetails({...input,cart:[{id:'demo-sandia',quantity:2}]},previous));
  } finally {strain.available=available;}
});
test('retired offer snapshots can be retained or removed without catalog lookup',()=>{
  const original=buildOrderDetails(input);
  const previous={...original,items:[{...original.items[0],id:'retired-offer',unitCents:4200}]} as Order;
  const edit=buildOrderDetails({...input,cart:[{id:'retired-offer',quantity:1}]},previous);
  assert.equal(edit.total,5200); assert.throws(()=>buildOrderDetails({...input,cart:[{id:'retired-offer',quantity:2}]},previous));
});
test('catalog price changes do not reprice an existing order',()=>{
  const original=buildOrderDetails(input);
  const previous={...original,items:[{...original.items[0],unitCents:6500}],subtotal:6500,total:7500} as Order;
  assert.equal(buildOrderDetails(input).total,7000);
  const edit=buildOrderDetails(input,previous);
  assert.equal(edit.items[0].unitCents,6500);
  assert.equal(edit.total,7500);
});
test('checkout accepts one pack of every available variety at the $60 price',()=>{
  const order=buildOrderDetails({...input,cart:offers.filter(isOfferAvailable).map(offer=>({id:offer.id,quantity:1}))});
  assert.equal(order.items.length,18);
  assert.ok(order.items.every(item=>item.unitCents===6000));
  assert.equal(order.subtotal,108000);
  assert.equal(order.total,109000);
});

test('upcoming Caviar varieties are rejected even if their availability flag is enabled',()=>{
  for(const strain of strains.filter(s=>s.collection==='caviar')) {
    const offer=offers.find(o=>o.strain===strain.id)!;
    const cart=[{id:offer.id,quantity:1}];
    assert.throws(()=>buildOrderDetails({...input,cart}),/unavailable/);
    try {
      strain.available=true;
      assert.equal(isOfferAvailable(offer),false);
      assert.throws(()=>buildOrderDetails({...input,cart}),/unavailable/);
    } finally {strain.available=false;}
  }
});
test('fulfillment requires verified payment and shipping requires tracking',()=>{
  validateWorkflow('pending','unfulfilled',''); validateWorkflow('requested','unfulfilled',''); validateWorkflow('paid','packing',''); validateWorkflow('paid','shipped','TEST123'); validateWorkflow('refunded','cancelled','');
  for(const args of [['pending','packing',''],['requested','shipped','TEST'],['paid','shipped',''],['paid','delivered',''],['paid','invalid',''],['invalid','unfulfilled','']]) assert.throws(()=>validateWorkflow(...args as [string,string,string]));
});
