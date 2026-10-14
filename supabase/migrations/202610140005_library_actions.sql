begin;
alter table public.quizzes add column if not exists deleted_at timestamptz;
alter table public.quizzes add column if not exists deletion_batch uuid;
alter table public.quiz_folders add column if not exists deleted_at timestamptz;
alter table public.quiz_folders add column if not exists deletion_batch uuid;
drop policy if exists quizzes_hide_deleted on public.quizzes;
create policy quizzes_hide_deleted on public.quizzes as restrictive for select to authenticated using(deleted_at is null);
drop policy if exists folders_hide_deleted on public.quiz_folders;
create policy folders_hide_deleted on public.quiz_folders as restrictive for select to authenticated using(deleted_at is null);

create or replace function public.classpulse_deleted_library()
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform public.classpulse_require_faculty();
 return jsonb_build_object('folders',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'parent_id',parent_id,'deleted_at',deleted_at,'deletion_batch',deletion_batch)) from public.quiz_folders where teacher_id=auth.uid() and deleted_at is not null),'[]'::jsonb),
 'quizzes',coalesce((select jsonb_agg(jsonb_build_object('id',id,'title',title,'folder_id',folder_id,'deleted_at',deleted_at,'deletion_batch',deletion_batch)) from public.quizzes where teacher_id=auth.uid() and source_kind='library' and deleted_at is not null),'[]'::jsonb));
end $$;

create or replace function public.classpulse_library_action(item_kind text,target_item uuid,action_name text,new_name text default null,destination uuid default null,expected_name text default null)
returns void language plpgsql security definer set search_path='' as $$
declare caller uuid:=auth.uid();q public.quizzes%rowtype;f public.quiz_folders%rowtype;doc jsonb;tree uuid[];batch uuid;candidate uuid;
begin
 perform public.classpulse_require_faculty();
 if item_kind not in('quiz','folder') or item_kind is null or action_name not in('rename','move','delete','restore') or action_name is null then raise exception 'Choose a valid library action.';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(caller::text,1));
 if item_kind='quiz' then
  select * into q from public.quizzes where id=target_item and teacher_id=caller and source_kind='library' for update;
  if not found then raise exception 'This quiz is not available to your account.';end if;
  if action_name<>'restore' and q.deleted_at is not null then raise exception 'Restore this quiz before editing it.';end if;
  if expected_name is not null and q.title<>expected_name then raise exception 'The quiz changed. Refresh the library and try again.';end if;
 else
  select * into f from public.quiz_folders where id=target_item and teacher_id=caller for update;
  if not found then raise exception 'This folder is not available to your account.';end if;
  if action_name<>'restore' and f.deleted_at is not null then raise exception 'Restore this folder before editing it.';end if;
  if expected_name is not null and f.name<>expected_name then raise exception 'The folder changed. Refresh the library and try again.';end if;
 end if;
 if action_name='rename' then
  if new_name is null or length(btrim(new_name)) not between 1 and (case when item_kind='quiz' then 200 else 120 end) then raise exception 'Enter a valid name.';end if;
  if item_kind='quiz' then
   doc:=public.classpulse_get_quiz(target_item);
   perform public.classpulse_save_quiz(target_item,q.folder_id,btrim(new_name),doc->'questions',(doc->>'version_id')::uuid,(doc->>'revision')::integer);
  else update public.quiz_folders set name=btrim(new_name) where id=target_item and teacher_id=caller;end if;
 elsif action_name='move' then
  if destination is not null and not exists(select 1 from public.quiz_folders where id=destination and teacher_id=caller and deleted_at is null) then raise exception 'Choose one of your available folders.';end if;
  if item_kind='folder' then
   with recursive children as (select id from public.quiz_folders where id=target_item and teacher_id=caller union all select x.id from public.quiz_folders x join children c on x.parent_id=c.id where x.teacher_id=caller) select array_agg(id) into tree from children;
   if destination=any(tree) then raise exception 'A folder cannot be moved into itself or one of its subfolders.';end if;
   update public.quiz_folders set parent_id=destination where id=target_item and teacher_id=caller;
  else doc:=public.classpulse_get_quiz(target_item);perform public.classpulse_save_quiz(target_item,destination,q.title,doc->'questions',(doc->>'version_id')::uuid,(doc->>'revision')::integer);end if;
 elsif action_name='delete' then
  batch:=target_item;
  if item_kind='folder' then
   with recursive children as (select id from public.quiz_folders where id=target_item and teacher_id=caller and deleted_at is null union all select x.id from public.quiz_folders x join children c on x.parent_id=c.id where x.teacher_id=caller and x.deleted_at is null) select array_agg(id) into tree from children;
   -- Lock affected quizzes in a stable order to serialize with launches.
   perform 1 from public.quizzes where teacher_id=caller and folder_id=any(tree) and deleted_at is null order by id for update;
  end if;
  if exists(select 1 from public.quiz_sessions s join public.quizzes x on x.id=s.quiz_id where s.teacher_id=caller and s.status<>'ended' and x.deleted_at is null and (case when item_kind='quiz' then x.id=target_item else x.folder_id=any(tree) end)) then raise exception 'End the active quiz in Live Results before deleting it or its folder.';end if;
  update public.quizzes set deleted_at=now(),deletion_batch=batch where teacher_id=caller and deleted_at is null and (case when item_kind='quiz' then id=target_item else folder_id=any(tree) end);
  if item_kind='folder' then update public.quiz_folders set deleted_at=now(),deletion_batch=batch where teacher_id=caller and id=any(tree) and deleted_at is null;end if;
 else
  if item_kind='quiz' then
   if q.deleted_at is null then return;end if;
   if q.folder_id is not null and exists(select 1 from public.quiz_folders where id=q.folder_id and teacher_id=caller and deleted_at is not null) then raise exception 'Restore the containing folder first.';end if;
   update public.quizzes set deleted_at=null,deletion_batch=null where id=target_item and teacher_id=caller;
  else
   if f.deleted_at is null then return;end if;
   if f.deletion_batch<>f.id then raise exception 'Restore the parent folder that was deleted with this folder.';end if;
   if f.parent_id is not null and exists(select 1 from public.quiz_folders where id=f.parent_id and teacher_id=caller and deleted_at is not null) then raise exception 'Restore the containing folder first.';end if;
   update public.quiz_folders set deleted_at=null,deletion_batch=null where teacher_id=caller and deletion_batch=f.id;
   update public.quizzes set deleted_at=null,deletion_batch=null where teacher_id=caller and deletion_batch=f.id;
  end if;
 end if;
end $$;

-- Folder inserts/moves and quiz saves share a teacher lock, so a tree cannot
-- gain new children partway through a delete or move operation.
create or replace function private.classpulse_library_parent_guard()
returns trigger language plpgsql security definer set search_path='' as $$
declare parent uuid;
begin
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.teacher_id::text,1));
 if tg_table_name='quiz_folders' then parent:=new.parent_id;else parent:=new.folder_id;end if;
 if parent is not null and not exists(select 1 from public.quiz_folders where id=parent and teacher_id=new.teacher_id and deleted_at is null) then raise exception 'Restore the containing folder before adding or moving items into it.';end if;
 return new;
end $$;
revoke all on function private.classpulse_library_parent_guard() from public,anon,authenticated;
drop trigger if exists classpulse_folder_parent_guard on public.quiz_folders;
create trigger classpulse_folder_parent_guard before insert or update of parent_id on public.quiz_folders for each row execute function private.classpulse_library_parent_guard();
drop trigger if exists classpulse_quiz_parent_guard on public.quizzes;
create trigger classpulse_quiz_parent_guard before insert or update of folder_id on public.quizzes for each row execute function private.classpulse_library_parent_guard();

create or replace function private.classpulse_session_quiz_available()
returns trigger language plpgsql security definer set search_path='' as $$
declare removed timestamptz;
begin
 select deleted_at into removed from public.quizzes where id=new.quiz_id and teacher_id=new.teacher_id for update;
 if not found or removed is not null then raise exception 'Restore this quiz in Library before launching it.';end if;
 return new;
end $$;
revoke all on function private.classpulse_session_quiz_available() from public,anon,authenticated;
drop trigger if exists classpulse_session_quiz_available on public.quiz_sessions;
create trigger classpulse_session_quiz_available before insert on public.quiz_sessions for each row execute function private.classpulse_session_quiz_available();

do $$ declare n text;definition text;marker text:='perform public.classpulse_require_faculty();';
begin
 foreach n in array array['classpulse_get_quiz','classpulse_save_quiz'] loop
  select pg_get_functiondef(p.oid) into definition from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace where ns.nspname='public' and p.proname=n;
  if strpos(definition,'deleted_at is null')=0 then
   definition:=replace(definition,'where id=target_quiz and teacher_id=caller','where id=target_quiz and teacher_id=caller and deleted_at is null');
   if n='classpulse_save_quiz' then
    definition:=replace(definition,'where id=target_folder and teacher_id=caller','where id=target_folder and teacher_id=caller and deleted_at is null');
    if strpos(definition,marker)=0 then raise exception 'Faculty access setup is required before library actions.';end if;
    definition:=replace(definition,marker,marker||' perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(caller::text,1));');
   end if;
   execute definition;
  end if;
 end loop;
end $$;
revoke all on function public.classpulse_deleted_library() from public,anon,authenticated;
revoke all on function public.classpulse_library_action(text,uuid,text,text,uuid,text) from public,anon,authenticated;
grant execute on function public.classpulse_deleted_library() to authenticated;
grant execute on function public.classpulse_library_action(text,uuid,text,text,uuid,text) to authenticated;
notify pgrst,'reload schema';
commit;



