begin;
do $test$
declare a uuid:=gen_random_uuid();b uuid:=gen_random_uuid();roster uuid;room uuid;student uuid;other_student uuid;q uuid;mc uuid;doc jsonb;s jsonb;marks jsonb;stamp timestamptz;denied boolean;label text:='MARK-'||upper(substr(md5(random()::text),1,10));value numeric;payload jsonb;
begin
 begin
 insert into auth.users(id,email,raw_user_meta_data,is_anonymous) values(a,a::text||'@classpulse.invalid','{"full_name":"Mark A"}',false),(b,b::text||'@classpulse.invalid','{"full_name":"Mark B"}',false);
 execute 'set local role authenticated';perform set_config('request.jwt.claims',jsonb_build_object('sub',a,'is_anonymous',false)::text,true);
 insert into public.rosters(teacher_id,name) values(a,label) returning id into roster;
 perform public.classpulse_import_roster(roster,'[{"id":"001","name":"Mark Student","emailid":""},{"id":"002","name":"Other Mark Student","emailid":""}]');
 insert into public.rooms(teacher_id,roster_id,room_name) values(a,roster,label) returning id into room;
 doc:=public.classpulse_save_quiz(null,null,'Mark quiz','[{"type":"short_answer","prompt":"Explain","points":3,"options":[],"correct_position":null,"accepted_answers":[],"manual_grading":true},{"type":"multiple_choice","prompt":"Choose","points":1,"options":["A","B"],"correct_position":1,"accepted_answers":[],"manual_grading":false}]',null,null);
 s:=public.classpulse_launch_quiz(room,(doc->>'quiz_id')::uuid,(doc->>'version_id')::uuid,(doc->>'revision')::integer);
 select student_id into student from public.session_roster_students where session_id=(s->>'id')::uuid and student_code_snapshot='001';
 select student_id into other_student from public.session_roster_students where session_id=(s->>'id')::uuid and student_code_snapshot='002';
 select id into q from public.questions where quiz_version_id=(doc->>'version_id')::uuid and question_type='short_answer';
 select id into mc from public.questions where quiz_version_id=(doc->>'version_id')::uuid and question_type='multiple_choice';
 execute 'reset role';
 insert into public.quiz_responses(session_id,student_id,teacher_id,quiz_version_id,question_id,answer_text) values((s->>'id')::uuid,student,a,(doc->>'version_id')::uuid,q,'Original student answer');
 execute 'set local role authenticated';
 denied:=false;begin perform public.classpulse_grade_short_answer((s->>'id')::uuid,student,q,2,'Good',null,null);exception when raise_exception then denied:=true;end;if not denied then raise exception 'FAIL: active quiz grading allowed';end if;
 perform public.classpulse_end_session((s->>'id')::uuid);
 marks:=public.classpulse_short_answer_marks((s->>'id')::uuid);if jsonb_array_length(marks)<>1 or marks->0->'awarded_points'<>'null'::jsonb then raise exception 'FAIL: pending answer list';end if;
 foreach value in array array[-1,4,1.001,'NaN'::numeric] loop
 denied:=false;begin perform public.classpulse_grade_short_answer((s->>'id')::uuid,student,q,value,'',null,null);exception when raise_exception then denied:=true;end;if not denied then raise exception 'FAIL: invalid grade accepted';end if;end loop;
 denied:=false;begin perform public.classpulse_grade_short_answer((s->>'id')::uuid,student,mc,1,'',null,null);exception when raise_exception then denied:=true;end;if not denied then raise exception 'FAIL: MCQ grading allowed';end if;
 denied:=false;begin perform public.classpulse_grade_short_answer((s->>'id')::uuid,gen_random_uuid(),q,1,'',null,null);exception when raise_exception then denied:=true;end;if not denied then raise exception 'FAIL: absent response grading allowed';end if;
 perform public.classpulse_grade_short_answer((s->>'id')::uuid,student,q,1.5,'Explain the second point.',null,null);
 marks:=public.classpulse_short_answer_marks((s->>'id')::uuid);stamp:=(marks->0->>'graded_at')::timestamptz;
 if marks->0->>'answer_text'<>'Original student answer' or (marks->0->>'awarded_points')::numeric<>1.5 or stamp is null then raise exception 'FAIL: grading changed answer or lost partial marks';end if;
 if public.classpulse_student_script((s->>'id')::uuid,student)->'responses'->0->>'teacher_comment'<>'Explain the second point.' then raise exception 'FAIL: feedback absent from corrected script';end if;
 denied:=false;begin perform public.classpulse_grade_short_answer((s->>'id')::uuid,student,q,3,'',null,null);exception when raise_exception then denied:=true;end;if not denied then raise exception 'FAIL: stale window overwrote grade';end if;
 perform public.classpulse_grade_short_answer((s->>'id')::uuid,student,q,3,'Full credit',1.5,stamp);
 if (select awarded_points<>3 or is_correct<>true from public.quiz_responses where session_id=(s->>'id')::uuid and question_id=q) then raise exception 'FAIL: full grade not saved';end if;
 denied:=false;begin update public.quiz_responses set awarded_points=0 where session_id=(s->>'id')::uuid;exception when insufficient_privilege then denied:=true;end;if not denied then raise exception 'FAIL: direct browser grade write allowed';end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',b,'is_anonymous',false)::text,true);
 denied:=false;begin perform public.classpulse_short_answer_marks((s->>'id')::uuid);exception when raise_exception then denied:=true;end;if not denied then raise exception 'FAIL: foreign teacher reads answers';end if;
 denied:=false;begin perform public.classpulse_grade_short_answer((s->>'id')::uuid,student,q,0,'',3,null);exception when raise_exception then denied:=true;end;if not denied then raise exception 'FAIL: foreign teacher grades answers';end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',a,'is_anonymous',true)::text,true);
 denied:=false;begin perform public.classpulse_short_answer_marks((s->>'id')::uuid);exception when raise_exception then denied:=true;end;if not denied then raise exception 'FAIL: anonymous authenticated reads marking';end if;
 execute 'reset role';execute 'set local role anon';perform set_config('request.jwt.claims','{}',true);
 denied:=false;begin perform public.classpulse_grade_short_answer((s->>'id')::uuid,student,q,0,'',3,null);exception when insufficient_privilege then denied:=true;end;if not denied then raise exception 'FAIL: student grades answers';end if;
 execute 'reset role';if (select count(*) from private.response_grade_audit where session_id=(s->>'id')::uuid)<>2 then raise exception 'FAIL: audit missing';end if;
 insert into public.quiz_responses(session_id,student_id,teacher_id,quiz_version_id,question_id,answer_text,awarded_points,is_correct)
 values((s->>'id')::uuid,other_student,a,(doc->>'version_id')::uuid,q,'Second student answer',0,false);
 execute 'set local role authenticated';perform set_config('request.jwt.claims',jsonb_build_object('sub',a,'is_anonymous',false)::text,true);
 select jsonb_agg(jsonb_build_object('student_id',r.student_id,'new_points',case when r.student_id::text=(select max(x.student_id::text) from public.quiz_responses x where x.session_id=(s->>'id')::uuid) then 99 else 1 end,'feedback','Batch test','expected_points',r.awarded_points,'expected_graded_at',r.graded_at)) into payload
 from public.quiz_responses r where r.session_id=(s->>'id')::uuid;
 denied:=false;begin perform public.classpulse_grade_question_batch((s->>'id')::uuid,q,payload);exception when raise_exception then denied:=true;end;
 if not denied then raise exception 'FAIL: invalid batch accepted';end if;
 if (select awarded_points from public.quiz_responses where session_id=(s->>'id')::uuid and student_id=student)<>3 or (select awarded_points from public.quiz_responses where session_id=(s->>'id')::uuid and student_id=other_student)<>0 then raise exception 'FAIL: batch partially saved';end if;
 select jsonb_agg(jsonb_build_object('student_id',r.student_id,'new_points',2,'feedback','Batch feedback','expected_points',r.awarded_points,'expected_graded_at',r.graded_at)) into payload from public.quiz_responses r where r.session_id=(s->>'id')::uuid;
 perform public.classpulse_grade_question_batch((s->>'id')::uuid,q,payload);
 if exists(select 1 from public.quiz_responses where session_id=(s->>'id')::uuid and (awarded_points<>2 or teacher_comment<>'Batch feedback')) then raise exception 'FAIL: batch marks/feedback not saved';end if;
 denied:=false;begin perform public.classpulse_grade_question_batch((s->>'id')::uuid,q,payload);exception when raise_exception then denied:=true;end;if not denied then raise exception 'FAIL: stale batch accepted';end if;
 denied:=false;begin perform public.classpulse_grade_question_batch((s->>'id')::uuid,q,jsonb_build_array(payload->0,payload->0));exception when raise_exception then denied:=true;end;if not denied then raise exception 'FAIL: duplicate student batch accepted';end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',b,'is_anonymous',false)::text,true);
 denied:=false;begin perform public.classpulse_grade_question_batch((s->>'id')::uuid,q,payload);exception when raise_exception then denied:=true;end;if not denied then raise exception 'FAIL: foreign teacher batch accepted';end if;
 execute 'reset role';execute 'set local role anon';perform set_config('request.jwt.claims','{}',true);
 denied:=false;begin perform public.classpulse_grade_question_batch((s->>'id')::uuid,q,payload);exception when insufficient_privilege then denied:=true;end;if not denied then raise exception 'FAIL: student batch grade accepted';end if;
 execute 'reset role';if (select count(*) from private.response_grade_audit where session_id=(s->>'id')::uuid)<>4 then raise exception 'FAIL: failed batch audit rollback';end if;
 raise exception using errcode='CP001' ,message='Rollback fixtures';
 exception when sqlstate 'CP001' then null;
 end;
 if exists(select 1 from auth.users where id in(a,b)) then raise exception 'FAIL: fixtures remain';end if;
end $test$;
rollback;
select 'PASS: question-wise marking, atomic saves, conflicts and privacy verified; fixtures rolled back' as result;
