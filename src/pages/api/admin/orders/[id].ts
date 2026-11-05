import type { APIRoute } from 'astro';
import { buildOrderDetails, cleanText, validateWorkflow, OrderError, type Order } from '../../../../lib/orders';
import { requireAdmin, sameOrigin, readJSON, json, failure } from '../../../../lib/server/backend';
export const prerender = false;
export const PATCH: APIRoute = async context => {
  try {
    sameOrigin(context.request);
    const {db,user} = await requireAdmin(context);
    const raw = await readJSON(context.request);
    const {data: previous,error} = await db.from('whf_orders').select('*').eq('id',context.params.id || '').maybeSingle();
    if (error || !previous) throw new OrderError('Order not found.',404);
    if (!Number.isInteger(raw.version) || previous.version !== raw.version) throw new OrderError('This order changed. Reload it before saving.',409);
    const order = previous as Order;
    const details = buildOrderDetails(raw,order);
    const tracking = cleanText(raw.tracking,160); const carrier = cleanText(raw.carrier,100); const notes = cleanText(raw.notes,5000);
    validateWorkflow(raw.payment_status,raw.fulfillment_status,tracking);
    const customerChanged = Object.entries(details.customer).some(([key,value]) => value !== order.customer[key as keyof typeof order.customer]);
    const itemsChanged = details.items.length !== order.items.length || details.items.some((item,index) => item.id !== order.items[index].id || item.quantity !== order.items[index].quantity);
    if (['shipped','delivered'].includes(order.fulfillment_status) && (customerChanged || itemsChanged)) throw new OrderError('Shipped orders retain their delivery address and items.');
    const {data,error: updateError} = await db.rpc('whf_update_order',{p_id:order.id,p_version:raw.version,p_actor:user.id,p_details:{...details,payment_status:raw.payment_status,fulfillment_status:raw.fulfillment_status,tracking,carrier,notes}});
    if (updateError) throw new OrderError(updateError.message.includes('version_conflict') ? 'This order changed. Reload it before saving.' : 'Could not save the order.',updateError.message.includes('version_conflict') ? 409:503);
    return json({order:data});
  } catch(error) { return failure(error); }
};
