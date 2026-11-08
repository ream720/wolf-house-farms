import { createClient } from '@supabase/supabase-js';
import { createServerClient, parseCookieHeader } from '@supabase/ssr';
import type { APIContext } from 'astro';
import { OrderError } from '../orders';

const env = (name: string) => process.env[name] || import.meta.env[name] || '';
export const ordersEnabled = () => env('ORDERS_ENABLED') === 'true';
export const configured = () => !!(env('SUPABASE_URL') && env('SUPABASE_PUBLISHABLE_KEY') && env('SUPABASE_SECRET_KEY'));
export function database() {
  if (!configured()) throw new OrderError('Order service is not configured yet.', 503);
  return createClient(env('SUPABASE_URL'), env('SUPABASE_SECRET_KEY'), { auth: { persistSession: false, autoRefreshToken: false } });
}
export function authClient(context: Pick<APIContext, 'request' | 'cookies'>) {
  if (!configured()) throw new OrderError('Order service is not configured yet.', 503);
  return createServerClient(env('SUPABASE_URL'), env('SUPABASE_PUBLISHABLE_KEY'), {
    cookieOptions: { path: '/', httpOnly: true, sameSite: 'lax', secure: new URL(context.request.url).protocol === 'https:' },
    cookies: {
      getAll: () => parseCookieHeader(context.request.headers.get('cookie') || '').map(c => ({name:c.name, value:c.value || ''})),
      setAll: (cookies) => cookies.forEach(({name,value,options}) => context.cookies.set(name,value,options)),
    },
  });
}
export async function requireAdmin(context: Pick<APIContext, 'request' | 'cookies'>) {
  const auth = authClient(context);
  const {data: {user}, error} = await auth.auth.getUser();
  if (error || !user) throw new OrderError('Please sign in again.', 401);
  const db = database();
  const {data, error: lookupError} = await db.from('whf_admins').select('user_id').eq('user_id',user.id).maybeSingle();
  if (lookupError) throw new OrderError('Admin access could not be checked.',503);
  if (!data) throw new OrderError('This account does not have Wolf House Genetics admin access.',403);
  return { user, db };
}
export function sameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  if (!origin || origin !== new URL(request.url).origin) throw new OrderError('Please submit from the Wolf House Genetics website.',403);
}
export async function readJSON(request: Request): Promise<Record<string, unknown>> {
  if (!request.headers.get('content-type')?.includes('application/json')) throw new OrderError('JSON is required.',415);
  // Bound chunked bodies too; Content-Length alone is not authoritative.
  const reader = request.body?.getReader();
  if (!reader) throw new OrderError('Missing request body.');
  const decoder = new TextDecoder(); let size = 0; let text = '';
  try {
    while (true) { const {done,value} = await reader.read(); if (done) break; size += value.byteLength; if (size > 20000) { await reader.cancel(); throw new OrderError('Request is too large.',413); } text += decoder.decode(value,{stream:true}); }
    const parsed = JSON.parse(text + decoder.decode());
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
    return parsed;
  } catch (error) { if (error instanceof OrderError) throw error; throw new OrderError('Invalid request body.'); }
}
export function json(body: unknown, status = 200) { return new Response(JSON.stringify(body), {status,headers:{'Content-Type':'application/json','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}}); }
export function failure(error: unknown) {
  if (error instanceof OrderError) return json({error:error.message},error.status);
  console.error('Wolf House Genetics operation failed');
  return json({error:'The order service is unavailable. Please try again.'},503);
}
export async function rateKey(context: APIContext) {
  const secret = env('ORDER_RATE_LIMIT_SECRET');
  if (secret.length < 32) throw new OrderError('Order service is not configured yet.',503);
  // clientAddress is supplied by the host adapter, never trust arbitrary forwarded headers.
  const { createHmac } = await import('node:crypto');
  return createHmac('sha256', secret).update(context.clientAddress).digest('hex');
}
