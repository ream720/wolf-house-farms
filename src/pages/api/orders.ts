import type { APIRoute } from 'astro';
import { buildPublicOrderDetails, OrderError } from '../../lib/orders';
import { database, ordersEnabled, sameOrigin, readJSON, json, failure, rateKey } from '../../lib/server/backend';
export const prerender = false;
export const POST: APIRoute = async context => {
  try {
    sameOrigin(context.request);
    if (!ordersEnabled()) throw new OrderError('Reservations are not open yet. Please check back soon.',503);
    const raw = await readJSON(context.request);
    if (typeof raw.requestId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(raw.requestId)) throw new OrderError('Invalid submission reference.');
    const details = buildPublicOrderDetails(raw);
    const db = database();
    const {data,error} = await db.rpc('whf_submit_order',{p_request_id:raw.requestId,p_details:details,p_locale:raw.locale === 'es' ? 'es':'en',p_rate_key:await rateKey(context)});
    if (error) throw new OrderError(error.message.includes('rate_limit') ? 'Too many submissions. Please try again in an hour.' : 'Your order could not be saved. Please retry.',error.message.includes('rate_limit') ? 429:503);
    return json({confirmation:data},201);
  } catch(error) { return failure(error); }
};
