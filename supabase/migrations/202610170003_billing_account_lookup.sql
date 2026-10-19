begin;

-- record_dodo_webhook runs as service_role (security invoker) and checks
-- whether the checkout's account still exists. It needs only the ID column.
-- Do not grant this permission to anon or authenticated.
grant select (id) on table auth.users to service_role;

commit;
