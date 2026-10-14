begin;
alter table public.rosters add column if not exists deleted_at timestamptz;
drop policy if exists rosters_hide_deleted on public.rosters;
create policy rosters_hide_deleted on public.rosters as restrictive for select to authenticated using(deleted_at is null);

create or replace function public.classpulse_room_list()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
 perform public.classpulse_require_faculty();
 select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'name',r.name,'student_count',
  (select count(*) from public.roster_students rs where rs.roster_id=r.id and rs.teacher_id=auth.uid() and rs.withdrawn_at is null)) order by r.name),'[]'::jsonb)
 into result from public.rosters r where r.teacher_id=auth.uid() and r.deleted_at is null;
 return result;
end $$;

create or replace function public.classpulse_deleted_rooms()
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform public.classpulse_require_faculty();
 return coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'name',r.name,'deleted_at',r.deleted_at,'student_count',
  (select count(*) from public.roster_students rs where rs.roster_id=r.id and rs.teacher_id=auth.uid() and rs.withdrawn_at is null)) order by r.deleted_at desc)
 from public.rosters r where r.teacher_id=auth.uid() and r.deleted_at is not null),'[]'::jsonb);
end $$;

create or replace function public.classpulse_set_room_deleted(target_roster uuid,deleted boolean)
returns void language plpgsql security definer set search_path='' as $$
declare room_uuid uuid; roster public.rosters%rowtype;
begin
 perform public.classpulse_require_faculty();
 if deleted is null then raise exception 'Choose Delete or Restore.';end if;
 -- Match launch and rename: lock the room before its roster.
 select id into room_uuid from public.rooms where roster_id=target_roster and teacher_id=auth.uid() for update;
 select * into roster from public.rosters where id=target_roster and teacher_id=auth.uid() for update;
 if not found then raise exception 'This room is not available to your account.';end if;
 if deleted and exists(select 1 from public.quiz_sessions where room_id=room_uuid and teacher_id=auth.uid() and status<>'ended') then
  raise exception 'End the current activity in Live Results before deleting this room.';
 end if;
 update public.rosters set deleted_at=case when deleted then coalesce(deleted_at,now()) else null end where id=target_roster and teacher_id=auth.uid();
end $$;

-- Enforce deleted-room launch protection on the server, including stale clients.
create or replace function private.classpulse_session_open_room()
returns trigger language plpgsql security definer set search_path='' as $$
declare removed timestamptz;
begin
 perform 1 from public.rooms where id=new.room_id and teacher_id=new.teacher_id for update;
 select deleted_at into removed from public.rosters where id=new.roster_id and teacher_id=new.teacher_id for share;
 if not found or removed is not null then raise exception 'Restore this room in Rooms before launching an activity.';end if;
 return new;
end $$;
revoke all on function private.classpulse_session_open_room() from public,anon,authenticated;
drop trigger if exists classpulse_session_open_room on public.quiz_sessions;
create trigger classpulse_session_open_room before insert on public.quiz_sessions for each row execute function private.classpulse_session_open_room();

-- Extend existing checked functions without changing their validation or grants.
do $$ declare function_name text; definition text; prior text:='where id=target_roster and teacher_id=caller for update'; replacement text:='where id=target_roster and teacher_id=caller and deleted_at is null for update';
begin
 foreach function_name in array array['classpulse_import_roster','classpulse_add_students','classpulse_edit_student','classpulse_remove_student','classpulse_save_room'] loop
  select pg_get_functiondef(p.oid) into definition from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=function_name;
  if definition is null then raise exception 'Install the room student setup before room deletion.';end if;
  if strpos(definition,replacement)>0 then continue;end if;
  if strpos(definition,prior)=0 then raise exception 'Room function % changed; review its deletion guard before installing.',function_name;end if;
  execute replace(definition,prior,replacement);
 end loop;
end $$;
revoke all on function public.classpulse_deleted_rooms() from public,anon,authenticated;
revoke all on function public.classpulse_set_room_deleted(uuid,boolean) from public,anon,authenticated;
grant execute on function public.classpulse_deleted_rooms() to authenticated;
grant execute on function public.classpulse_set_room_deleted(uuid,boolean) to authenticated;
notify pgrst,'reload schema';
commit;
