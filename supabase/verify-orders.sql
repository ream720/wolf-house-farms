-- Disposable fixtures; every change, including the auth fixture, is rolled back.
begin;
do $$
<<verify_orders>>
declare
  actor_id uuid := gen_random_uuid(); request_id uuid := gen_random_uuid();
  receipt jsonb; retry jsonb; details jsonb; updated jsonb; order_id uuid; caught boolean;
begin
  insert into auth.users(id) values(actor_id);
  insert into public.whf_admins(user_id) values(actor_id);
  details := '{"customer":{"name":"WHF Test","email":"test@example.com","address":"123 Test St","city":"Fresno","state":"CA","zip":"93701"},"payment":{"method":"cashapp","account":"$WHFTest"},"items":[{"id":"test-fixture","strain":"test","name":"Test pack","pack":"10 seeds per pack","quantity":1,"unitCents":6000}],"subtotal":6000,"shipping":1000,"total":7000}'::jsonb;
  receipt := public.whf_submit_order(request_id,details,'en','whf-verification');
  retry := public.whf_submit_order(request_id,details,'es','whf-verification');
  if receipt <> retry or (select count(*) from public.whf_orders where whf_orders.request_id=verify_orders.request_id) <> 1 then raise exception 'duplicate protection failed'; end if;
  select id into order_id from public.whf_orders where whf_orders.request_id=verify_orders.request_id;
  caught := false;
  begin
    perform public.whf_submit_order(request_id,jsonb_set(details,'{total}','1'),'en','whf-verification');
  exception when others then if sqlerrm = 'request_conflict' then caught := true; else raise; end if; end;
  if not caught then raise exception 'idempotency payload conflict accepted'; end if;
  details := details || '{"payment_status":"paid","fulfillment_status":"packing","tracking":"","carrier":"","notes":"Verification"}'::jsonb;
  updated := public.whf_update_order(order_id,1,actor_id,details);
  if updated->>'version' <> '2' then raise exception 'edit failed'; end if;
  if (select count(*) from public.whf_order_events where whf_order_events.order_id=verify_orders.order_id) <> 2 then raise exception 'audit missing'; end if;
  caught := false;
  begin perform public.whf_update_order(order_id,1,actor_id,details);
  exception when others then if sqlerrm='version_conflict' then caught:=true; else raise; end if; end;
  if not caught then raise exception 'stale edit accepted'; end if;
  caught := false;
  begin perform public.whf_update_order(order_id,2,gen_random_uuid(),details);
  exception when others then if sqlerrm='admin_required' then caught:=true; else raise; end if; end;
  if not caught then raise exception 'non-admin edit accepted'; end if;
  caught := false;
  begin perform public.whf_update_order(order_id,2,actor_id,details || '{"fulfillment_status":"shipped"}'::jsonb);
  exception when check_violation then caught:=true; end;
  if not caught then raise exception 'shipping without tracking accepted'; end if;
  updated := public.whf_update_order(order_id,2,actor_id,details || '{"fulfillment_status":"shipped","tracking":"TEST123"}'::jsonb);
  caught := false;
  begin perform public.whf_update_order(order_id,3,actor_id,jsonb_set(details,'{customer,name}','"Changed"'));
  exception when others then if sqlerrm='shipped_order_locked' then caught:=true; else raise; end if; end;
  if not caught then raise exception 'shipped address edit accepted'; end if;
  if public.whf_submit_order(request_id,(select original from public.whf_orders where id=order_id),'en','whf-verification') <> receipt then raise exception 'original receipt changed after edit'; end if;
  if has_table_privilege('anon','public.whf_orders','select') or has_table_privilege('authenticated','public.whf_orders','select') then raise exception 'customer data exposed'; end if;
  if has_function_privilege('anon','public.whf_submit_order(uuid,jsonb,text,text)','execute') or has_function_privilege('authenticated','public.whf_update_order(uuid,integer,uuid,jsonb)','execute') then raise exception 'privileged functions exposed'; end if;
  for i in 1..5 loop if not public.whf_check_rate('test-limit',5) then raise exception 'rate limited too early'; end if; end loop;
  if public.whf_check_rate('test-limit',5) then raise exception 'rate limit missing'; end if;
end $$;
rollback;
