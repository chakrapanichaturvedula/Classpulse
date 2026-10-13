begin;
alter table public.quiz_responses add column if not exists teacher_comment text check(length(teacher_comment)<=2000);
alter table public.quiz_responses add column if not exists graded_at timestamptz;
alter table public.quiz_responses add column if not exists graded_by uuid references public.users(id);
create table if not exists private.response_grade_audit(
 id uuid primary key default gen_random_uuid(),session_id uuid not null,student_id uuid not null,question_id uuid not null,teacher_id uuid not null,
 previous_points numeric(8,2),awarded_points numeric(8,2) not null,teacher_comment text,graded_at timestamptz not null default now(),
 foreign key(session_id,student_id,question_id) references public.quiz_responses(session_id,student_id,question_id)
);
alter table private.response_grade_audit enable row level security;
revoke all on private.response_grade_audit from public,anon,authenticated;
create or replace function public.classpulse_short_answer_marks(target_session uuid)
returns jsonb language plpgsql security definer set search_path='' as $$ declare s public.quiz_sessions%rowtype;begin
 if auth.uid() is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'Sign in as a teacher.';end if;
 select * into s from public.quiz_sessions where id=target_session and teacher_id=auth.uid();
 if not found then raise exception 'This report is not available to your account.';end if;
 if s.status<>'ended' or s.activity_type<>'quiz' then raise exception 'Mark short answers after ending the quiz.';end if;
 return coalesce((select jsonb_agg(jsonb_build_object('student_id',r.student_id,'question_id',r.question_id,'student_name',st.full_name_snapshot,'student_code',st.student_code_snapshot,
 'position',q.position,'prompt',q.prompt,'points',q.points,'answer_text',r.answer_text,'awarded_points',r.awarded_points,'teacher_comment',r.teacher_comment,'graded_at',r.graded_at)
 order by q.position,st.full_name_snapshot,st.student_code_snapshot)
 from public.quiz_responses r join public.questions q on q.id=r.question_id
 join public.session_roster_students st on st.session_id=r.session_id and st.student_id=r.student_id
 where r.session_id=s.id and q.question_type='short_answer'),'[]'::jsonb);
end $$;
create or replace function public.classpulse_grade_short_answer(target_session uuid,target_student uuid,target_question uuid,new_points numeric,feedback text,expected_points numeric,expected_graded_at timestamptz)
returns void language plpgsql security definer set search_path='' as $$ declare s public.quiz_sessions%rowtype;q public.questions%rowtype;r public.quiz_responses%rowtype;comment text;begin
 if auth.uid() is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'Sign in as a teacher.';end if;
 select * into s from public.quiz_sessions where id=target_session and teacher_id=auth.uid() for share;
 if not found then raise exception 'This report is not available to your account.';end if;
 if s.status<>'ended' or s.activity_type<>'quiz' then raise exception 'Mark short answers after ending the quiz.';end if;
 select * into q from public.questions where id=target_question and quiz_version_id=s.quiz_version_id and question_type='short_answer';
 if not found then raise exception 'Choose a short-answer question from this quiz.';end if;
 if new_points is null or new_points::text in('NaN','Infinity','-Infinity') or new_points<0 or new_points>q.points or round(new_points,2)<>new_points then raise exception 'Use marks from 0 to the question maximum, with at most two decimal places.';end if;
 comment:=nullif(btrim(feedback),'');if length(comment)>2000 then raise exception 'Use a comment of at most 2000 characters.';end if;
 select * into r from public.quiz_responses where session_id=s.id and student_id=target_student and question_id=q.id for update;
 if not found then raise exception 'This student has no submitted answer to mark.';end if;
 if r.awarded_points is distinct from expected_points or r.graded_at is distinct from expected_graded_at then raise exception 'This mark changed in another window. Refresh the marking list before saving.';end if;
 insert into private.response_grade_audit(session_id,student_id,question_id,teacher_id,previous_points,awarded_points,teacher_comment)
 values(s.id,target_student,q.id,auth.uid(),r.awarded_points,new_points,comment);
 update public.quiz_responses set awarded_points=new_points,is_correct=(new_points=q.points),teacher_comment=comment,graded_at=clock_timestamp(),graded_by=auth.uid()
 where session_id=s.id and student_id=target_student and question_id=q.id;
end $$;
-- Include feedback in the existing teacher-only corrected script, without altering student APIs.
create or replace function public.classpulse_student_script(target_session uuid,target_student uuid)
returns jsonb language plpgsql security definer set search_path=''
as $$ declare s public.quiz_sessions%rowtype; student public.session_roster_students%rowtype; begin
 if auth.uid() is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'Sign in as a teacher.'; end if;
 select * into s from public.quiz_sessions where id=target_session and teacher_id=auth.uid();
 if not found then raise exception 'This report is not available to your account.'; end if;
 if s.status<>'ended' or s.activity_type<>'quiz' then raise exception 'Corrected scripts are available only for ended quizzes.'; end if;
 select * into student from public.session_roster_students where session_id=s.id and student_id=target_student and teacher_id=s.teacher_id;
 if not found then raise exception 'This student is not in the saved session roster.'; end if;
 return jsonb_build_object('session_id',s.id,'quiz_title',s.quiz_title_snapshot,'class_name',s.class_name_snapshot,
 'room_name',(select room_name from public.rooms where id=s.room_id),'status',s.status,'activity_type',s.activity_type,'ended_at',s.ended_at,
 'students',jsonb_build_array(jsonb_build_object('id',student.student_id,'name',student.full_name_snapshot,'code',student.student_code_snapshot,
 'joined',exists(select 1 from public.session_participants j where j.session_id=s.id and j.student_id=student.student_id))),
 'questions',coalesce((select jsonb_agg(jsonb_build_object('id',q.id,'position',q.position,'prompt',q.prompt,'type',q.question_type,'points',q.points,
 'options',coalesce((select jsonb_agg(jsonb_build_object('position',o.position,'label',o.label) order by o.position) from public.question_options o where o.question_id=q.id),'[]'::jsonb),
 'correct_position',k.correct_position,'accepted_answers',k.accepted_answers,'manual_grading',k.manual_grading) order by q.position)
 from public.questions q join private.question_answer_keys k on k.question_id=q.id and k.teacher_id=s.teacher_id where q.quiz_version_id=s.quiz_version_id),'[]'::jsonb),
 'responses',coalesce((select jsonb_agg(jsonb_build_object('student_id',r.student_id,'question_id',r.question_id,'option_position',r.option_position,'answer_text',r.answer_text,
 'is_correct',r.is_correct,'awarded_points',r.awarded_points,'teacher_comment',r.teacher_comment)) from public.quiz_responses r where r.session_id=s.id and r.student_id=student.student_id),'[]'::jsonb));
end $$;
revoke all on function public.classpulse_short_answer_marks(uuid) from public,anon,authenticated;
revoke all on function public.classpulse_grade_short_answer(uuid,uuid,uuid,numeric,text,numeric,timestamptz) from public,anon,authenticated;
revoke all on function public.classpulse_student_script(uuid,uuid) from public,anon,authenticated;
grant execute on function public.classpulse_short_answer_marks(uuid) to authenticated;
grant execute on function public.classpulse_grade_short_answer(uuid,uuid,uuid,numeric,text,numeric,timestamptz) to authenticated;
grant execute on function public.classpulse_student_script(uuid,uuid) to authenticated;
notify pgrst,'reload schema';
commit;
