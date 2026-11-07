-- Apply to an existing WHF backend before deploying the pollen offer.
-- Reservations, including unpaid ones, hold stock until cancelled or removed.
create table public.whf_inventory (
  offer_id text primary key,
  stock integer not null check (stock >= 0),
  reserved integer not null default 0 check (reserved >= 0 and reserved <= stock)
);
alter table public.whf_inventory enable row level security;
revoke all on public.whf_inventory from public,anon,authenticated;
grant select,insert,update,delete on public.whf_inventory to service_role;

-- Prevent order writes while seeding the counter and installing the trigger.
lock table public.whf_orders in share row exclusive mode;
insert into public.whf_inventory(offer_id,stock,reserved)
select 'pollen-plantz-2ml',4,coalesce(sum((i->>'quantity')::integer),0)
from public.whf_orders o cross join lateral jsonb_array_elements(o.items) i
where o.fulfillment_status <> 'cancelled' and i->>'id' = 'pollen-plantz-2ml';

create function public.whf_allocate_pollen() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare old_units integer := 0; new_units integer := 0;
begin
  if TG_OP <> 'INSERT' then
    if OLD.fulfillment_status <> 'cancelled' then
      select coalesce(sum((i->>'quantity')::integer),0) into old_units
      from jsonb_array_elements(OLD.items) i where i->>'id' = 'pollen-plantz-2ml';
    end if;
  end if;
  if TG_OP <> 'DELETE' then
    if NEW.fulfillment_status <> 'cancelled' then
      select coalesce(sum((i->>'quantity')::integer),0) into new_units
      from jsonb_array_elements(NEW.items) i where i->>'id' = 'pollen-plantz-2ml';
    end if;
  end if;
  if old_units <> 0 or new_units <> 0 then
    -- This conditional update takes a row lock. Concurrent reservations wait and
    -- recheck the latest counter, so the fourth unit cannot be allocated twice.
    update public.whf_inventory set reserved = reserved + new_units - old_units
    where offer_id = 'pollen-plantz-2ml'
      and reserved + new_units - old_units between 0 and stock;
    if not found then raise exception 'stock_unavailable'; end if;
  end if;
  if TG_OP = 'DELETE' then return OLD; end if;
  return NEW;
end; $$;
revoke all on function public.whf_allocate_pollen() from public,anon,authenticated;
grant execute on function public.whf_allocate_pollen() to service_role;
create trigger whf_allocate_pollen
before insert or update of items,fulfillment_status or delete on public.whf_orders
for each row execute function public.whf_allocate_pollen();
