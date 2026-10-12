begin;
insert into auth.users(id,email,raw_user_meta_data,is_anonymous) values
('00000000-0000-4000-8000-000000000401','launch-a@classpulse.invalid','{"full_name":"Launch Teacher A"}',false),
('00000000-0000-4000-8000-000000000402','launch-b@classpulse.invalid','{"full_name":"Launch Teacher B"}',false),
('00000000-0000-4000-8000-000000000403',null,'{}',true);
create temporary table launch_test_artifacts(label text primary key,value jsonb);
grant all on launch_test_artifacts to authenticated;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000402","role":"authenticated","is_anonymous":false}',true);
do $$ declare class_id uuid; room_id uuid; begin
 insert into public.rosters(teacher_id,name) values(auth.uid(),'Other class') returning id into class_id;
 insert into public.rooms(teacher_id,roster_id,room_name) values(auth.uid(),class_id,'CHECK-'||upper(substr(md5(random()::text),1,10))) returning id into room_id;
 insert into launch_test_artifacts values('other_room',to_jsonb(room_id));
end $$;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000401","role":"authenticated","is_anonymous":false}',true);
do $$ declare class_id uuid; room_id uuid; doc jsonb; empty_doc jsonb; session jsonb; newer jsonb; denied boolean; again jsonb;
 payload jsonb:='[{"type":"multiple_choice","prompt":"Choose an asset.","points":1,"options":["Cash","Loan"],"correct_position":1,"accepted_answers":[],"manual_grading":false}]';
 begin
 insert into public.rosters(teacher_id,name) values(auth.uid(),'Section A') returning id into class_id;
 perform public.classpulse_import_roster(class_id,'[{"id":"001","name":"Mira Devika Rao","emailid":""},{"id":"002","name":"Arjun Mehta","emailid":""}]');
 insert into public.rooms(teacher_id,roster_id,room_name) values(auth.uid(),class_id,'CHECK-'||upper(substr(md5(random()::text),1,10))) returning id into room_id;
 empty_doc:=public.classpulse_save_quiz(null,null,'Incomplete','[]',null,null);
 denied:=false;
 begin perform public.classpulse_launch_quiz(room_id,(empty_doc->>'quiz_id')::uuid,(empty_doc->>'version_id')::uuid,(empty_doc->>'revision')::integer); exception when raise_exception then denied:=true; end;
 if not denied or exists(select 1 from public.quiz_sessions) then raise exception 'FAIL: incomplete launch created a session'; end if;
 doc:=public.classpulse_save_quiz(null,null,'Asset check',payload,null,null);
 denied:=false;
 begin perform public.classpulse_launch_quiz(((select value from launch_test_artifacts where label='other_room')#>>'{}')::uuid,(doc->>'quiz_id')::uuid,(doc->>'version_id')::uuid,(doc->>'revision')::integer); exception when raise_exception then denied:=true; end;
 if not denied then raise exception 'FAIL: launched into another teacher room'; end if;
 session:=public.classpulse_launch_quiz(room_id,(doc->>'quiz_id')::uuid,(doc->>'version_id')::uuid,(doc->>'revision')::integer);
 if session->>'student_count'<>'2' or session->>'status'<>'lobby' then raise exception 'FAIL: room launch or roster count'; end if;
 if (select count(*) from public.session_roster_students)<>2 or not exists(select 1 from public.quiz_versions where id=(doc->>'version_id')::uuid and status='published') then raise exception 'FAIL: quiz and roster snapshot'; end if;
 again:=public.classpulse_launch_quiz(room_id,(doc->>'quiz_id')::uuid,(doc->>'version_id')::uuid,(doc->>'revision')::integer);
 if again->>'id'<>session->>'id' or (select count(*) from public.quiz_sessions)<>1 then raise exception 'FAIL: repeated launch created duplicate session'; end if;
 newer:=public.classpulse_save_quiz((doc->>'quiz_id')::uuid,null,'Edited source',jsonb_set(payload,'{0,prompt}','"A new prompt"'),(doc->>'version_id')::uuid,(doc->>'revision')::integer);
 perform public.classpulse_import_roster(class_id,'[{"id":"001","name":"Mira Devika Rao","emailid":""}]');
 if (select count(*) from public.session_roster_students)<>2 or not exists(select 1 from public.questions where quiz_version_id=(session->>'quiz_version_id')::uuid and prompt='Choose an asset.') then raise exception 'FAIL: source edits changed session copy'; end if;
 denied:=false;
 begin perform public.classpulse_launch_quiz(room_id,(newer->>'quiz_id')::uuid,(newer->>'version_id')::uuid,(newer->>'revision')::integer); exception when raise_exception then denied:=true; end;
 if not denied then raise exception 'FAIL: replaced active room session'; end if;
 denied:=false;
 begin update public.quiz_sessions set status='ended',ended_at=now(); exception when insufficient_privilege then denied:=true; end;
 if not denied then raise exception 'FAIL: direct session write'; end if;
 insert into launch_test_artifacts values('session',session);
 perform public.classpulse_end_session((session->>'id')::uuid);
 perform public.classpulse_end_session((session->>'id')::uuid);
 again:=public.classpulse_launch_quiz(room_id,(newer->>'quiz_id')::uuid,(newer->>'version_id')::uuid,(newer->>'revision')::integer);
 if again->>'id'=session->>'id' or again->>'student_count'<>'1' then raise exception 'FAIL: new launch did not use current saved roster'; end if;
end $$;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000402","role":"authenticated","is_anonymous":false}',true);
do $$ declare denied boolean:=false; begin
 if (select count(*) from public.quiz_sessions)<>0 or (select count(*) from public.session_roster_students)<>0 then raise exception 'FAIL: teacher reads another session'; end if;
 begin perform public.classpulse_end_session(((select value from launch_test_artifacts where label='session')->>'id')::uuid); exception when raise_exception then denied:=true; end;
 if not denied then raise exception 'FAIL: ended another teacher session'; end if;
end $$;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000403","role":"authenticated","is_anonymous":true}',true);
do $$ begin
 if (select count(*) from public.rooms)<>0 or (select count(*) from public.session_roster_students)<>0 then raise exception 'FAIL: anonymous student reads teacher room data'; end if;
end $$;
reset role;
rollback;
select 'PASS: classroom launch, session copies and teacher isolation verified; fixtures rolled back' as result;