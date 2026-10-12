begin;
create table public.rooms (
 id uuid primary key default gen_random_uuid(),teacher_id uuid not null references public.users(id),roster_id uuid not null,
 room_name text not null unique check(room_name ~ '^[A-Z0-9][A-Z0-9_-]{3,31}$'),
 created_at timestamptz not null default now(),unique(roster_id),unique(id,teacher_id,roster_id),
 foreign key(roster_id,teacher_id) references public.rosters(id,teacher_id)
);
alter table public.quiz_versions add constraint quiz_version_identity unique(id,quiz_id,teacher_id);
create table public.quiz_sessions (
 id uuid primary key default gen_random_uuid(),teacher_id uuid not null,room_id uuid not null,roster_id uuid not null,
 quiz_id uuid not null,quiz_version_id uuid not null,
 quiz_title_snapshot text not null,class_name_snapshot text not null,student_count integer not null check(student_count between 1 and 150),
 status text not null default 'lobby' check(status in('lobby','live','paused','ended')),
 created_at timestamptz not null default now(),ended_at timestamptz,
 unique(id,teacher_id),
 foreign key(room_id,teacher_id,roster_id) references public.rooms(id,teacher_id,roster_id),
 foreign key(quiz_version_id,quiz_id,teacher_id) references public.quiz_versions(id,quiz_id,teacher_id),
 check((status='ended')=(ended_at is not null))
);
create unique index one_active_quiz_per_room on public.quiz_sessions(room_id) where status<>'ended';
create table public.session_roster_students (
 session_id uuid not null,student_id uuid not null,teacher_id uuid not null,
 student_code_snapshot text not null,full_name_snapshot text not null,email_snapshot text,
 primary key(session_id,student_id),
 foreign key(session_id,teacher_id) references public.quiz_sessions(id,teacher_id),
 foreign key(student_id,teacher_id) references public.students(id,teacher_id)
);
do $$ declare t text; begin
 foreach t in array array['rooms','quiz_sessions','session_roster_students'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from anon,authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
  execute format('create policy %I on public.%I for select to authenticated using(teacher_id=(select auth.uid()) and not coalesce((select auth.jwt())->>''is_anonymous'',''false'')::boolean)',t||'_read_own',t);
 end loop;
end $$;
grant insert(teacher_id,roster_id,room_name) on public.rooms to authenticated;
create policy rooms_create_own on public.rooms for insert to authenticated
with check(teacher_id=(select auth.uid()) and not coalesce((select auth.jwt())->>'is_anonymous','false')::boolean);
create function public.classpulse_launch_quiz(target_room uuid,target_quiz uuid,expected_version uuid,expected_revision integer)
returns jsonb language plpgsql security definer set search_path=''
as $$ declare caller uuid:=auth.uid(); r public.rooms%rowtype; v public.quiz_versions%rowtype; s public.quiz_sessions%rowtype; count_students integer; class_label text; begin
 if caller is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'Sign in as a teacher.'; end if;
 select * into r from public.rooms where id=target_room and teacher_id=caller for update;
 if not found then raise exception 'Choose one of your own classroom rooms.'; end if;
 perform 1 from public.quizzes where id=target_quiz and teacher_id=caller for update;
 if not found then raise exception 'Choose one of your own saved quizzes.'; end if;
 select * into v from public.quiz_versions where quiz_id=target_quiz and teacher_id=caller order by version_number desc limit 1 for update;
 if not found or v.id is distinct from expected_version or v.revision is distinct from expected_revision then raise exception 'This quiz changed. Refresh the launch list and select it again.'; end if;
 select * into s from public.quiz_sessions where room_id=r.id and status<>'ended';
 if found then
  if s.quiz_version_id=v.id then return to_jsonb(s); end if;
  raise exception 'This room already has a session. End it before launching another quiz.';
 end if;
 select name into class_label from public.rosters where id=r.roster_id and teacher_id=caller for share;
 select count(*) into count_students from public.roster_students where roster_id=r.roster_id and teacher_id=caller and withdrawn_at is null;
 if count_students not between 1 and 150 then raise exception 'Save a roster of 1 to 150 students before launching.'; end if;
 if v.status='draft' then perform public.classpulse_publish_quiz(v.id,v.revision); end if;
 insert into public.quiz_sessions(teacher_id,room_id,roster_id,quiz_id,quiz_version_id,quiz_title_snapshot,class_name_snapshot,student_count)
 values(caller,r.id,r.roster_id,target_quiz,v.id,v.title,class_label,count_students) returning * into s;
 insert into public.session_roster_students(session_id,student_id,teacher_id,student_code_snapshot,full_name_snapshot,email_snapshot)
 select s.id,p.id,caller,p.student_code,p.full_name,p.email
 from public.roster_students m join public.students p on p.id=m.student_id and p.teacher_id=m.teacher_id
 where m.roster_id=r.roster_id and m.teacher_id=caller and m.withdrawn_at is null;
 return to_jsonb(s);
end $$;
create function public.classpulse_end_session(target_session uuid)
returns void language plpgsql security definer set search_path=''
as $$ begin
 if auth.uid() is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'Sign in as a teacher.'; end if;
 update public.quiz_sessions set status='ended',ended_at=now() where id=target_session and teacher_id=auth.uid() and status<>'ended';
 if not found and not exists(select 1 from public.quiz_sessions where id=target_session and teacher_id=auth.uid() and status='ended') then raise exception 'This session is not available to your account.'; end if;
end $$;
revoke all on function public.classpulse_launch_quiz(uuid,uuid,uuid,integer) from public,anon,authenticated;
revoke all on function public.classpulse_end_session(uuid) from public,anon,authenticated;
grant execute on function public.classpulse_launch_quiz(uuid,uuid,uuid,integer) to authenticated;
grant execute on function public.classpulse_end_session(uuid) to authenticated;
commit;