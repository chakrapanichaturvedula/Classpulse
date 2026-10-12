begin;
alter table public.questions add constraint question_session_identity unique(id,quiz_version_id,teacher_id);
alter table public.quiz_sessions add constraint session_version_identity unique(id,quiz_version_id,teacher_id);
create table public.quiz_responses (
 session_id uuid not null,student_id uuid not null,teacher_id uuid not null,quiz_version_id uuid not null,question_id uuid not null,
 option_position integer,answer_text text,is_correct boolean,awarded_points numeric(8,2),submitted_at timestamptz not null default now(),
 primary key(session_id,student_id,question_id),
 foreign key(session_id,student_id,teacher_id) references public.session_roster_students(session_id,student_id,teacher_id),
 foreign key(session_id,quiz_version_id,teacher_id) references public.quiz_sessions(id,quiz_version_id,teacher_id),
 foreign key(question_id,quiz_version_id,teacher_id) references public.questions(id,quiz_version_id,teacher_id),
 check((option_position is not null and answer_text is null) or (option_position is null and answer_text is not null)),
 check(length(answer_text)<=4000),check(awarded_points between 0 and 1000)
);
alter table public.quiz_responses enable row level security;
revoke all on public.quiz_responses from anon,authenticated;
grant select on public.quiz_responses to authenticated;
create policy responses_read_own on public.quiz_responses for select to authenticated
using(teacher_id=(select auth.uid()) and not coalesce((select auth.jwt())->>'is_anonymous','false')::boolean);
create function public.classpulse_start_session(target_session uuid)
returns void language plpgsql security definer set search_path=''
as $$ begin
 if auth.uid() is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'Sign in as a teacher.'; end if;
 update public.quiz_sessions set status='live' where id=target_session and teacher_id=auth.uid() and status='lobby';
 if not found and not exists(select 1 from public.quiz_sessions where id=target_session and teacher_id=auth.uid() and status='live') then raise exception 'This session cannot be started.'; end if;
end $$;
create function public.classpulse_student_question(entry_token uuid)
returns jsonb language plpgsql security definer set search_path=''
as $$ declare t private.student_entry_tokens%rowtype; s public.quiz_sessions%rowtype; q public.questions%rowtype; total integer; answered integer; doc jsonb; begin
 select * into t from private.student_entry_tokens where token=entry_token;
 if not found then raise exception 'Join the classroom again.'; end if;
 select * into s from public.quiz_sessions where id=t.session_id for share;
 select count(*) into total from public.questions where quiz_version_id=s.quiz_version_id;
 select count(*) into answered from public.quiz_responses where session_id=s.id and student_id=t.student_id;
 if s.status='live' then
  select p.* into q from public.questions p where p.quiz_version_id=s.quiz_version_id and not exists(
   select 1 from public.quiz_responses a where a.session_id=s.id and a.student_id=t.student_id and a.question_id=p.id)
  order by p.position limit 1;
  if found then doc:=jsonb_build_object('id',q.id,'position',q.position,'type',q.question_type,'prompt',q.prompt,'points',q.points,
   'options',coalesce((select jsonb_agg(jsonb_build_object('position',o.position,'label',o.label) order by o.position) from public.question_options o where o.question_id=q.id),'[]'::jsonb)); end if;
 end if;
 return jsonb_build_object('status',s.status,'total',total,'answered',answered,'question',doc,'completed',answered=total);
end $$;
create function public.classpulse_submit_answer(entry_token uuid,target_question uuid,selected_option integer default null,response_text text default null)
returns jsonb language plpgsql security definer set search_path=''
as $$ declare t private.student_entry_tokens%rowtype; s public.quiz_sessions%rowtype; q public.questions%rowtype;
 existing public.quiz_responses%rowtype; key private.question_answer_keys%rowtype; correct boolean; score numeric; normalized text; begin
 select * into t from private.student_entry_tokens where token=entry_token;
 if not found then raise exception 'Join the classroom again.'; end if;
 select * into s from public.quiz_sessions where id=t.session_id for share;
 -- Serialize answers for this student only, allowing the class to answer concurrently.
 perform 1 from public.session_participants where session_id=s.id and student_id=t.student_id for update;
 select * into q from public.questions where id=target_question and quiz_version_id=s.quiz_version_id;
 if not found then raise exception 'This question is not part of your session.'; end if;
 normalized:=btrim(response_text);
 select * into existing from public.quiz_responses where session_id=s.id and student_id=t.student_id and question_id=q.id;
 if found then
  if existing.option_position is not distinct from selected_option and existing.answer_text is not distinct from normalized then
   return jsonb_build_object('saved',true);
  end if;
  raise exception 'This answer is already submitted and cannot be changed.';
 end if;
 if s.status<>'live' then raise exception 'The quiz is not accepting answers.'; end if;
 if exists(select 1 from public.questions p where p.quiz_version_id=s.quiz_version_id and p.position<q.position and not exists(
  select 1 from public.quiz_responses a where a.session_id=s.id and a.student_id=t.student_id and a.question_id=p.id)) then
  raise exception 'Answer the current question first.';
 end if;
 if q.question_type='short_answer' then
  if selected_option is not null or normalized is null or length(normalized) not between 1 and 4000 then raise exception 'Enter an answer of 1 to 4000 characters.'; end if;
 else
  if response_text is not null or selected_option is null or not exists(select 1 from public.question_options where question_id=q.id and position=selected_option) then raise exception 'Choose one of the available answers.'; end if;
 end if;
 select * into key from private.question_answer_keys where question_id=q.id;
 if not found then raise exception 'The question is not ready for grading.'; end if;
 if q.question_type='short_answer' then
  if not key.manual_grading then correct:=exists(select 1 from jsonb_array_elements_text(key.accepted_answers) a where lower(btrim(a.value))=lower(normalized)); end if;
 else correct:=selected_option=key.correct_position; end if;
 if correct is not null then score:=case when correct then q.points else 0 end; end if;
 insert into public.quiz_responses(session_id,student_id,teacher_id,quiz_version_id,question_id,option_position,answer_text,is_correct,awarded_points)
 values(s.id,t.student_id,s.teacher_id,s.quiz_version_id,q.id,selected_option,case when q.question_type='short_answer' then normalized else null end,correct,score);
 -- Never return the answer key or correctness to students in this mode.
 return jsonb_build_object('saved',true);
end $$;
revoke all on function public.classpulse_start_session(uuid) from public,anon,authenticated;
revoke all on function public.classpulse_student_question(uuid) from public,anon,authenticated;
revoke all on function public.classpulse_submit_answer(uuid,uuid,integer,text) from public,anon,authenticated;
grant execute on function public.classpulse_start_session(uuid) to authenticated;
grant execute on function public.classpulse_student_question(uuid) to anon,authenticated;
grant execute on function public.classpulse_submit_answer(uuid,uuid,integer,text) to anon,authenticated;
commit;
