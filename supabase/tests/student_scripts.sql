-- Run the complete script as the default SQL Editor administrator role.
begin;
do $test$
declare a uuid:=gen_random_uuid();b uuid:=gen_random_uuid();roster uuid;room uuid;student uuid;outsider uuid:=gen_random_uuid();doc jsonb;s jsonb;quick jsonb;script jsonb;denied boolean;roomname text:='SCRIPT-'||upper(substr(md5(random()::text),1,10));
begin
 begin
 insert into auth.users(id,email,raw_user_meta_data,is_anonymous) values(a,a::text||'@classpulse.invalid','{"full_name":"Script A"}',false),(b,b::text||'@classpulse.invalid','{"full_name":"Script B"}',false);
 execute 'set local role authenticated';
 perform set_config('request.jwt.claims',jsonb_build_object('sub',a,'is_anonymous',false)::text,true);
 insert into public.rosters(teacher_id,name) values(a,roomname) returning id into roster;
 perform public.classpulse_import_roster(roster,'[{"id":"001","name":"Script Student","emailid":""},{"id":"002","name":"Other Student","emailid":""}]');
 insert into public.rooms(teacher_id,roster_id,room_name) values(a,roster,roomname) returning id into room;
 doc:=public.classpulse_save_quiz(null,null,'Historical quiz','[{"type":"multiple_choice","prompt":"Original question","points":2,"options":["Old key","Wrong"],"correct_position":1,"accepted_answers":[],"manual_grading":false}]',null,null);
 s:=public.classpulse_launch_quiz(room,(doc->>'quiz_id')::uuid,(doc->>'version_id')::uuid,(doc->>'revision')::integer);
 select student_id into student from public.session_roster_students where session_id=(s->>'id')::uuid and student_code_snapshot='001';
 denied:=false;begin perform public.classpulse_student_script((s->>'id')::uuid,student);exception when raise_exception then denied:=true;end;
 if not denied then raise exception 'FAIL: live/lobby export allowed';end if;
 perform public.classpulse_end_session((s->>'id')::uuid);
 script:=public.classpulse_student_script((s->>'id')::uuid,student);
 if jsonb_array_length(script->'students')<>1 or script->'students'->0->>'code'<>'001' or script->'questions'->0->>'correct_position'<>'1' or jsonb_array_length(script->'responses')<>0 then raise exception 'FAIL: single student or unanswered answer key';end if;
 execute 'reset role';
 -- Another student's response must never be included in this student's export.
 insert into public.quiz_responses(session_id,student_id,teacher_id,quiz_version_id,question_id,option_position,is_correct,awarded_points)
 select (s->>'id')::uuid,r.student_id,a,(s->>'quiz_version_id')::uuid,q.id,2,false,0
 from public.session_roster_students r cross join public.questions q
 where r.session_id=(s->>'id')::uuid and r.student_code_snapshot='002' and q.quiz_version_id=(s->>'quiz_version_id')::uuid;
 execute 'set local role authenticated';
 script:=public.classpulse_student_script((s->>'id')::uuid,student);
 if jsonb_array_length(script->'responses')<>0 then raise exception 'FAIL: other student responses leaked';end if;
 quick:=public.classpulse_launch_quick(room,'quick_tf',2,'Quick fixture','script-quick');
 perform public.classpulse_end_session((quick->>'id')::uuid);
 denied:=false;begin perform public.classpulse_student_script((quick->>'id')::uuid,student);exception when raise_exception then denied:=true;end;
 if not denied then raise exception 'FAIL: ungraded quick activity issued corrected script';end if;
 -- Changing the Library draft must not change an earlier session key.
 doc:=public.classpulse_save_quiz((doc->>'quiz_id')::uuid,null,'Changed quiz','[{"type":"multiple_choice","prompt":"New question","points":2,"options":["New wrong","New key"],"correct_position":2,"accepted_answers":[],"manual_grading":false}]',(doc->>'version_id')::uuid,(doc->>'revision')::integer);
 script:=public.classpulse_student_script((s->>'id')::uuid,student);
 if script->>'quiz_title'<>'Historical quiz' or script->'questions'->0->>'prompt'<>'Original question' or script->'questions'->0->>'correct_position'<>'1' then raise exception 'FAIL: historical quiz altered';end if;
 denied:=false;begin perform public.classpulse_student_script((s->>'id')::uuid,outsider);exception when raise_exception then denied:=true;end;
 if not denied then raise exception 'FAIL: wrong roster student allowed';end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',b,'is_anonymous',false)::text,true);
 denied:=false;begin perform public.classpulse_student_script((s->>'id')::uuid,student);exception when raise_exception then denied:=true;end;
 if not denied then raise exception 'FAIL: other teacher obtained answer keys';end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',a,'is_anonymous',true)::text,true);
 denied:=false;begin perform public.classpulse_student_script((s->>'id')::uuid,student);exception when raise_exception then denied:=true;end;
 if not denied then raise exception 'FAIL: anonymous authenticated access';end if;
 execute 'reset role';execute 'set local role anon';perform set_config('request.jwt.claims','{}',true);
 denied:=false;begin perform public.classpulse_student_script((s->>'id')::uuid,student);exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'FAIL: student accessed corrected key RPC';end if;
 execute 'reset role';
 raise exception using errcode='CP001',message='Rollback fixtures';
 exception when sqlstate 'CP001' then null;
 end;
 if exists(select 1 from auth.users where id in(a,b)) then raise exception 'FAIL: fixtures remain';end if;
end $test$;
rollback;
select 'PASS: corrected scripts, historical keys and teacher privacy verified; fixtures rolled back' as result;
