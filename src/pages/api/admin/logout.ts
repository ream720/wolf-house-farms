import type { APIRoute } from 'astro';
import { authClient, sameOrigin, failure } from '../../../lib/server/backend';
export const prerender = false;
export const POST: APIRoute = async context => {
  try { sameOrigin(context.request); await authClient(context).auth.signOut(); return context.redirect('/admin/login/',303); }
  catch(error) { return failure(error); }
};
