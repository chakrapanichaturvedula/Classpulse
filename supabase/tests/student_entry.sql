begin;
insert into auth.users(id,email,raw_user_meta_data,is_anonymous) values
('00000000-0000-4000-8000-000000000501','entry-a@classpulse.invalid','{"full_name":"Entry Teacher A"}',false),
('00000000-0000-4000-8000-000000000502','entry-b@classpulse.invalid','{"full_name":"Entry Teacher B"}',false);
create temporary table entry_artifacts(label text primary key,value jsonb);
grant all on entry_artifacts to authenticated,anon;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000501","is_anonymous":false}',true);
do $$ declare roster uuid; room uuid; doc jsonb; session jsonb; name text:='ENTRY-'||upper(substr(md5(random()::text),1,10)); begin
 insert into public.rosters(teacher_id,name) values(auth.uid(),'Entry fixture') returning id into roster;
 perform public.classpulse_import_roster(roster,'[{"id":"001Ab","name":"Mira Devika Rao","emailid":""},{"id":"002","name":"Arjun Mehta","emailid":""}]');
 insert into public.rooms(teacher_id,roster_id,room_name) values(auth.uid(),roster,name) returning id into room;
 doc:=public.classpulse_save_quiz(null,null,'Entry quiz','[{"type":"true_false","prompt":"Test?","points":1,"options":["True","False"],"correct_position":1,"accepted_answers":[],"manual_grading":false}]',null,null);
 session:=public.classpulse_launch_quiz(room,(doc->>'quiz_id')::uuid,(doc->>'version_id')::uuid,(doc->>'revision')::integer);
 insert into entry_artifacts values('session',session),('room',to_jsonb(name));
 -- Entry must use the saved session roster after this student is withdrawn.
 perform public.classpulse_import_roster(roster,'[{"id":"002","name":"Arjun Mehta","emailid":""}]');
end $$;
reset role;
set local role anon;
select set_config('request.jwt.claims','{}',true);
do $$ declare result jsonb; again jsonb; room text:=(select value#>>'{}' from entry_artifacts where label='room'); denied boolean; begin
 result:=public.classpulse_student_join(lower(room),' 001ab ');
 if result->>'full_name'<>'Mira Devika Rao' or result->>'student_code'<>'001Ab' or result->>'status'<>'lobby' or result?'email' or result?'teacher_id' then raise exception 'FAIL: student summary or ID handling'; end if;
 again:=public.classpulse_student_join(room,'001Ab');
 if again->>'token'<>result->>'token' then raise exception 'FAIL: duplicate entry changed token'; end if;
 if public.classpulse_student_status((result->>'token')::uuid)->>'status'<>'lobby' then raise exception 'FAIL: waiting room status'; end if;
 if public.classpulse_student_status(gen_random_uuid()) is not null then raise exception 'FAIL: invalid token'; end if;
 denied:=false;
 begin perform public.classpulse_student_join(room,'1Ab'); exception when raise_exception then denied:=true; end;
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
 begin perform public.classpulse_end_session(((select value from entry_artifacts where label='session')->>'id')::uuid); exception when insufficient_privilege then denied:=true; end;
 if not denied then raise exception 'FAIL: student session control'; end if;
 insert into entry_artifacts values('entry',result);
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000502","is_anonymous":false}',true);
do $$ begin
 if (select count(*) from public.session_participants)<>0 then raise exception 'FAIL: other teacher participant access'; end if;
end $$;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000501","is_anonymous":false}',true);
do $$ begin
 if (select count(*) from public.session_participants)<>1 then raise exception 'FAIL: repeated joins duplicate participant'; end if;
 perform public.classpulse_end_session(((select value from entry_artifacts where label='session')->>'id')::uuid);
end $$;
reset role;
set local role anon;
select set_config('request.jwt.claims','{}',true);
do $$ declare denied boolean:=false; begin
 if public.classpulse_student_status(((select value from entry_artifacts where label='entry')->>'token')::uuid)->>'status'<>'ended' then raise exception 'FAIL: ended status'; end if;
 begin perform public.classpulse_student_join((select value#>>'{}' from entry_artifacts where label='room'),'001Ab'); exception when raise_exception then denied:=true; end;
 if not denied then raise exception 'FAIL: ended session accepted entry'; end if;
end $$;
reset role;
rollback;
select 'PASS: student entry, roster checks, session status and privacy verified; fixtures rolled back' as result;
