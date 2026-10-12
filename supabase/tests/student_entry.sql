-- Run this whole script. It creates fictional fixtures and rolls them back.
begin;
do $test$
declare
 teacher_a uuid:=gen_random_uuid(); teacher_b uuid:=gen_random_uuid();
 roster uuid; room uuid; doc jsonb; session jsonb;
 name text:='ENTRY-'||upper(substr(md5(random()::text),1,10));
 result jsonb; again jsonb; denied boolean;
begin
 begin
insert into auth.users(id,email,raw_user_meta_data,is_anonymous) values
(teacher_a,teacher_a::text||'@classpulse.invalid','{"full_name":"Entry Teacher A"}',false),
(teacher_b,teacher_b::text||'@classpulse.invalid','{"full_name":"Entry Teacher B"}',false);
execute 'set local role authenticated';
perform set_config('request.jwt.claims',jsonb_build_object('sub',teacher_a,'role','authenticated','is_anonymous',false)::text,true);
 insert into public.rosters(teacher_id,name) values(auth.uid(),'Entry fixture') returning id into roster;
 perform public.classpulse_import_roster(roster,'[{"id":"001Ab","name":"Mira Devika Rao","emailid":""},{"id":"002","name":"Arjun Mehta","emailid":""}]');
 insert into public.rooms(teacher_id,roster_id,room_name) values(auth.uid(),roster,name) returning id into room;
 doc:=public.classpulse_save_quiz(null,null,'Entry quiz','[{"type":"true_false","prompt":"Test?","points":1,"options":["True","False"],"correct_position":1,"accepted_answers":[],"manual_grading":false}]',null,null);
 session:=public.classpulse_launch_quiz(room,(doc->>'quiz_id')::uuid,(doc->>'version_id')::uuid,(doc->>'revision')::integer);
 -- Entry must use the saved session roster after this student is withdrawn.
 perform public.classpulse_import_roster(roster,'[{"id":"002","name":"Arjun Mehta","emailid":""}]');
execute 'reset role';
execute 'set local role anon';
perform set_config('request.jwt.claims','{}',true);
 result:=public.classpulse_student_join(lower(name),' 001ab ');
 if result->>'full_name'<>'Mira Devika Rao' or result->>'student_code'<>'001Ab' or result->>'status'<>'lobby' or result?'email' or result?'teacher_id' then raise exception 'FAIL: student summary or ID handling'; end if;
 again:=public.classpulse_student_join(name,'001Ab');
 if again->>'token'<>result->>'token' then raise exception 'FAIL: duplicate entry changed token'; end if;
 if public.classpulse_student_status((result->>'token')::uuid)->>'status'<>'lobby' then raise exception 'FAIL: waiting room status'; end if;
 if public.classpulse_student_status(gen_random_uuid()) is not null then raise exception 'FAIL: invalid token'; end if;
 denied:=false;
 begin perform public.classpulse_student_join(name,'1Ab'); exception when raise_exception then denied:=true; end;
 if not denied then raise exception 'FAIL: leading zeros ignored'; end if;
 denied:=false;
 begin perform public.classpulse_student_join('MISSING','001Ab'); exception when raise_exception then denied:=true; end;
 if not denied then raise exception 'FAIL: missing room accepted'; end if;
 denied:=false;
 begin perform 1 from public.session_roster_students; exception when insufficient_privilege then denied:=true; end;
 if not denied then raise exception 'FAIL: public roster access'; end if;
 denied:=false;
 begin perform 1 from private.student_entry_tokens; exception when insufficient_privilege then denied:=true; end;
 if not denied then raise exception 'FAIL: private token access'; end if;
 denied:=false;
 begin perform public.classpulse_end_session((session->>'id')::uuid); exception when insufficient_privilege then denied:=true; end;
 if not denied then raise exception 'FAIL: student session control'; end if;
execute 'reset role';
execute 'set local role authenticated';
perform set_config('request.jwt.claims',jsonb_build_object('sub',teacher_b,'role','authenticated','is_anonymous',false)::text,true);
 if (select count(*) from public.session_participants)<>0 then raise exception 'FAIL: other teacher participant access'; end if;
perform set_config('request.jwt.claims',jsonb_build_object('sub',teacher_a,'role','authenticated','is_anonymous',false)::text,true);
 if (select count(*) from public.session_participants)<>1 then raise exception 'FAIL: repeated joins duplicate participant'; end if;
 perform public.classpulse_end_session((session->>'id')::uuid);
execute 'reset role';
execute 'set local role anon';
perform set_config('request.jwt.claims','{}',true);
denied:=false;
 if public.classpulse_student_status((result->>'token')::uuid)->>'status'<>'ended' then raise exception 'FAIL: ended status'; end if;
 begin perform public.classpulse_student_join(name,'001Ab'); exception when raise_exception then denied:=true; end;
 if not denied then raise exception 'FAIL: ended session accepted entry'; end if;
execute 'reset role';
-- Deliberate exception rolls back all fixture writes, even if only this DO
-- block was executed. It does not catch test failures or permission errors.
raise exception using errcode='CP001', message='Rollback successful test fixtures';
 exception when sqlstate 'CP001' then null;
 end;
 if exists(select 1 from auth.users where id in(teacher_a,teacher_b)) then
  raise exception 'FAIL: test fixtures were not rolled back';
 end if;
end $test$;
rollback;
select 'PASS: student entry, roster checks, session status and privacy verified; fixtures rolled back' as result;
