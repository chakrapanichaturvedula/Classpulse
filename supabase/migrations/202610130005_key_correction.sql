begin;
create table if not exists private.session_answer_keys(
 session_id uuid not null,question_id uuid not null,teacher_id uuid not null,quiz_version_id uuid not null,
 correct_position integer,accepted_answers jsonb not null default '[]',revision integer not null default 1,
 updated_at timestamptz not null default now(),primary key(session_id,question_id),
 foreign key(session_id,quiz_version_id,teacher_id) references public.quiz_sessions(id,quiz_version_id,teacher_id),
 foreign key(question_id,quiz_version_id,teacher_id) references public.questions(id,quiz_version_id,teacher_id)
);
create table if not exists private.answer_key_corrections(
 id uuid primary key default gen_random_uuid(),session_id uuid not null,question_id uuid not null,teacher_id uuid not null,
 previous_key jsonb not null,new_key jsonb not null,reason text not null,before_grades jsonb not null,
 changed_rows integer not null,created_at timestamptz not null default now()
);
alter table private.session_answer_keys enable row level security;
alter table private.answer_key_corrections enable row level security;
revoke all on private.session_answer_keys,private.answer_key_corrections from public,anon,authenticated;
create or replace function public.classpulse_answer_keys(target_session uuid)
returns jsonb language plpgsql security definer set search_path='' as $$declare s public.quiz_sessions%rowtype;sid uuid;doc jsonb;begin
 if auth.uid() is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'Sign in as a teacher.';end if;
 select * into s from public.quiz_sessions where id=target_session and teacher_id=auth.uid();if not found then raise exception 'This report is not available to your account.';end if;
 if s.status<>'ended' or s.activity_type<>'quiz' then raise exception 'Correct keys only after ending the quiz.';end if;
 select student_id into sid from public.session_roster_students where session_id=s.id limit 1;
 doc:=public.classpulse_student_script(s.id,sid);
 return jsonb_build_object('quiz_title',s.quiz_title_snapshot,'questions',doc->'questions');
end $$;
create or replace function public.classpulse_preview_key_correction(target_session uuid,target_question uuid,new_position integer,new_answers jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$declare s public.quiz_sessions%rowtype;q public.questions%rowtype;original private.question_answer_keys%rowtype;oldkey jsonb;newkey jsonb;keys jsonb;grades jsonb;rows jsonb;answers jsonb;total numeric;changed_count integer;manual integer;key_revision integer;begin
 keys:=public.classpulse_answer_keys(target_session);
 select * into s from public.quiz_sessions where id=target_session;
 select * into q from public.questions where id=target_question and quiz_version_id=s.quiz_version_id;if not found then raise exception 'Choose a question from this exam.';end if;
 select * into original from private.question_answer_keys where question_id=q.id;
 if original.manual_grading then raise exception 'This question is manually marked. Use Mark short answers instead.';end if;
 select value into oldkey from jsonb_array_elements(keys->'questions') where value->>'id'=q.id::text;
 if jsonb_typeof(new_answers) is distinct from 'array' then raise exception 'Provide accepted answers as a list.';end if;
 if q.question_type='short_answer' then
  if new_position is not null or jsonb_array_length(new_answers) not between 1 and 20 or exists(select 1 from jsonb_array_elements(new_answers) v where jsonb_typeof(v)<>'string' or length(btrim(v#>>'{}')) not between 1 and 1000) then raise exception 'Use 1 to 20 nonempty accepted answers, up to 1000 characters each.';end if;
  select jsonb_agg(value order by ordinal) into answers from(select distinct on(lower(btrim(value))) btrim(value) as value,ordinal from jsonb_array_elements_text(new_answers) with ordinality t(value,ordinal) order by lower(btrim(value)),ordinal) cleaned;
 else
  if jsonb_array_length(new_answers)<>0 or new_position is null or not exists(select 1 from public.question_options where question_id=q.id and position=new_position) then raise exception 'Choose one of this question''s answer options.';end if;answers:='[]';
 end if;
 newkey:=jsonb_build_object('correct_position',new_position,'accepted_answers',answers);
 if newkey=jsonb_build_object('correct_position',oldkey->'correct_position','accepted_answers',oldkey->'accepted_answers') then raise exception 'Choose a different answer key.';end if;
 select ov.revision into key_revision from private.session_answer_keys ov where ov.session_id=s.id and ov.question_id=q.id;
 grades:=coalesce((select jsonb_agg(to_jsonb(r) order by r.student_id,r.question_id) from public.quiz_responses r where r.session_id=s.id),'[]'::jsonb);
 select sum(points) into total from public.questions where quiz_version_id=s.quiz_version_id;
 with candidates as(select st.student_id,st.full_name_snapshot as name,st.student_code_snapshot as code,r.question_id is not null as submitted,
 coalesce(r.awarded_points,0) as old_points,r.is_correct as old_correct,
 case when r.question_id is null then false when q.question_type='short_answer' then exists(select 1 from jsonb_array_elements_text(answers) a where lower(btrim(a.value))=lower(btrim(r.answer_text))) else r.option_position=new_position end as correct,
 coalesce((select sum(coalesce(a.awarded_points,0)) from public.quiz_responses a where a.session_id=s.id and a.student_id=st.student_id),0) as old_total,
 exists(select 1 from public.quiz_responses a where a.session_id=s.id and a.student_id=st.student_id and a.awarded_points is null) as old_pending,
 exists(select 1 from public.quiz_responses a where a.session_id=s.id and a.student_id=st.student_id and a.question_id<>q.id and a.awarded_points is null) as new_pending,
 exists(select 1 from public.session_participants j where j.session_id=s.id and j.student_id=st.student_id) or exists(select 1 from public.quiz_responses a where a.session_id=s.id and a.student_id=st.student_id) as participated
 from public.session_roster_students st left join public.quiz_responses r on r.session_id=st.session_id and r.student_id=st.student_id and r.question_id=q.id where st.session_id=s.id),scored as(select *,case when submitted and correct then q.points else 0 end as new_points from candidates),updated as(select *,old_total-old_points+new_points as new_total,submitted and(old_points is distinct from new_points or old_correct is distinct from correct) as changed from scored)
 select jsonb_agg(jsonb_build_object('student_id',student_id,'name',name,'code',code,'submitted',submitted,'participated',participated,'old_points',old_points,'new_points',new_points,'old_total',old_total,'new_total',new_total,'old_percent',case when participated and not old_pending and total>0 then round(100*old_total/total,2) end,'new_percent',case when participated and not new_pending and total>0 then round(100*new_total/total,2) end,'changed',changed) order by name,code),count(*) filter(where changed)
 into rows,changed_count from updated;
 select count(*) into manual from public.quiz_responses where session_id=s.id and question_id=q.id and graded_by is not null;
 return jsonb_build_object('question',oldkey,'new_key',newkey,'rows',coalesce(rows,'[]'::jsonb),'total_points',total,'changed_students',changed_count,'manual_adjustments',manual,
 'token',md5(keys::text||grades::text||newkey::text||q.id::text||coalesce(key_revision,0)::text));
end $$;
create or replace function public.classpulse_apply_key_correction(target_session uuid,target_question uuid,new_position integer,new_answers jsonb,expected_token text,correction_reason text)
returns void language plpgsql security definer set search_path='' as $$declare s public.quiz_sessions%rowtype;q public.questions%rowtype;preview jsonb;before jsonb;active_email boolean;reason text;begin
 if auth.uid() is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'Sign in as a teacher.';end if;
 select * into s from public.quiz_sessions where id=target_session and teacher_id=auth.uid() for update;if not found then raise exception 'This report is not available to your account.';end if;
 preview:=public.classpulse_preview_key_correction(target_session,target_question,new_position,new_answers);
 if preview->>'token' is distinct from expected_token then raise exception 'The report or key changed. Preview the correction again before applying.';end if;
 reason:=btrim(correction_reason);if reason is null or length(reason) not between 1 and 2000 then raise exception 'Enter a reason for this correction (up to 2000 characters).';end if;
 if to_regclass('private.report_email_jobs') is not null then
  execute 'select exists(select 1 from private.report_email_jobs where session_id=$1 and status=''sending'')' into active_email using s.id;
  if active_email then raise exception 'An email send is still in progress. Finish or review it before correcting the key.';end if;
 end if;
 select * into q from public.questions where id=target_question;
 before:=coalesce((select jsonb_agg(to_jsonb(r) order by r.student_id) from public.quiz_responses r where r.session_id=s.id and r.question_id=q.id),'[]'::jsonb);
 insert into private.answer_key_corrections(session_id,question_id,teacher_id,previous_key,new_key,reason,before_grades,changed_rows)
 values(s.id,q.id,auth.uid(),preview->'question',preview->'new_key',reason,before,(preview->>'changed_students')::integer);
 insert into private.session_answer_keys(session_id,question_id,teacher_id,quiz_version_id,correct_position,accepted_answers)
 values(s.id,q.id,auth.uid(),s.quiz_version_id,(preview->'new_key'->>'correct_position')::integer,preview->'new_key'->'accepted_answers')
 on conflict(session_id,question_id) do update set correct_position=excluded.correct_position,accepted_answers=excluded.accepted_answers,revision=private.session_answer_keys.revision+1,updated_at=clock_timestamp();
 insert into private.response_grade_audit(session_id,student_id,question_id,teacher_id,previous_points,awarded_points,teacher_comment)
 select s.id,r.student_id,q.id,auth.uid(),r.awarded_points,(x->>'new_points')::numeric,null from public.quiz_responses r join jsonb_array_elements(preview->'rows') x on x->>'student_id'=r.student_id::text where r.session_id=s.id and r.question_id=q.id;
 update public.quiz_responses r set awarded_points=(x->>'new_points')::numeric,is_correct=case when q.question_type='short_answer' then exists(select 1 from jsonb_array_elements_text(preview->'new_key'->'accepted_answers') a where lower(btrim(a.value))=lower(btrim(r.answer_text))) else r.option_position=(preview->'new_key'->>'correct_position')::integer end,
 teacher_comment=case when (x->>'changed')::boolean then null else r.teacher_comment end,graded_by=null,graded_at=clock_timestamp()
 from jsonb_array_elements(preview->'rows') x where r.session_id=s.id and r.question_id=q.id and x->>'student_id'=r.student_id::text;
 if to_regclass('private.report_email_jobs') is not null then execute 'update private.report_email_jobs set status=''failed'',payload=null,script_snapshot=null,error_message=''Report changed; refresh recipients before sending.'',updated_at=now() where session_id=$1 and status in(''queued'',''failed'')' using s.id;end if;
end $$;
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
 'correct_position',coalesce(ov.correct_position,k.correct_position),'accepted_answers',coalesce(ov.accepted_answers,k.accepted_answers),'manual_grading',k.manual_grading) order by q.position)
 from public.questions q join private.question_answer_keys k on k.question_id=q.id and k.teacher_id=s.teacher_id left join private.session_answer_keys ov on ov.session_id=s.id and ov.question_id=q.id where q.quiz_version_id=s.quiz_version_id),'[]'::jsonb),
 'responses',coalesce((select jsonb_agg(jsonb_build_object('student_id',r.student_id,'question_id',r.question_id,'option_position',r.option_position,'answer_text',r.answer_text,
 'is_correct',r.is_correct,'awarded_points',r.awarded_points,'teacher_comment',r.teacher_comment)) from public.quiz_responses r where r.session_id=s.id and r.student_id=student.student_id),'[]'::jsonb))||jsonb_strip_nulls(jsonb_build_object('key_corrected_at',(select max(updated_at) from private.session_answer_keys where session_id=s.id)));
end $$;
create or replace function public.classpulse_live_results(target_session uuid)
returns jsonb language plpgsql security definer set search_path='' as $$declare doc jsonb;kind text;begin
 doc:=public.classpulse_live_results_v1(target_session);select activity_type into kind from public.quiz_sessions where id=target_session;
 return doc||jsonb_build_object('activity_type',kind)||jsonb_strip_nulls(jsonb_build_object('key_corrected_at',(select max(updated_at) from private.session_answer_keys where session_id=target_session)));
end $$;
revoke all on function public.classpulse_answer_keys(uuid) from public,anon,authenticated;
revoke all on function public.classpulse_preview_key_correction(uuid,uuid,integer,jsonb) from public,anon,authenticated;
revoke all on function public.classpulse_apply_key_correction(uuid,uuid,integer,jsonb,text,text) from public,anon,authenticated;
revoke all on function public.classpulse_student_script(uuid,uuid),public.classpulse_live_results(uuid) from public,anon,authenticated;
grant execute on function public.classpulse_answer_keys(uuid),public.classpulse_preview_key_correction(uuid,uuid,integer,jsonb),public.classpulse_apply_key_correction(uuid,uuid,integer,jsonb,text,text),public.classpulse_student_script(uuid,uuid),public.classpulse_live_results(uuid) to authenticated;
notify pgrst,'reload schema';commit;
