begin;

-- A delivery is acknowledged only after its claim AND resource write commit.
create table public.dodo_webhook_events (
 environment text not null check (environment in ('test_mode','live_mode')),
 business_id text not null,
 webhook_id text not null,
 event_type text not null check (event_type in ('payment.succeeded','subscription.active')),
 event_at timestamptz not null,
 processed_at timestamptz not null default now(),
 primary key (environment,business_id,webhook_id)
);
create table public.dodo_payments (
 environment text not null check (environment in ('test_mode','live_mode')),
 business_id text not null,
 payment_id text not null,
 customer_id text not null,
 owner_id uuid references auth.users(id) on delete set null,
 subscription_id text,
 product_ids text[] not null default '{}',
 total_amount bigint not null check (total_amount>=0),
 currency text not null check (currency ~ '^[A-Z]{3}$'),
 succeeded_at timestamptz not null,
 last_event_at timestamptz not null,
 primary key (environment,business_id,payment_id)
);
-- Activation history, NOT an assertion that a subscription remains active forever.
-- Add cancellation/expiry/refund handling before using billing records as a paywall.
create table public.dodo_subscription_activations (
 environment text not null check (environment in ('test_mode','live_mode')),
 business_id text not null,
 subscription_id text not null,
 customer_id text not null,
 owner_id uuid references auth.users(id) on delete set null,
 product_id text not null,
 activated_at timestamptz not null,
 previous_billing_date timestamptz,
 next_billing_date timestamptz,
 last_event_at timestamptz not null,
 primary key (environment,business_id,subscription_id)
);
create index dodo_payments_owner on public.dodo_payments(owner_id);
create index dodo_activations_owner on public.dodo_subscription_activations(owner_id);
alter table public.dodo_webhook_events enable row level security;
alter table public.dodo_payments enable row level security;
alter table public.dodo_subscription_activations enable row level security;
revoke all on public.dodo_webhook_events, public.dodo_payments, public.dodo_subscription_activations from public,anon,authenticated;
grant all on public.dodo_webhook_events, public.dodo_payments, public.dodo_subscription_activations to service_role;
grant select on public.dodo_payments, public.dodo_subscription_activations to authenticated;
create policy dodo_payments_owner_read on public.dodo_payments for select to authenticated using (owner_id=(select auth.uid()));
create policy dodo_activations_owner_read on public.dodo_subscription_activations for select to authenticated using (owner_id=(select auth.uid()));

create function public.record_dodo_webhook(p_event jsonb) returns boolean
language plpgsql security invoker set search_path = '' as $$
declare
 v_environment text:=p_event->>'environment';
 v_business text:=p_event->>'business_id';
 v_type text:=p_event->>'event_type';
 v_time timestamptz:=(p_event->>'event_at')::timestamptz;
 v_owner uuid;
 v_products text[];
begin
 if v_type is null or v_type not in ('payment.succeeded','subscription.active') then
  raise exception 'Unsupported Dodo event';
 end if;
 insert into public.dodo_webhook_events(environment,business_id,webhook_id,event_type,event_at)
 values(v_environment,v_business,p_event->>'webhook_id',v_type,v_time)
 on conflict do nothing;
 if not found then return false; end if;

 -- Server-created checkout metadata supplies the Supabase UUID. Never match email.
 -- Missing/deleted accounts are kept unlinked so a legitimate payment is not lost.
 select u.id into v_owner from auth.users u where u.id=(p_event->>'owner_id')::uuid;
 select coalesce(array_agg(value),'{}'::text[]) into v_products
 from jsonb_array_elements_text(p_event->'product_ids');

 if v_type='payment.succeeded' then
  if p_event->>'payment_id' is null then raise exception 'Missing payment ID'; end if;
  if exists(select 1 from public.dodo_payments p where p.environment=v_environment and p.business_id=v_business and p.payment_id=p_event->>'payment_id' and p.owner_id is not null and v_owner is not null and p.owner_id<>v_owner) then
   raise exception 'Payment owner mismatch';
  end if;
  insert into public.dodo_payments as p(environment,business_id,payment_id,customer_id,owner_id,subscription_id,product_ids,total_amount,currency,succeeded_at,last_event_at)
  values(v_environment,v_business,p_event->>'payment_id',p_event->>'customer_id',v_owner,p_event->>'subscription_id',v_products,(p_event->>'total_amount')::bigint,p_event->>'currency',v_time,v_time)
  on conflict (environment,business_id,payment_id) do update set
   customer_id=excluded.customer_id,owner_id=coalesce(excluded.owner_id,p.owner_id),subscription_id=excluded.subscription_id,
   product_ids=excluded.product_ids,total_amount=excluded.total_amount,currency=excluded.currency,last_event_at=excluded.last_event_at
  where excluded.last_event_at>=p.last_event_at;
 else
  if p_event->>'subscription_id' is null or cardinality(v_products)<>1 then raise exception 'Invalid subscription'; end if;
  if exists(select 1 from public.dodo_subscription_activations s where s.environment=v_environment and s.business_id=v_business and s.subscription_id=p_event->>'subscription_id' and s.owner_id is not null and v_owner is not null and s.owner_id<>v_owner) then
   raise exception 'Subscription owner mismatch';
  end if;
  insert into public.dodo_subscription_activations as s(environment,business_id,subscription_id,customer_id,owner_id,product_id,activated_at,previous_billing_date,next_billing_date,last_event_at)
  values(v_environment,v_business,p_event->>'subscription_id',p_event->>'customer_id',v_owner,v_products[1],v_time,(p_event->>'previous_billing_date')::timestamptz,(p_event->>'next_billing_date')::timestamptz,v_time)
  on conflict (environment,business_id,subscription_id) do update set
   customer_id=excluded.customer_id,owner_id=coalesce(excluded.owner_id,s.owner_id),product_id=excluded.product_id,
   previous_billing_date=excluded.previous_billing_date,next_billing_date=excluded.next_billing_date,last_event_at=excluded.last_event_at
  where excluded.last_event_at>=s.last_event_at;
 end if;
 return true;
end;
$$;
revoke all on function public.record_dodo_webhook(jsonb) from public,anon,authenticated;
grant execute on function public.record_dodo_webhook(jsonb) to service_role;
commit;
