import type { APIRoute } from 'astro';
import { database, json, failure } from '../../lib/server/backend';
import { pollenOffer } from '../../data/catalog';
import { OrderError } from '../../lib/orders';
export const prerender = false;
export const GET: APIRoute = async () => {
  try {
    const {data,error} = await database().from('whf_inventory').select('stock,reserved').eq('offer_id',pollenOffer.id).single();
    if (error || !data) throw new OrderError('Pollen availability could not be checked.',503);
    return json({remaining:Math.max(0,data.stock-data.reserved)});
  } catch(error) { return failure(error); }
};
