begin;
create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, owner_id)
);
create table public.documents (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  workspace_id uuid not null,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  filename text not null check (char_length(filename) between 1 and 255),
  file_path text,
  content jsonb not null default '{}'::jsonb check (jsonb_typeof(content) = 'object' and octet_length(content::text) <= 2000000),
  revision integer not null default 0 check (revision >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (workspace_id, owner_id) references public.workspaces(id, owner_id) on delete cascade,
  check (file_path is null or file_path like owner_id::text || '/' || workspace_id::text || '/' || id::text || '/%')
);
create index workspaces_owner on public.workspaces(owner_id);
create index documents_workspace on public.documents(workspace_id, updated_at desc);
create index documents_owner on public.documents(owner_id);
create function public.touch_updated_at() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end;
$$;
create trigger workspace_updated before update on public.workspaces for each row execute function public.touch_updated_at();
create trigger document_updated before update on public.documents for each row execute function public.touch_updated_at();
alter table public.workspaces enable row level security;
alter table public.documents enable row level security;
create policy workspaces_owner on public.workspaces for all to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy documents_owner on public.documents for all to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
revoke all on public.workspaces, public.documents from anon;
grant select, insert, update, delete on public.workspaces, public.documents to authenticated;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documents', 'documents', false, 15728640, array['application/pdf','application/vnd.openxmlformats-officedocument.presentationml.presentation'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
-- Objects live at user/workspace/document/source.pdf (or source.pptx).
-- All operations require both an owned document and its exact workspace path.
create policy document_files_read on storage.objects for select to authenticated using (
 bucket_id = 'documents' and (storage.foldername(name))[1] = (select auth.uid())::text
 and exists (select 1 from public.documents d where d.owner_id = (select auth.uid()) and d.id::text = (storage.foldername(name))[3] and d.workspace_id::text = (storage.foldername(name))[2])
);
create policy document_files_insert on storage.objects for insert to authenticated with check (
 bucket_id = 'documents' and (storage.foldername(name))[1] = (select auth.uid())::text
 and exists (select 1 from public.documents d where d.owner_id = (select auth.uid()) and d.id::text = (storage.foldername(name))[3] and d.workspace_id::text = (storage.foldername(name))[2])
);begin;
create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, owner_id)
);
create table public.documents (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  workspace_id uuid not null,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  filename text not null check (char_length(filename) between 1 and 255),
  file_path text,
  content jsonb not null default '{}'::jsonb check (jsonb_typeof(content) = 'object' and octet_length(content::text) <= 2000000),
  revision integer not null default 0 check (revision >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (workspace_id, owner_id) references public.workspaces(id, owner_id) on delete cascade,
  check (file_path is null or file_path like owner_id::text || '/' || workspace_id::text || '/' || id::text || '/%')
);
create index workspaces_owner on public.workspaces(owner_id);
create index documents_workspace on public.documents(workspace_id, updated_at desc);
create index documents_owner on public.documents(owner_id);
create function public.touch_updated_at() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end;
$$;
create trigger workspace_updated before update on public.workspaces for each row execute function public.touch_updated_at();
create trigger document_updated before update on public.documents for each row execute function public.touch_updated_at();
alter table public.workspaces enable row level security;
alter table public.documents enable row level security;
create policy workspaces_owner on public.workspaces for all to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy documents_owner on public.documents for all to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
revoke all on public.workspaces, public.documents from anon;
grant select, insert, update, delete on public.workspaces, public.documents to authenticated;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documents', 'documents', false, 15728640, array['application/pdf','application/vnd.openxmlformats-officedocument.presentationml.presentation'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
-- Objects live at user/workspace/document/source.pdf (or source.pptx).
-- All operations require both an owned document and its exact workspace path.
create policy document_files_read on storage.objects for select to authenticated using (
 bucket_id = 'documents' and (storage.foldername(name))[1] = (select auth.uid())::text
 and exists (select 1 from public.documents d where d.owner_id = (select auth.uid()) and d.id::text = (storage.foldername(name))[3] and d.workspace_id::text = (storage.foldername(name))[2])
);
create policy document_files_insert on storage.objects for insert to authenticated with check (
 bucket_id = 'documents' and (storage.foldername(name))[1] = (select auth.uid())::text
 and exists (select 1 from public.documents d where d.owner_id = (select auth.uid()) and d.id::text = (storage.foldername(name))[3] and d.workspace_id::text = (storage.foldername(name))[2])
);
create policy document_files_delete on storage.objects for delete to authenticated using (
 bucket_id = 'documents' and (storage.foldername(name))[1] = (select auth.uid())::text
 and exists (select 1 from public.documents d where d.owner_id = (select auth.uid()) and d.id::text = (storage.foldername(name))[3] and d.workspace_id::text = (storage.foldername(name))[2])
);
commit;

create policy document_files_delete on storage.objects for delete to authenticated using (
 bucket_id = 'documents' and (storage.foldername(name))[1] = (select auth.uid())::text
 and exists (select 1 from public.documents d where d.owner_id = (select auth.uid()) and d.id::text = (storage.foldername(name))[3] and d.workspace_id::text = (storage.foldername(name))[2])
);
commit;
