-- Run after the migration against the test-only scaffolding.
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
insert into public.workspaces(id,name) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','User one Physics');
insert into public.documents(id,workspace_id,title,filename,file_path,content) values
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','My notes','notes.pdf','11111111-1111-4111-8111-111111111111/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/source.pdf','{"draft":{"title":"My notes","blocks":[{"text":"Exact words","kind":"body"}]}}');
insert into storage.objects(bucket_id,name) values ('documents','11111111-1111-4111-8111-111111111111/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/source.pdf');
update public.documents set revision=1 where id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' and revision=0;
do $$begin
 if (select count(*) from public.documents where revision=1) <> 1 then raise exception 'Owner cannot save'; end if;
 if exists(select 1 from public.documents where id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' and revision=0) then raise exception 'Revision compare failed'; end if;
 if (select count(*) from storage.objects) <> 1 then raise exception 'Owner cannot read original file'; end if;
end$$;
set request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
do $$begin
 if exists(select 1 from public.workspaces) then raise exception 'Workspace leaked'; end if;
 if exists(select 1 from public.documents) then raise exception 'Document leaked'; end if;
 if exists(select 1 from storage.objects) then raise exception 'Original file leaked'; end if;
 update public.documents set title='Hacked';
 if found then raise exception 'Cross-user update allowed'; end if;
 delete from storage.objects;
 if found then raise exception 'Cross-user storage deletion allowed'; end if;
 begin
  insert into public.workspaces(owner_id,name) values ('11111111-1111-4111-8111-111111111111','Spoof');
  raise exception 'Owner spoof allowed';
 exception when insufficient_privilege then null; end;
 begin
  insert into public.documents(workspace_id,title,filename) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Cross workspace','bad.pdf');
  raise exception 'Cross-user workspace assignment allowed';
 exception when foreign_key_violation then null; end;
 begin
  insert into storage.objects(bucket_id,name) values ('documents','11111111-1111-4111-8111-111111111111/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/evil.pdf');
  raise exception 'Cross-user file upload allowed';
 exception when insufficient_privilege then null; end;
end$$;
insert into public.workspaces(name) values ('User two Biology');
reset role;
set role anon;
do $$begin
 begin perform count(*) from public.documents; raise exception 'Anonymous table access allowed';
 exception when insufficient_privilege then null; end;
end$$;
reset role;
select 'PASS: workspace, document, file ownership, spoofing, foreign keys, and revision isolation' as result;
