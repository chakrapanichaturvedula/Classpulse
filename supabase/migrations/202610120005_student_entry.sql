begin;
alter table public.session_roster_students add constraint session_student_owner unique(session_id,student_id,teacher_id);
create table public.session_participants (
 session_id uuid not null, student_id uuid not null, teacher_id uuid not null,
 joined_at timestamptz not null default now(), primary key(session_id,student_id),
 foreign key(session_id,student_id,teacher_id) references public.session_roster_students(session_id,student_id,teacher_id)
);
alter table public.session_participants enable row level security;
revoke all on public.session_participants from anon,authenticated;
grant select on public.session_participants to authenticated;
create policy participants_read_own on public.session_participants for select to authenticated
using(teacher_id=(select auth.uid()) and not coalesce((select auth.jwt())->>'is_anonymous','false')::boolean);
create table private.student_entry_tokens (
 session_id uuid not null, student_id uuid not null, token uuid not null default gen_random_uuid() unique,
 primary key(session_id,student_id),
 foreign key(session_id,student_id) references public.session_participants(session_id,student_id)
);
revoke all on private.student_entry_tokens from public,anon,authenticated;
create function public.classpulse_student_join(room_name_input text,student_code_input text)
returns jsonb language plpgsql security definer set search_path=''
as $$ declare s public.quiz_sessions%rowtype; p public.session_roster_students%rowtype; secret uuid; begin
 if room_name_input is null or student_code_input is null or length(room_name_input)>64 or length(student_code_input)>128 then
  raise exception 'Room or Student ID does not match an open session.';
 end if;
 select qs.* into s from public.quiz_sessions qs join public.rooms r on r.id=qs.room_id
 where r.room_name=upper(btrim(room_name_input)) and qs.status<>'ended' for share of qs;
 if found then
  select * into p from public.session_roster_students where session_id=s.id and upper(student_code_snapshot)=upper(btrim(student_code_input));
 end if;
 if p.student_id is null then raise exception 'Room or Student ID does not match an open session.'; end if;
 insert into public.session_participants(session_id,student_id,teacher_id) values(s.id,p.student_id,p.teacher_id) on conflict do nothing;
 insert into private.student_entry_tokens(session_id,student_id) values(s.id,p.student_id) on conflict do nothing;
 select token into secret from private.student_entry_tokens where session_id=s.id and student_id=p.student_id;
 return jsonb_build_object('token',secret,'full_name',p.full_name_snapshot,'student_code',p.student_code_snapshot,
  'room_name',upper(btrim(room_name_input)),'quiz_title',s.quiz_title_snapshot,'status',s.status);
end $$;
create function public.classpulse_student_status(entry_token uuid)
returns jsonb language plpgsql security definer set search_path=''
as $$ begin
 return (select jsonb_build_object('status',s.status,'quiz_title',s.quiz_title_snapshot)
 from private.student_entry_tokens t join public.quiz_sessions s on s.id=t.session_id where t.token=entry_token);
end $$;
revoke all on function public.classpulse_student_join(text,text) from public,anon,authenticated;
revoke all on function public.classpulse_student_status(uuid) from public,anon,authenticated;
grant execute on function public.classpulse_student_join(text,text) to anon,authenticated;
grant execute on function public.classpulse_student_status(uuid) to anon,authenticated;
commit;
