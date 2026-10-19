-- DISPOSABLE LOCAL POSTGRES ONLY. This file creates mock Supabase roles/auth.
\set ON_ERROR_STOP on
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
grant usage on schema public,auth to anon,authenticated,service_role;
grant select on auth.users to service_role;
insert into auth.users values ('00000000-0000-4000-8000-000000000001'),('00000000-0000-4000-8000-000000000002');
\ir ../supabase/migrations/202610170002_dodo_webhooks.sql
create function public.test_dodo_event(delivery text) returns jsonb language sql as $$select jsonb_build_object(
 'environment','test_mode','business_id','bus_test','webhook_id',delivery,'event_type','payment.succeeded',
 'event_at','2026-10-17T10:00:00Z','customer_id','cus_test','owner_id','00000000-0000-4000-8000-000000000001',
 'payment_id','pay_test','subscription_id',null,'product_ids',jsonb_build_array('pdt_test'),'total_amount',9900,'currency','INR',
 'previous_billing_date',null,'next_billing_date',null)$$;
set role service_role;
do $$
declare v jsonb;
begin
 if not public.record_dodo_webhook(public.test_dodo_event('msg_first')) then raise exception 'first delivery not inserted'; end if;
 if public.record_dodo_webhook(public.test_dodo_event('msg_first')) then raise exception 'duplicate accepted'; end if;
 if (select count(*) from public.dodo_payments)<>1 then raise exception 'duplicate resource row'; end if;
 if (select owner_id from public.dodo_payments where payment_id='pay_test')<>'00000000-0000-4000-8000-000000000001'::uuid then raise exception 'owner mapping failed'; end if;
 v:=public.test_dodo_event('msg_roll')||'{"payment_id":"pay_roll","total_amount":-1}'::jsonb;
 begin perform public.record_dodo_webhook(v);raise exception 'negative amount accepted';exception when check_violation then null;end;
 if exists(select 1 from public.dodo_webhook_events where webhook_id='msg_roll') then raise exception 'failed claim was committed'; end if;
 perform public.record_dodo_webhook(v||'{"total_amount":9900}'::jsonb);
 if not exists(select 1 from public.dodo_payments where payment_id='pay_roll') then raise exception 'retry not persisted';end if;
 perform public.record_dodo_webhook(public.test_dodo_event('msg_new')||'{"event_at":"2026-10-18T10:00:00Z","total_amount":10000}'::jsonb);
 perform public.record_dodo_webhook(public.test_dodo_event('msg_old')||'{"event_at":"2026-10-16T10:00:00Z","total_amount":100}'::jsonb);
 if (select total_amount from public.dodo_payments where payment_id='pay_test')<>10000 then raise exception 'out of order event overwrote payment';end if;
 perform public.record_dodo_webhook(public.test_dodo_event('msg_first')||'{"environment":"live_mode"}'::jsonb);
 if (select count(*) from public.dodo_payments where payment_id='pay_test')<>2 then raise exception 'environment isolation failed';end if;
 perform public.record_dodo_webhook(public.test_dodo_event('msg_unlinked')||'{"owner_id":"00000000-0000-4000-8000-000000000003","payment_id":"pay_unlinked"}'::jsonb);
 if (select owner_id from public.dodo_payments where payment_id='pay_unlinked') is not null then raise exception 'unknown owner linked';end if;
 begin
  perform public.record_dodo_webhook(public.test_dodo_event('msg_reassign')||'{"owner_id":"00000000-0000-4000-8000-000000000002"}'::jsonb);
  raise exception 'owner reassignment allowed';
 exception when raise_exception then if sqlerrm<>'Payment owner mismatch' then raise;end if;end;
 if exists(select 1 from public.dodo_webhook_events where webhook_id='msg_reassign') then raise exception 'owner mismatch claim committed';end if;
 v:=public.test_dodo_event('msg_sub')||'{"event_type":"subscription.active","payment_id":null,"subscription_id":"sub_test","previous_billing_date":"2026-10-17T10:00:00Z","next_billing_date":"2026-11-17T10:00:00Z"}'::jsonb;
 perform public.record_dodo_webhook(v);
 if public.record_dodo_webhook(v) then raise exception 'subscription duplicate accepted';end if;
 if (select count(*) from public.dodo_subscription_activations)<>1 then raise exception 'activation missing';end if;
 perform public.record_dodo_webhook(v||'{"webhook_id":"msg_sub_old","event_at":"2026-10-16T10:00:00Z","product_ids":["pdt_old"]}'::jsonb);
 if (select product_id from public.dodo_subscription_activations where subscription_id='sub_test')<>'pdt_test' then raise exception 'old subscription overwrote latest';end if;
 perform public.record_dodo_webhook(public.test_dodo_event('msg_other_owner')||'{"owner_id":"00000000-0000-4000-8000-000000000002","payment_id":"pay_other"}'::jsonb);
end $$;
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
do $$begin
 if exists(select 1 from public.dodo_payments where payment_id in ('pay_other','pay_unlinked')) then raise exception 'RLS leaked another account';end if;
 if not exists(select 1 from public.dodo_payments where payment_id='pay_test') then raise exception 'owner cannot read';end if;
 begin perform public.record_dodo_webhook(public.test_dodo_event('forged'));raise exception 'client can claim events';exception when insufficient_privilege then null;end;
 begin delete from public.dodo_payments;raise exception 'client can mutate billing';exception when insufficient_privilege then null;end;
 begin perform count(*) from public.dodo_webhook_events;raise exception 'client can read claims';exception when insufficient_privilege then null;end;
end $$;
reset role;
set role anon;
do $$begin
 begin perform count(*) from public.dodo_payments;raise exception 'anonymous billing read';exception when insufficient_privilege then null;end;
end $$;
reset role;
\echo Passed atomic deduplication, rollback/retry, payment and subscription records, ordering, environment isolation, account mapping and RLS tests.
