import test from 'node:test';
import assert from 'node:assert/strict';
import { NodeApp } from 'astro/app/node';
import type { IncomingMessage } from 'node:http';
import config from '../astro.config.mjs';

const host = 'wolf-house-farms.vercel.app';
function proxyRequest(forwardedHost = host, origin = `https://${host}`) {
  return NodeApp.createRequest({
    url: '/admin/login/', method: 'POST', socket: {},
    headers: {
      host: 'localhost', 'x-forwarded-host': forwardedHost,
      'x-forwarded-proto': 'https', origin,
      'content-type': 'application/x-www-form-urlencoded',
    },
  } as unknown as IncomingMessage, {skipBody: true, allowedDomains: config.security!.allowedDomains});
}
test('Vercel forwarded requests retain the public HTTPS origin for login, API checks and cookies',()=>{
  assert.equal(config.security?.checkOrigin,true);
  const request = proxyRequest();
  assert.equal(new URL(request.url).origin,request.headers.get('origin'));
  assert.equal(new URL(request.url).protocol,'https:');
});
test('a different browser origin still fails the same-origin comparison',()=>{
  const request = proxyRequest(host,'https://other.example');
  assert.notEqual(new URL(request.url).origin,request.headers.get('origin'));
});
test('unapproved forwarded hosts cannot replace the request URL',()=>{
  for (const untrusted of ['other.vercel.app','wolf-house-farms.vercel.app.other.example','other.example']) {
    const request = proxyRequest(untrusted,`https://${untrusted}`);
    assert.equal(new URL(request.url).hostname,'localhost');
    assert.notEqual(new URL(request.url).origin,request.headers.get('origin'));
  }
});
