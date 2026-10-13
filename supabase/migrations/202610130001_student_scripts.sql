begin;
-- Only the owning teacher can retrieve private keys for an ended quiz.
-- Always join the session's immutable version, never the latest Library draft.
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
 'is_correct',r.is_correct,'awarded_points',r.awarded_points)) from public.quiz_responses r where r.session_id=s.id and r.student_id=student.student_id),'[]'::jsonb));
end $$;
revoke all on function public.classpulse_student_script(uuid,uuid) from public,anon,authenticated;
grant execute on function public.classpulse_student_script(uuid,uuid) to authenticated;
notify pgrst,'reload schema';
commit;
