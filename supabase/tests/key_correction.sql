begin;
do $test$
declare has_email boolean:=to_regclass('private.report_email_jobs') is not null;a uuid:=gen_random_uuid();b uuid:=gen_random_uuid();roster uuid;room uuid;student uuid;other_student uuid;email_job uuid;mc uuid;sa uuid;manual uuid;tf uuid;doc jsonb;s jsonb;s2 jsonb;preview jsonb;script jsonb;denied boolean;label text:='KEY-'||upper(substr(md5(random()::text),1,10));
begin
 begin
 insert into auth.users(id,email,raw_user_meta_data,is_anonymous) values(a,a::text||'@classpulse.invalid','{"full_name":"Key A"}',false),(b,b::text||'@classpulse.invalid','{"full_name":"Key B"}',false);
 execute 'set local role authenticated';perform set_config('request.jwt.claims',jsonb_build_object('sub',a,'is_anonymous',false)::text,true);
 insert into public.rosters(teacher_id,name) values(a,label) returning id into roster;
 perform public.classpulse_import_roster(roster,'[{"id":"001","name":"One","emailid":"one@example.test"},{"id":"002","name":"Two","emailid":"two@example.test"}]');
 insert into public.rooms(teacher_id,roster_id,room_name) values(a,roster,label) returning id into room;
 doc:=public.classpulse_save_quiz(null,null,'Key quiz','[{"type":"multiple_choice","prompt":"Choose","points":2,"options":["A","B"],"correct_position":1,"accepted_answers":[],"manual_grading":false},{"type":"short_answer","prompt":"Colour","points":1,"options":[],"correct_position":null,"accepted_answers":["red"],"manual_grading":false},{"type":"short_answer","prompt":"Explain","points":1,"options":[],"correct_position":null,"accepted_answers":[],"manual_grading":true},{"type":"true_false","prompt":"True statement?","points":1,"options":["True","False"],"correct_position":1,"accepted_answers":[],"manual_grading":false}]',null,null);
 s:=public.classpulse_launch_quiz(room,(doc->>'quiz_id')::uuid,(doc->>'version_id')::uuid,(doc->>'revision')::integer);
 select student_id into student from public.session_roster_students where session_id=(s->>'id')::uuid and student_code_snapshot='001';
 select student_id into other_student from public.session_roster_students where session_id=(s->>'id')::uuid and student_code_snapshot='002';
 select id into mc from public.questions where quiz_version_id=(doc->>'version_id')::uuid and question_type='multiple_choice';
 select id into sa from public.questions where quiz_version_id=(doc->>'version_id')::uuid and position=2;
 select id into manual from public.questions where quiz_version_id=(doc->>'version_id')::uuid and position=3;
 select id into tf from public.questions where quiz_version_id=(doc->>'version_id')::uuid and position=4;
 denied:=false;begin perform public.classpulse_answer_keys((s->>'id')::uuid);exception when raise_exception then denied:=true;end;if not denied then raise exception 'FAIL: live key correction allowed';end if;
 perform public.classpulse_end_session((s->>'id')::uuid);
 s2:=public.classpulse_launch_quiz(room,(doc->>'quiz_id')::uuid,(doc->>'version_id')::uuid,(doc->>'revision')::integer);
 perform public.classpulse_end_session((s2->>'id')::uuid);
 execute 'reset role';
 insert into public.quiz_responses(session_id,student_id,teacher_id,quiz_version_id,question_id,option_position,answer_text,awarded_points,is_correct) values
 ((s->>'id')::uuid,student,a,(doc->>'version_id')::uuid,mc,1,null,2,true),
 ((s->>'id')::uuid,other_student,a,(doc->>'version_id')::uuid,mc,2,null,0,false),
 ((s->>'id')::uuid,student,a,(doc->>'version_id')::uuid,sa,null,'Blue',0,false),
 ((s2->>'id')::uuid,student,a,(doc->>'version_id')::uuid,mc,1,null,2,true);
 execute 'set local role authenticated';
 preview:=public.classpulse_preview_key_correction((s->>'id')::uuid,mc,2,'[]');
 if (preview->>'changed_students')::int<>2 then raise exception 'FAIL: preview score changes';end if;
 denied:=false;begin perform public.classpulse_apply_key_correction((s->>'id')::uuid,mc,2,'[]','stale','Fix');exception when raise_exception then denied:=true;end;if not denied then raise exception 'FAIL: stale preview accepted';end if;
 if has_email then
 execute 'reset role';
 insert into private.report_email_jobs(teacher_id,session_id,student_id,recipient,fingerprint,status,script_snapshot,payload) values(a,(s->>'id')::uuid,student,'one@example.test','fixture','sending','{}','{}');
 execute 'set local role authenticated';
 denied:=false;begin perform public.classpulse_apply_key_correction((s->>'id')::uuid,mc,2,'[]',preview->>'token','Fix');exception when raise_exception then denied:=true;end;if not denied then raise exception 'FAIL: correction during email send';end if;
 execute 'reset role';update private.report_email_jobs set status='queued' where session_id=(s->>'id')::uuid;execute 'set local role authenticated';
 end if;
 perform public.classpulse_apply_key_correction((s->>'id')::uuid,mc,2,'[]',preview->>'token','Correct option B');
 if has_email then
 execute 'reset role';if exists(select 1 from private.report_email_jobs where session_id=(s->>'id')::uuid and (status<>'failed' or script_snapshot is not null or payload is not null)) then raise exception 'FAIL: stale email attachment retained';end if;
 select id into email_job from private.report_email_jobs where session_id=(s->>'id')::uuid;execute 'set local role service_role';if public.classpulse_claim_report_email(email_job,100)?'claimed' then raise exception 'FAIL: stale attachment send claim';end if;execute 'reset role';execute 'set local role authenticated';
 end if;
 if (select awarded_points from public.quiz_responses where session_id=(s->>'id')::uuid and student_id=student and question_id=mc)<>0 or (select awarded_points from public.quiz_responses where session_id=(s->>'id')::uuid and student_id=other_student and question_id=mc)<>2 then raise exception 'FAIL: wrong regrade';end if;
 if (select awarded_points from public.quiz_responses where session_id=(s2->>'id')::uuid and student_id=student and question_id=mc)<>2 then raise exception 'FAIL: other exam changed';end if;
 script:=public.classpulse_student_script((s->>'id')::uuid,student);
 if script->'questions'->0->>'correct_position'<>'2' or script->>'key_corrected_at' is null then raise exception 'FAIL: corrected script key or timestamp';end if;
 if public.classpulse_student_script((s2->>'id')::uuid,student)->'questions'->0->>'correct_position'<>'1' then raise exception 'FAIL: original version key changed';end if;
 preview:=public.classpulse_preview_key_correction((s->>'id')::uuid,sa,null,'[" Blue ","blue","azure"]');
 if preview->'new_key'->'accepted_answers'<>'["Blue","azure"]'::jsonb then raise exception 'FAIL: alias cleanup';end if;
 perform public.classpulse_grade_short_answer((s->>'id')::uuid,student,sa,0.5,'Partial',0,null);
 denied:=false;begin perform public.classpulse_apply_key_correction((s->>'id')::uuid,sa,null,'[" Blue ","blue","azure"]',preview->>'token','Alias');exception when raise_exception then denied:=true;end;if not denied then raise exception 'FAIL: intervening grade overwrote preview';end if;
 preview:=public.classpulse_preview_key_correction((s->>'id')::uuid,sa,null,'[" Blue ","blue","azure"]');
 if (preview->>'manual_adjustments')::int<>1 then raise exception 'FAIL: manual adjustment warning';end if;
 perform public.classpulse_apply_key_correction((s->>'id')::uuid,sa,null,'[" Blue ","blue","azure"]',preview->>'token','Accept blue');
 if (select awarded_points<>1 or answer_text<>'Blue' or teacher_comment is not null from public.quiz_responses where session_id=(s->>'id')::uuid and question_id=sa) then raise exception 'FAIL: alias grading, answer preservation or feedback';end if;
 execute 'reset role';insert into public.quiz_responses(session_id,student_id,teacher_id,quiz_version_id,question_id,option_position,awarded_points,is_correct) values((s->>'id')::uuid,student,a,(doc->>'version_id')::uuid,tf,2,0,false);execute 'set local role authenticated';
 preview:=public.classpulse_preview_key_correction((s->>'id')::uuid,tf,2,'[]');perform public.classpulse_apply_key_correction((s->>'id')::uuid,tf,2,'[]',preview->>'token','False is correct');
 if (select awarded_points<>1 or not is_correct from public.quiz_responses where session_id=(s->>'id')::uuid and question_id=tf) then raise exception 'FAIL: true/false correction';end if;
 denied:=false;begin perform public.classpulse_preview_key_correction((s->>'id')::uuid,manual,null,'["answer"]');exception when raise_exception then denied:=true;end;if not denied then raise exception 'FAIL: manual question automatic grading allowed';end if;
 denied:=false;begin perform public.classpulse_preview_key_correction((s->>'id')::uuid,mc,99,'[]');exception when raise_exception then denied:=true;end;if not denied then raise exception 'FAIL: missing option accepted';end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',b,'is_anonymous',false)::text,true);
 denied:=false;begin perform public.classpulse_answer_keys((s->>'id')::uuid);exception when raise_exception then denied:=true;end;if not denied then raise exception 'FAIL: foreign teacher reads keys';end if;
 denied:=false;begin perform public.classpulse_apply_key_correction((s->>'id')::uuid,mc,1,'[]','x','Fix');exception when raise_exception then denied:=true;end;if not denied then raise exception 'FAIL: foreign teacher corrects key';end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',a,'is_anonymous',true)::text,true);
 denied:=false;begin perform public.classpulse_answer_keys((s->>'id')::uuid);exception when raise_exception then denied:=true;end;if not denied then raise exception 'FAIL: anonymous reads keys';end if;
 execute 'reset role';execute 'set local role anon';perform set_config('request.jwt.claims','{}',true);
 denied:=false;begin perform public.classpulse_answer_keys((s->>'id')::uuid);exception when insufficient_privilege then denied:=true;end;if not denied then raise exception 'FAIL: student reads keys';end if;
 execute 'reset role';
 if (select count(*) from private.answer_key_corrections where session_id=(s->>'id')::uuid)<>3 then raise exception 'FAIL: audit rollback';end if;
 raise exception using errcode='CP001',message='Rollback fixtures';
 exception when sqlstate 'CP001' then null;
 end;
 if exists(select 1 from auth.users where id in(a,b)) then raise exception 'FAIL: fixtures remain';end if;
end $test$;
rollback;
select 'PASS: exam key correction, preview conflicts, saved scripts and teacher privacy verified; fixtures rolled back' as result;
