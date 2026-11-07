-- Disposable fixtures and all counter changes are rolled back.
begin;
set local role service_role;
do $test$
declare
  first_id uuid := gen_random_uuid(); second_id uuid := gen_random_uuid(); third_id uuid := gen_random_uuid();
  receipt jsonb; details jsonb; saved public.whf_orders; actor_id uuid; r integer; baseline integer;
begin
  select reserved into baseline from public.whf_inventory where offer_id='pollen-plantz-2ml' for update;
  -- Test against four additional units without disturbing existing reservations.
  update public.whf_inventory set stock=baseline+4 where offer_id='pollen-plantz-2ml';
  details := jsonb_build_object(
    'customer',jsonb_build_object('name','WHF inventory verification','email','inventory-test@example.invalid','address','123 Test Street','city','Fresno','state','CA','zip','93701'),
    'payment',jsonb_build_object('method','cash','account',''),
    'items',jsonb_build_array(jsonb_build_object('id','pollen-plantz-2ml','strain','plantz-pollen','name','Plantz pollen','pack','2 mL pollen per unit','quantity',2,'unitCents',20000)),
    'subtotal',40000,'shipping',3000,'total',43000);
  receipt := public.whf_submit_order(first_id,details,'en',first_id::text);
  if (receipt->>'shipping')::integer <> 3000 then raise exception 'expedited_receipt_failed'; end if;
  if receipt <> public.whf_submit_order(first_id,details,'en',first_id::text) then raise exception 'retry_receipt_failed'; end if;
  select reserved into r from public.whf_inventory where offer_id='pollen-plantz-2ml';
  if r <> baseline+2 then raise exception 'retry_allocated_twice'; end if;
  perform public.whf_submit_order(second_id,details,'es',second_id::text);
  begin
    perform public.whf_submit_order(third_id,jsonb_set(details,'{items,0,quantity}','1'),'en',third_id::text);
    raise exception 'oversold';
  exception when raise_exception then
    if SQLERRM <> 'stock_unavailable' then raise; end if;
  end;
  -- Verify admin quantity changes, cancellation, and reactivation use the same allocation.
  select * into saved from public.whf_orders where request_id=first_id;
  select user_id into actor_id from public.whf_admins limit 1;
  if actor_id is null then raise exception 'verification_requires_existing_admin'; end if;
  details := to_jsonb(saved) || jsonb_build_object('items',jsonb_set(saved.items,'{0,quantity}','1'),'subtotal',20000,'total',23000);
  perform public.whf_update_order(saved.id,saved.version,actor_id,details);
  select reserved into r from public.whf_inventory where offer_id='pollen-plantz-2ml';
  if r <> baseline+3 then raise exception 'edit_did_not_release_stock'; end if;
  perform public.whf_submit_order(third_id,jsonb_set(details,'{items,0,quantity}','1'),'en',third_id::text);
  select * into saved from public.whf_orders where request_id=first_id;
  details := to_jsonb(saved) || jsonb_build_object('fulfillment_status','cancelled');
  perform public.whf_update_order(saved.id,saved.version,actor_id,details);
  select reserved into r from public.whf_inventory where offer_id='pollen-plantz-2ml';
  if r <> baseline+3 then raise exception 'cancellation_did_not_release_stock'; end if;
  select * into saved from public.whf_orders where request_id=first_id;
  details := to_jsonb(saved) || jsonb_build_object('fulfillment_status','unfulfilled','items',jsonb_set(saved.items,'{0,quantity}','2'),'subtotal',40000,'total',43000);
  begin
    perform public.whf_update_order(saved.id,saved.version,actor_id,details);
    raise exception 'reactivation_oversold';
  exception when raise_exception then
    if SQLERRM <> 'stock_unavailable' then raise; end if;
  end;
  select reserved into r from public.whf_inventory where offer_id='pollen-plantz-2ml';
  if r <> baseline+3 then raise exception 'failed_update_changed_counter'; end if;
  -- Deleting test orders releases their allocations too (production keeps history).
  delete from public.whf_order_events where order_id in (select id from public.whf_orders where request_id in (first_id,second_id,third_id));
  delete from public.whf_orders where request_id in (first_id,second_id,third_id);
  select reserved into r from public.whf_inventory where offer_id='pollen-plantz-2ml';
  if r <> baseline then raise exception 'delete_did_not_release_stock'; end if;
end; $test$;
rollback;
