begin;
-- Keep the existing room UUID: historical sessions and responses retain their relationships.
update public.rooms r set room_name='CF2026'
from public.rosters c where c.id=r.roster_id and c.teacher_id=r.teacher_id
and upper(c.name)='CF2026' and r.room_name='IMTY1A';

create function public.classpulse_save_room(target_roster uuid,desired_name text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare caller uuid:=auth.uid(); label text:=upper(trim(desired_name)); c public.rosters%rowtype; r public.rooms%rowtype;
begin
 if caller is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'Sign in as a teacher.'; end if;
 if label is null or label !~ '^[A-Z0-9][A-Z0-9_-]{3,31}$' then raise exception 'Use a room name of 4–32 letters, numbers, hyphens or underscores.'; end if;
 if target_roster is null then
  insert into public.rosters(teacher_id,name) values(caller,label) returning * into c;
 else
  -- Match launch's room-before-roster locking order.
  select * into r from public.rooms where roster_id=target_roster and teacher_id=caller for update;
  select * into c from public.rosters where id=target_roster and teacher_id=caller for update;
  if not found then raise exception 'Choose one of your own rooms.'; end if;
  if exists(select 1 from public.quiz_sessions where room_id=r.id and status<>'ended') then raise exception 'End the activity before renaming its room.'; end if;
  update public.rosters set name=label where id=c.id returning * into c;
 end if;
 insert into public.rooms(teacher_id,roster_id,room_name) values(caller,c.id,label)
 on conflict(roster_id) do update set room_name=excluded.room_name;
 return jsonb_build_object('id',c.id,'name',c.name);
end $$;
revoke all on function public.classpulse_save_room(uuid,text) from public,anon,authenticated;
grant execute on function public.classpulse_save_room(uuid,text) to authenticated;
create index if not exists room_report_history on public.quiz_sessions(teacher_id,roster_id,ended_at desc,id) where status='ended';
notify pgrst,'reload schema';
commit;
