// Development verification only. Creates and removes one random test reservation;
// never sends payment, customer messages, or fulfillment instructions.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { POLICY_VERSION } from '../src/data/policies.ts';

const origin = process.env.WHF_TEST_ORIGIN || 'http://127.0.0.1:4325';
assert.match(origin, /^http:\/\/(?:127\.0\.0\.1|localhost):\d+$/);
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const requestId = randomUUID();
const payload = {
  requestId, locale: 'en', terms: true, policyVersion: POLICY_VERSION,
  customer: { name: 'WHF disposable consent test', email: `consent-${requestId}@example.invalid`, address: '123 Test Street', city: 'Fresno', state: 'CA', zip: '93701' },
  payment: { method: 'cashapp', account: '$WHFTest' }, cart: [{ id: 'demo-sandia', quantity: 1 }],
};
const send = body => fetch(`${origin}/api/orders/`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(20000) });
let orderId;
try {
  for (const patch of [{ terms: false }, { terms: 'true' }, { terms: undefined }, { policyVersion: 'old' }, { policyVersion: undefined }]) {
    assert.equal((await send({ ...payload, ...patch })).status, 400);
  }
  const responses = await Promise.all([send(payload), send(payload)]);
  const receipts = await Promise.all(responses.map(async response => {
    const data = await response.json(); assert.equal(response.status, 201, JSON.stringify(data)); return data.confirmation;
  }));
  assert.deepEqual(receipts[0], receipts[1]);
  const saved = await db.from('whf_orders').select('id,created_at,locale,original', { count: 'exact' }).eq('request_id', requestId);
  assert.ifError(saved.error); assert.equal(saved.count, 1);
  const row = saved.data[0]; orderId = row.id;
  assert.equal(row.original.agreement.version, POLICY_VERSION);
  assert.equal(row.original.agreement.accepted, true);
  assert.match(row.original.agreement.statements.en, /21/);
  assert.match(row.original.agreement.statements.es, /21/);
  assert.ok(Number.isFinite(Date.parse(row.created_at)));
  const switched = await send({ ...payload, locale: 'es' });
  assert.equal(switched.status, 201); assert.deepEqual((await switched.json()).confirmation, receipts[0]);
  console.log('Consent checks passed: server rejection, saved version/text/time, concurrent retry, language-switch retry.');
} finally {
  if (!orderId) {
    const lookup = await db.from('whf_orders').select('id').eq('request_id', requestId).maybeSingle();
    assert.ifError(lookup.error); orderId = lookup.data?.id;
  }
  if (orderId) {
    assert.ifError((await db.from('whf_order_events').delete().eq('order_id', orderId)).error);
    assert.ifError((await db.from('whf_orders').delete().eq('id', orderId)).error);
  }
  console.log('Disposable consent-test order removed.');
}
