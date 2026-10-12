begin;
insert into auth.users(id,email,raw_user_meta_data,is_anonymous) values
('00000000-0000-4000-8000-000000000301','quiz-a@classpulse.invalid','{"full_name":"Quiz Teacher A"}',false),
('00000000-0000-4000-8000-000000000302','quiz-b@classpulse.invalid','{"full_name":"Quiz Teacher B"}',false),
('00000000-0000-4000-8000-000000000303',null,'{}',true);
create temporary table quiz_test_artifacts(label text primary key,value jsonb);
grant all on quiz_test_artifacts to authenticated;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000302","role":"authenticated","is_anonymous":false}',true);
do $$ declare fid uuid; doc jsonb; begin
 insert into public.quiz_folders(teacher_id,name) values(auth.uid(),'Other teacher folder') returning id into fid;
 doc:=public.classpulse_save_quiz(null,fid,'Other teacher quiz','[]',null,null);
 insert into quiz_test_artifacts values('other',doc);
end $$;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000301","role":"authenticated","is_anonymous":false}',true);
do $$ declare root_id uuid; child_id uuid; doc jsonb; published jsonb; newer jsonb; empty_doc jsonb; denied boolean; affected integer;
 payload jsonb:='[{"type":"multiple_choice","prompt":"Which is an asset?","points":2,"options":["Cash","Loan"],"correct_position":1,"accepted_answers":[],"manual_grading":false},{"type":"true_false","prompt":"Cash is an asset.","points":1,"options":["True","False"],"correct_position":1,"accepted_answers":[],"manual_grading":false},{"type":"short_answer","prompt":"Name an asset.","points":3,"options":[],"correct_position":null,"accepted_answers":["cash","equipment"],"manual_grading":false}]';
 begin
 insert into public.quiz_folders(teacher_id,name) values(auth.uid(),'First Year') returning id into root_id;
 insert into public.quiz_folders(teacher_id,parent_id,name) values(auth.uid(),root_id,'Finance') returning id into child_id;
 if (select count(*) from public.quiz_folders)<>2 then raise exception 'FAIL: folder isolation'; end if;
 denied:=false;
 begin insert into public.quiz_folders(teacher_id,parent_id,name) values(auth.uid(),((select value from quiz_test_artifacts where label='other')->>'folder_id')::uuid,'Cross tenant'); exception when foreign_key_violation then denied:=true; end;
 if not denied then raise exception 'FAIL: cross-teacher subfolder'; end if;
 empty_doc:=public.classpulse_save_quiz(null,child_id,'Incomplete draft','[]',null,null);
 denied:=false;
 begin perform public.classpulse_publish_quiz((empty_doc->>'version_id')::uuid,(empty_doc->>'revision')::integer); exception when raise_exception then denied:=true; end;
 if not denied then raise exception 'FAIL: empty quiz published'; end if;
 doc:=public.classpulse_save_quiz(null,child_id,'Asset check',payload,null,null);
 if jsonb_array_length(doc->'questions')<>3 or doc#>>'{questions,0,correct_position}'<>'1' or doc#>>'{questions,2,accepted_answers,0}'<>'cash' then raise exception 'FAIL: questions or answer keys did not round-trip'; end if;
 denied:=false;
 begin perform count(*) from private.question_answer_keys; exception when insufficient_privilege then denied:=true; end;
 if not denied then raise exception 'FAIL: direct answer-key access'; end if;
 published:=public.classpulse_publish_quiz((doc->>'version_id')::uuid,(doc->>'revision')::integer);
 if published->>'status'<>'published' then raise exception 'FAIL: publication status'; end if;
 insert into quiz_test_artifacts values('published',published);
 newer:=public.classpulse_save_quiz((doc->>'quiz_id')::uuid,child_id,'Asset check revised',payload,(published->>'version_id')::uuid,(published->>'revision')::integer);
 if newer->>'status'<>'draft' or newer->>'version_number'<>'2' or newer->>'version_id'=published->>'version_id' then raise exception 'FAIL: published edit did not create separate draft'; end if;
 if not exists(select 1 from public.quiz_versions where id=(published->>'version_id')::uuid and status='published' and title='Asset check') then raise exception 'FAIL: historical published version changed'; end if;
 denied:=false;
 begin perform public.classpulse_save_quiz((doc->>'quiz_id')::uuid,child_id,'Stale edit',payload,(published->>'version_id')::uuid,(published->>'revision')::integer); exception when raise_exception then denied:=true; end;
 if not denied then raise exception 'FAIL: stale edit overwritten'; end if;
 denied:=false;
 begin perform public.classpulse_save_quiz((doc->>'quiz_id')::uuid,child_id,'Invalid points',jsonb_set(payload,'{0,points}','-1'),(newer->>'version_id')::uuid,(newer->>'revision')::integer); exception when raise_exception then denied:=true; end;
 if not denied or (public.classpulse_get_quiz((doc->>'quiz_id')::uuid)->>'revision')<>newer->>'revision' then raise exception 'FAIL: invalid save was not atomic'; end if;
 denied:=false;
 begin perform public.classpulse_get_quiz(((select value from quiz_test_artifacts where label='other')->>'quiz_id')::uuid); exception when raise_exception then denied:=true; end;
 if not denied then raise exception 'FAIL: read another teacher quiz'; end if;
 denied:=false;
 begin perform public.classpulse_save_quiz(null,((select value from quiz_test_artifacts where label='other')->>'folder_id')::uuid,'Forged folder',payload,null,null); exception when raise_exception then denied:=true; end;
 if not denied then raise exception 'FAIL: used another teacher folder'; end if;
 denied:=false;
 begin update public.questions set prompt='Bypass'; exception when insufficient_privilege then denied:=true; end;
 if not denied then raise exception 'FAIL: direct question write'; end if;
end $$;
reset role;
-- Check immutable triggers even with administrative table access.
do $$ declare published jsonb; denied boolean; begin
 select value into published from quiz_test_artifacts where label='published';
 denied:=false;
 begin update public.questions set prompt='Changed history' where quiz_version_id=(published->>'version_id')::uuid; exception when raise_exception then denied:=true; end;
 if not denied then raise exception 'FAIL: published question changed'; end if;
 denied:=false;
 begin update private.question_answer_keys set correct_position=2 where question_id in(select id from public.questions where quiz_version_id=(published->>'version_id')::uuid); exception when raise_exception then denied:=true; end;
 if not denied then raise exception 'FAIL: published answer key changed'; end if;
 denied:=false;
 begin update public.quiz_versions set title='Changed history' where id=(published->>'version_id')::uuid; exception when raise_exception then denied:=true; end;
 if not denied then raise exception 'FAIL: published version changed'; end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000303","role":"authenticated","is_anonymous":true}',true);
do $$ declare denied boolean:=false; begin
 if (select count(*) from public.quiz_folders)<>0 or (select count(*) from public.questions)<>0 then raise exception 'FAIL: anonymous student sees teacher content'; end if;
 begin perform public.classpulse_get_quiz(((select value from quiz_test_artifacts where label='published')->>'quiz_id')::uuid); exception when raise_exception then denied:=true; end;
 if not denied then raise exception 'FAIL: anonymous student reads answer keys'; end if;
end $$;
reset role;
rollback;
select 'PASS: quiz ownership, answer privacy and published versions verified; fixtures rolled back' as result;