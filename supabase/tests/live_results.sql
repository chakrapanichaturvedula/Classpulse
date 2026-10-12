-- Run the whole script as the default SQL Editor administrator role.
-- All fixtures roll back inside the DO block, including if it is run alone.
begin;
do $test$
declare
 teacher_a uuid:=gen_random_uuid();teacher_b uuid:=gen_random_uuid();
 roster uuid;room uuid;name text:='ANS-'||upper(substr(md5(random()::text),1,12));
 doc jsonb;other_doc jsonb;session jsonb;entry jsonb;entry_two jsonb;feed jsonb;ack jsonb;
 q1 uuid;q2 uuid;q3 uuid;q4 uuid;foreign_q uuid;denied boolean;
begin
 begin
 insert into auth.users(id,email,raw_user_meta_data,is_anonymous) values
 (teacher_a,teacher_a::text||'@classpulse.invalid','{"full_name":"Answer Teacher A"}',false),
 (teacher_b,teacher_b::text||'@classpulse.invalid','{"full_name":"Answer Teacher B"}',false);
 execute 'set local role authenticated';
 perform set_config('request.jwt.claims',jsonb_build_object('sub',teacher_a,'is_anonymous',false)::text,true);
 insert into public.rosters(teacher_id,name) values(auth.uid(),'Answer fixture') returning id into roster;
 perform public.classpulse_import_roster(roster,'[{"id":"001","name":"Mira Devika Rao","emailid":""},{"id":"002","name":"Arjun Mehta","emailid":""}]');
 insert into public.rooms(teacher_id,roster_id,room_name) values(auth.uid(),roster,name) returning id into room;
 doc:=public.classpulse_save_quiz(null,null,'Answer quiz','[
 {"type":"multiple_choice","prompt":"An asset?","points":2,"options":["Cash","Loan"],"correct_position":1,"accepted_answers":[],"manual_grading":false},
 {"type":"true_false","prompt":"Test?","points":1,"options":["True","False"],"correct_position":1,"accepted_answers":[],"manual_grading":false},
 {"type":"short_answer","prompt":"Name an asset","points":3,"options":[],"correct_position":null,"accepted_answers":["Cash"],"manual_grading":false},
 {"type":"short_answer","prompt":"Explain","points":4,"options":[],"correct_position":null,"accepted_answers":[],"manual_grading":true}
 ]',null,null);
 session:=public.classpulse_launch_quiz(room,(doc->>'quiz_id')::uuid,(doc->>'version_id')::uuid,(doc->>'revision')::integer);
 select id into q1 from public.questions where quiz_version_id=(doc->>'version_id')::uuid and position=1;
 select id into q2 from public.questions where quiz_version_id=(doc->>'version_id')::uuid and position=2;
 select id into q3 from public.questions where quiz_version_id=(doc->>'version_id')::uuid and position=3;
 select id into q4 from public.questions where quiz_version_id=(doc->>'version_id')::uuid and position=4;
 other_doc:=public.classpulse_save_quiz(null,null,'Other quiz','[{"type":"true_false","prompt":"Other","points":1,"options":["True","False"],"correct_position":1,"accepted_answers":[],"manual_grading":false}]',null,null);
 select id into foreign_q from public.questions where quiz_version_id=(other_doc->>'version_id')::uuid;
 execute 'reset role';execute 'set local role anon';perform set_config('request.jwt.claims','{}',true);
 entry:=public.classpulse_student_join(name,'001');
 entry_two:=public.classpulse_student_join(name,'002');
 feed:=public.classpulse_student_question((entry->>'token')::uuid);
 if feed->>'status'<>'lobby' or feed->'question'<>'null'::jsonb then raise exception 'FAIL: question leaked before start';end if;
 denied:=false;
 begin perform public.classpulse_submit_answer((entry->>'token')::uuid,q1,1,null);exception when raise_exception then denied:=true;end;
 if not denied then raise exception 'FAIL: lobby accepted answer';end if;
 denied:=false;
 begin perform public.classpulse_start_session((session->>'id')::uuid);exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'FAIL: student started quiz';end if;
 execute 'reset role';execute 'set local role authenticated';
 perform set_config('request.jwt.claims',jsonb_build_object('sub',teacher_b,'is_anonymous',false)::text,true);
 denied:=false;
 begin perform public.classpulse_start_session((session->>'id')::uuid);exception when raise_exception then denied:=true;end;
 if not denied then raise exception 'FAIL: other teacher started quiz';end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',teacher_a,'is_anonymous',false)::text,true);
 perform public.classpulse_start_session((session->>'id')::uuid);
 perform public.classpulse_start_session((session->>'id')::uuid);
 execute 'reset role';execute 'set local role anon';perform set_config('request.jwt.claims','{}',true);
 feed:=public.classpulse_student_question((entry->>'token')::uuid);
 if feed->'question'->>'id'<>q1::text or feed->'question'?'correct_position' or feed->'question'?'accepted_answers' then raise exception 'FAIL: wrong question or answer-key exposure';end if;
 denied:=false;
 begin perform public.classpulse_submit_answer((entry->>'token')::uuid,q2,1,null);exception when raise_exception then denied:=true;end;
 if not denied then raise exception 'FAIL: skipped question';end if;
 denied:=false;
 begin perform public.classpulse_submit_answer((entry->>'token')::uuid,foreign_q,1,null);exception when raise_exception then denied:=true;end;
 if not denied then raise exception 'FAIL: wrong quiz question';end if;
 denied:=false;
 begin perform public.classpulse_submit_answer((entry->>'token')::uuid,q1,99,null);exception when raise_exception then denied:=true;end;
 if not denied then raise exception 'FAIL: invalid option';end if;
 denied:=false;
 begin perform public.classpulse_submit_answer(gen_random_uuid(),q1,1,null);exception when raise_exception then denied:=true;end;
 if not denied then raise exception 'FAIL: invalid token';end if;
 ack:=public.classpulse_submit_answer((entry->>'token')::uuid,q1,1,null);
 if ack<>'{"saved":true}'::jsonb then raise exception 'FAIL: acknowledgement exposes grading';end if;
 perform public.classpulse_submit_answer((entry->>'token')::uuid,q1,1,null);
 denied:=false;
 begin perform public.classpulse_submit_answer((entry->>'token')::uuid,q1,2,null);exception when raise_exception then denied:=true;end;
 if not denied then raise exception 'FAIL: submitted answer changed';end if;
 perform public.classpulse_submit_answer((entry->>'token')::uuid,q2,2,null);
 denied:=false;
 begin perform public.classpulse_submit_answer((entry->>'token')::uuid,q3,null,'   ');exception when raise_exception then denied:=true;end;
 if not denied then raise exception 'FAIL: empty short answer';end if;
 perform public.classpulse_submit_answer((entry->>'token')::uuid,q3,null,' cAsH ');
 -- Three automatically scored answers have now been saved.
 execute 'reset role';execute 'set local role authenticated';
 perform set_config('request.jwt.claims',jsonb_build_object('sub',teacher_a,'is_anonymous',false)::text,true);
 if (select count(*) from public.quiz_responses)<>3 or (select sum(awarded_points) from public.quiz_responses)<>5 then raise exception 'FAIL: response uniqueness or scoring';end if;
 denied:=false;
 begin update public.quiz_responses set awarded_points=100;exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'FAIL: direct score write';end if;
 execute 'reset role';execute 'set local role anon';perform set_config('request.jwt.claims','{}',true);
 perform public.classpulse_submit_answer((entry->>'token')::uuid,q4,null,'My explanation');
 feed:=public.classpulse_student_question((entry->>'token')::uuid);
 if public.classpulse_student_question((entry_two->>'token')::uuid)->>'answered'<>'0' or public.classpulse_student_question((entry_two->>'token')::uuid)->'question'->>'id'<>q1::text then raise exception 'FAIL: student progress isolation';end if;
 if feed->>'completed'<>'true' or feed->>'answered'<>'4' or feed->'question'<>'null'::jsonb then raise exception 'FAIL: completion';end if;
 denied:=false;
 begin perform 1 from public.quiz_responses;exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'FAIL: student reads response table';end if;
 execute 'reset role';execute 'set local role authenticated';
 perform set_config('request.jwt.claims',jsonb_build_object('sub',teacher_a,'is_anonymous',false)::text,true);
 feed:=public.classpulse_live_results((session->>'id')::uuid);
 if jsonb_array_length(feed->'students')<>2 or jsonb_array_length(feed->'questions')<>4 or jsonb_array_length(feed->'responses')<>4 then raise exception 'FAIL: result grid counts';end if;
 if feed->'students'->0?'email' or feed->'questions'->0?'correct_position' then raise exception 'FAIL: results return unnecessary email or key';end if;
 if not exists(select 1 from public.quiz_responses where question_id=q4 and is_correct is null and awarded_points is null) then raise exception 'FAIL: manual answer automatically graded';end if;
 perform public.classpulse_end_session((session->>'id')::uuid);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',teacher_b,'is_anonymous',false)::text,true);
 if exists(select 1 from public.quiz_responses) then raise exception 'FAIL: other teacher reads answers';end if;
 denied:=false;begin perform public.classpulse_live_results((session->>'id')::uuid);exception when raise_exception then denied:=true;end;
 if not denied then raise exception 'FAIL: other teacher reads results RPC';end if;
 execute 'reset role';execute 'set local role anon';perform set_config('request.jwt.claims','{}',true);
 denied:=false;begin perform public.classpulse_live_results((session->>'id')::uuid);exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'FAIL: student reads results RPC';end if;
 if public.classpulse_student_question((entry->>'token')::uuid)->>'status'<>'ended' then raise exception 'FAIL: ended status';end if;
 denied:=false;
 begin perform public.classpulse_submit_answer((entry->>'token')::uuid,q4,null,'Changed after end');exception when raise_exception then denied:=true;end;
 if not denied then raise exception 'FAIL: ended answer changed';end if;
 denied:=false;
 begin perform public.classpulse_submit_answer((entry_two->>'token')::uuid,q1,1,null);exception when raise_exception then denied:=true;end;
 if not denied then raise exception 'FAIL: ended session accepted a new answer';end if;
 execute 'reset role';execute 'set local role authenticated';
 perform set_config('request.jwt.claims',jsonb_build_object('sub',teacher_a,'is_anonymous',true)::text,true);
 denied:=false;begin perform public.classpulse_live_results((session->>'id')::uuid);exception when raise_exception then denied:=true;end;
 if not denied then raise exception 'FAIL: anonymous authenticated user reads results';end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',teacher_a,'is_anonymous',false)::text,true);
 if public.classpulse_live_results((session->>'id')::uuid)->>'status'<>'ended' then raise exception 'FAIL: ended results inaccessible';end if;
 execute 'reset role';execute 'set local role authenticated';
 perform set_config('request.jwt.claims',jsonb_build_object('sub',teacher_a,'is_anonymous',false)::text,true);
 -- Verify the matrix includes all 1,200 responses, beyond REST's usual row limit.
 perform public.classpulse_import_roster(roster,(select jsonb_agg(jsonb_build_object('id','GRID-'||i,'name','Grid Fixture '||i,'emailid','')) from generate_series(1,150) i));
 doc:=public.classpulse_save_quiz(null,null,'Grid capacity fixture',(select jsonb_agg(jsonb_build_object('type','true_false','prompt','Grid question '||i,'points',1,'options',jsonb_build_array('True','False'),'correct_position',1,'accepted_answers','[]'::jsonb,'manual_grading',false)) from generate_series(1,8) i),null,null);
 session:=public.classpulse_launch_quiz(room,(doc->>'quiz_id')::uuid,(doc->>'version_id')::uuid,(doc->>'revision')::integer);
 execute 'reset role';
 -- Seed read-test responses as administrator; public answer-write protection
 -- and server-side grading are checked separately above.
 insert into public.quiz_responses(session_id,student_id,teacher_id,quiz_version_id,question_id,option_position,is_correct,awarded_points)
 select (session->>'id')::uuid,p.student_id,teacher_a,(doc->>'version_id')::uuid,q.id,1,true,1
 from public.session_roster_students p cross join public.questions q
 where p.session_id=(session->>'id')::uuid and q.quiz_version_id=(doc->>'version_id')::uuid;
 execute 'set local role authenticated';
 perform set_config('request.jwt.claims',jsonb_build_object('sub',teacher_a,'is_anonymous',false)::text,true);
 feed:=public.classpulse_live_results((session->>'id')::uuid);
 if jsonb_array_length(feed->'students')<>150 or jsonb_array_length(feed->'responses')<>1200 then raise exception 'FAIL: grid truncated beyond 1000 responses';end if;
 execute 'reset role';
 raise exception using errcode='CP001',message='Rollback successful test fixtures';
 exception when sqlstate 'CP001' then null;
 end;
 if exists(select 1 from auth.users where id in(teacher_a,teacher_b)) then raise exception 'FAIL: fixture cleanup';end if;
end $test$;
rollback;
select 'PASS: live results, saved scores and teacher privacy verified; fixtures rolled back' as result;
