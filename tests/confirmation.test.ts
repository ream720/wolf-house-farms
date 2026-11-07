import test from 'node:test';
import assert from 'node:assert/strict';
import { confirmationInstructions } from '../src/lib/confirmation.ts';

test('cash confirmation asks for prompt mailing with an order number and shows the address',()=>{
  const en=confirmationInstructions('cash','en');
  assert.match(en.body,/as soon as possible/);
  assert.match(en.body,/Include order # with payment/);
  assert.doesNotMatch(en.body,/wait/i);
  assert.equal(en.showMailingAddress,true);
  const es=confirmationInstructions('cash','es');
  assert.match(es.body,/lo antes posible/);
  assert.match(es.body,/número de pedido/);
  assert.equal(es.showMailingAddress,true);
});

test('digital confirmations wait for the selected app request and do not show a mailing address',()=>{
  for(const method of ['cashapp','apple_pay'] as const) {
    const en=confirmationInstructions(method,'en');
    assert.match(en.body,/Wait for Wolf House Genetics/);
    assert.ok(en.body.includes(method==='cashapp'?'Cash App':'Apple Pay'));
    assert.equal(en.showMailingAddress,false);
    const es=confirmationInstructions(method,'es');
    assert.match(es.body,/Espera/);
    assert.equal(es.showMailingAddress,false);
  }
});
