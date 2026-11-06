-- Apply to the existing WHF project before enabling cash by mail in source.
-- Retains older PayPal and Zelle orders and makes no changes to order data.
begin;
alter table public.whf_orders drop constraint whf_orders_payment_check;
alter table public.whf_orders add constraint whf_orders_payment_check check (coalesce(
  jsonb_typeof(payment) = 'object' and jsonb_typeof(payment->'method') = 'string'
  and jsonb_typeof(payment->'account') = 'string' and (
    (payment->>'method' = 'cash' and payment->>'account' = '') or
    (payment->>'method' in ('cashapp','paypal','zelle','apple_pay') and length(trim(payment->>'account')) between 2 and 254)
  ), false));
commit;
