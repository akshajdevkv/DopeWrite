begin;

-- Service-only configuration: populate below before enabling these policies.
create table if not exists public.billing_access_settings (
 singleton boolean primary key default true check (singleton),
 environment text not null check (environment in ('test_mode','live_mode')),
 product_id text not null check (length(product_id)>0)
);
alter table public.billing_access_settings enable row level security;
revoke all on public.billing_access_settings from public, anon, authenticated;
grant all on public.billing_access_settings to service_role;

-- Current development project. For production use the live environment/product.
insert into public.billing_access_settings(singleton,environment,product_id)
values(true,'test_mode','pdt_0NpvabhFXqP8knbQvtUjk')
on conflict(singleton) do nothing;

create or replace function public.has_paid_workspace_access() returns boolean
language sql stable security definer set search_path = '' as $$
 select exists(
  select 1 from public.dodo_payments p
  join public.billing_access_settings c on c.singleton
   and p.environment=c.environment and p.product_ids @> array[c.product_id]
  where p.owner_id=(select auth.uid()) and p.currency='INR'
   and p.total_amount>=9900 and p.subscription_id is null
 );
$$;
revoke all on function public.has_paid_workspace_access() from public,anon;
grant execute on function public.has_paid_workspace_access() to authenticated;

-- Restrictive policies AND with the existing owner policies; ownership is retained.
create policy workspaces_paid_access on public.workspaces as restrictive
 for all to authenticated
 using ((select public.has_paid_workspace_access()))
 with check ((select public.has_paid_workspace_access()));
create policy documents_paid_access on public.documents as restrictive
 for all to authenticated
 using ((select public.has_paid_workspace_access()))
 with check ((select public.has_paid_workspace_access()));
create policy document_files_paid_access on storage.objects as restrictive
 for all to authenticated
 using (bucket_id<>'documents' or (select public.has_paid_workspace_access()))
 with check (bucket_id<>'documents' or (select public.has_paid_workspace_access()));

commit;
