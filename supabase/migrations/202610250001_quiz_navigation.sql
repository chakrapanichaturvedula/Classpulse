begin;

alter table public.quiz_sessions add column navigation_mode text not null default 'sequential'
 check(navigation_mode in('sequential','free'));

-- Keep the four-argument launch RPC for older clients and quick questions.
create function public.classpulse_launch_quiz(target_room uuid,target_quiz uuid,expected_version uuid,expected_revision integer,navigation_mode text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare doc jsonb;s public.quiz_sessions%rowtype;
begin
 perform public.classpulse_require_faculty();
 if navigation_mode is null or navigation_mode not in('sequential','free') then raise exception 'Choose Sequential only or Free navigation.';end if;
 -- Use the same room lock as the original launch to serialize retries.
 perform 1 from public.rooms where id=target_room and teacher_id=auth.uid() for update;
 if not found then raise exception 'Choose one of your own classroom rooms.';end if;
 select * into s from public.quiz_sessions where room_id=target_room and status<>'ended';
 if found and s.navigation_mode<>navigation_mode then raise exception 'This room already has a session with different navigation settings. End it before launching another quiz.';end if;
 doc:=public.classpulse_launch_quiz(target_room,target_quiz,expected_version,expected_revision);
 update public.quiz_sessions set navigation_mode=classpulse_launch_quiz.navigation_mode where id=(doc->>'id')::uuid returning * into s;
 return to_jsonb(s);
end $$;

-- Do not broaden table access or expose answer keys. Only this student's own
-- submitted answer is returned when reviewing a question in free mode.
create function public.classpulse_student_question(entry_token uuid,target_position integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare t private.student_entry_tokens%rowtype;s public.quiz_sessions%rowtype;q public.questions%rowtype;
 total integer;answered integer;doc jsonb;saved jsonb;
begin
 select * into t from private.student_entry_tokens where token=entry_token;
 if not found then raise exception 'Join the classroom again.';end if;
 select * into s from public.quiz_sessions where id=t.session_id for share;
 select count(*) into total from public.questions where quiz_version_id=s.quiz_version_id;
 select count(*) into answered from public.quiz_responses where session_id=s.id and student_id=t.student_id;
 if s.status='live' then
  if s.navigation_mode='free' and s.activity_type='quiz' then
   if target_position is not null and target_position not between 1 and total then raise exception 'Choose a question in this quiz.';end if;
   select p.* into q from public.questions p where p.quiz_version_id=s.quiz_version_id
    and (target_position is null or p.position=target_position)
    order by case when not exists(select 1 from public.quiz_responses a where a.session_id=s.id and a.student_id=t.student_id and a.question_id=p.id) then 0 else 1 end,p.position limit 1;
   select jsonb_build_object('option_position',a.option_position,'answer_text',a.answer_text) into saved
    from public.quiz_responses a where a.session_id=s.id and a.student_id=t.student_id and a.question_id=q.id;
  else
   -- Ignore requested positions in sequential mode, including stale clients.
   select p.* into q from public.questions p where p.quiz_version_id=s.quiz_version_id and not exists(
    select 1 from public.quiz_responses a where a.session_id=s.id and a.student_id=t.student_id and a.question_id=p.id)
    order by p.position limit 1;
  end if;
  if q.id is not null then
   doc:=jsonb_build_object('id',q.id,'position',q.position,'type',q.question_type,'prompt',q.prompt,'points',q.points,
    'saved_answer',saved,'options',coalesce((select jsonb_agg(jsonb_build_object('position',o.position,'label',o.label) order by o.position)
     from public.question_options o where o.question_id=q.id),'[]'::jsonb));
  end if;
 end if;
 return jsonb_build_object('status',s.status,'activity_type',s.activity_type,'navigation_mode',s.navigation_mode,
  'total',total,'answered',answered,'question',doc,'completed',answered=total);
end $$;

create or replace function public.classpulse_student_question(entry_token uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
begin return public.classpulse_student_question(entry_token,null);end $$;

-- Preserve existing validation, grading, immutable submissions and per-student
-- locking. Only remove the ordering restriction for free-navigation quizzes.
do $$
declare definition text;prior text:='if exists(select 1 from public.questions p where p.quiz_version_id=s.quiz_version_id and p.position<q.position';
begin
 select pg_get_functiondef('public.classpulse_submit_answer_v1(uuid,uuid,integer,text)'::regprocedure) into definition;
 if strpos(definition,prior)=0 then raise exception 'Answer submission changed; review its ordering guard before installing navigation.';end if;
 execute replace(definition,prior,'if (s.navigation_mode<>''free'' or s.activity_type<>''quiz'') and exists(select 1 from public.questions p where p.quiz_version_id=s.quiz_version_id and p.position<q.position');
end $$;

revoke all on function public.classpulse_launch_quiz(uuid,uuid,uuid,integer,text) from public,anon,authenticated;
grant execute on function public.classpulse_launch_quiz(uuid,uuid,uuid,integer,text) to authenticated;
revoke all on function public.classpulse_student_question(uuid,integer) from public,anon,authenticated;
grant execute on function public.classpulse_student_question(uuid,integer) to anon,authenticated;
notify pgrst,'reload schema';
commit;
