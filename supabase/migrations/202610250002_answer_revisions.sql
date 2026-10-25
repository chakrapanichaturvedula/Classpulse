begin;

-- Keep the existing validation, student lock, grading and quick-question wrapper.
do $$
declare definition text;prior text;replacement text;
begin
 select pg_get_functiondef('public.classpulse_submit_answer_v1(uuid,uuid,integer,text)'::regprocedure) into definition;
 prior:='raise exception ''This answer is already submitted and cannot be changed.'';';
 replacement:='if s.navigation_mode<>''free'' or s.activity_type<>''quiz'' then
   raise exception ''This answer is already submitted and cannot be changed.'';
  end if;';
 if strpos(definition,replacement)=0 then
  if strpos(definition,prior)=0 then raise exception 'Answer submission changed; review before installing revisions.';end if;
  definition:=replace(definition,prior,replacement);
  prior:='case when q.question_type=''short_answer'' then normalized else null end,correct,score);';
  replacement:='case when q.question_type=''short_answer'' then normalized else null end,correct,score)
 on conflict (session_id,student_id,question_id) do update
 set option_position=excluded.option_position,answer_text=excluded.answer_text,
 is_correct=excluded.is_correct,awarded_points=excluded.awarded_points,
 submitted_at=clock_timestamp(),teacher_comment=null,graded_at=null,graded_by=null;';
  if strpos(definition,prior)=0 then raise exception 'Answer saving changed; review before installing revisions.';end if;
  execute replace(definition,prior,replacement);
 end if;

 -- The frontend enables editing only after the server advertises support.
 select pg_get_functiondef('public.classpulse_student_question(uuid,integer)'::regprocedure) into definition;
 prior:='''navigation_mode'',s.navigation_mode,';
 replacement:='''navigation_mode'',s.navigation_mode,''can_revise_answers'',(s.navigation_mode=''free'' and s.activity_type=''quiz'' and s.status=''live''),';
 if strpos(definition,'''can_revise_answers''')=0 then
  if strpos(definition,prior)=0 then raise exception 'Question delivery changed; install quiz navigation before revisions.';end if;
  execute replace(definition,prior,replacement);
 end if;
end $$;

notify pgrst,'reload schema';
commit;
