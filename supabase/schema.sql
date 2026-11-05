-- WHF bootstrap schema. Apply once to the dedicated WHF project.
begin;
create table public.whf_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create table public.whf_orders (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique default ('WHF-' || upper(replace(gen_random_uuid()::text,'-',''))),
  request_id uuid not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1 check (version > 0),
  locale text not null check (locale in ('en','es')),
  customer jsonb not null,
  payment jsonb not null check (payment->>'method' in ('cashapp','paypal','zelle','apple_pay') and length(payment->>'account') between 2 and 254),
  items jsonb not null check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) > 0),
  subtotal integer not null check (subtotal >= 0),
  shipping integer not null check (shipping >= 0),
  total integer not null check (total = subtotal + shipping),
  payment_status text not null default 'pending' check (payment_status in ('pending','requested','paid','refunded')),
  fulfillment_status text not null default 'unfulfilled' check (fulfillment_status in ('unfulfilled','packing','shipped','delivered','cancelled')),
  tracking text not null default '',
  carrier text not null default '',
  notes text not null default '',
  original jsonb not null,
  check (fulfillment_status not in ('packing','shipped','delivered') or payment_status = 'paid'),
  check (fulfillment_status not in ('shipped','delivered') or length(trim(tracking)) > 0)
);
create index whf_orders_created_idx on public.whf_orders(created_at desc, id desc);
create index whf_orders_payment_idx on public.whf_orders(payment_status,created_at desc);
create index whf_orders_fulfillment_idx on public.whf_orders(fulfillment_status,created_at desc);
create table public.whf_order_events (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.whf_orders(id),
  actor uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  before_details jsonb,
  after_details jsonb not null
);
create index whf_order_events_order_idx on public.whf_order_events(order_id,created_at desc);
create index whf_order_events_actor_idx on public.whf_order_events(actor);
create table public.whf_request_limits (
  key text not null,
  window_start timestamptz not null,
  attempts integer not null,
  primary key (key,window_start)
);
alter table public.whf_admins enable row level security;
alter table public.whf_orders enable row level security;
alter table public.whf_order_events enable row level security;
alter table public.whf_request_limits enable row level security;
-- The browser never queries these tables. Every operation goes through the server.
revoke all on public.whf_admins,public.whf_orders,public.whf_order_events,public.whf_request_limits from public,anon,authenticated;
grant all on public.whf_admins,public.whf_orders,public.whf_order_events,public.whf_request_limits to service_role;
grant usage,select on sequence public.whf_order_events_id_seq to service_role;

create function public.whf_check_rate(p_key text, p_limit integer) returns boolean
language plpgsql security invoker set search_path = '' as $$
declare attempts_now integer;
begin
  delete from public.whf_request_limits where window_start < now() - interval '2 hours';
  insert into public.whf_request_limits(key,window_start,attempts) values(p_key,date_trunc('hour',now()),1)
  on conflict(key,window_start) do update set attempts = whf_request_limits.attempts + 1 returning attempts into attempts_now;
  return attempts_now <= p_limit;
end; $$;

create function public.whf_submit_order(p_request_id uuid,p_details jsonb,p_locale text,p_rate_key text) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare saved public.whf_orders;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,0));
  select * into saved from public.whf_orders where request_id = p_request_id;
  if found then
    if saved.original <> p_details then raise exception 'request_conflict'; end if;
  else
    if not public.whf_check_rate('order:' || p_rate_key,5) then raise exception 'rate_limit'; end if;
    insert into public.whf_orders(request_id,locale,customer,payment,items,subtotal,shipping,total,original)
    values(p_request_id,p_locale,p_details->'customer',p_details->'payment',p_details->'items',(p_details->>'subtotal')::integer,(p_details->>'shipping')::integer,(p_details->>'total')::integer,p_details)
    returning * into saved;
    insert into public.whf_order_events(order_id,after_details) values(saved.id,to_jsonb(saved) - 'request_id');
  end if;
  -- Always return the original receipt, including after an administrator edits the order.
  return jsonb_build_object('reference',saved.reference,'items',saved.original->'items','subtotal',saved.original->'subtotal','shipping',saved.original->'shipping','total',saved.original->'total','payment',saved.original->'payment');
end; $$;

create function public.whf_update_order(p_id uuid,p_version integer,p_actor uuid,p_details jsonb) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare previous public.whf_orders; saved public.whf_orders;
begin
  if not exists(select 1 from public.whf_admins where user_id = p_actor) then raise exception 'admin_required'; end if;
  select * into previous from public.whf_orders where id = p_id for update;
  if not found then raise exception 'order_not_found'; end if;
  if previous.version <> p_version then raise exception 'version_conflict'; end if;
  if previous.fulfillment_status in ('shipped','delivered') and (previous.customer <> p_details->'customer' or previous.items <> p_details->'items') then raise exception 'shipped_order_locked'; end if;
  update public.whf_orders set customer=p_details->'customer',payment=p_details->'payment',items=p_details->'items',
    subtotal=(p_details->>'subtotal')::integer,shipping=(p_details->>'shipping')::integer,total=(p_details->>'total')::integer,
    payment_status=p_details->>'payment_status',fulfillment_status=p_details->>'fulfillment_status',
    tracking=p_details->>'tracking',carrier=p_details->>'carrier',notes=p_details->>'notes',version=version+1,updated_at=now()
  where id=p_id returning * into saved;
  insert into public.whf_order_events(order_id,actor,before_details,after_details)
  values(p_id,p_actor,to_jsonb(previous) - 'request_id',to_jsonb(saved) - 'request_id');
  return to_jsonb(saved) - 'request_id' - 'original';
end; $$;
revoke all on function public.whf_check_rate(text,integer),public.whf_submit_order(uuid,jsonb,text,text),public.whf_update_order(uuid,integer,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.whf_check_rate(text,integer),public.whf_submit_order(uuid,jsonb,text,text),public.whf_update_order(uuid,integer,uuid,jsonb) to service_role;
commit;
