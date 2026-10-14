begin;
do $test$
declare a uuid:=gen_random_uuid();b uuid:=gen_random_uuid();roster uuid;room uuid;sa uuid;sb uuid;doc jsonb;s jsonb;preview jsonb;c jsonb;job jsonb;claim jsonb;again jsonb;denied boolean;fp text;label text:='EMAIL-'||upper(substr(md5(random()::text),1,10));
begin
 begin
 insert into private.faculty_approvals(email) values(a::text||'@classpulse.invalid'),(b::text||'@classpulse.invalid');
 insert into auth.users(id,email,raw_user_meta_data,is_anonymous) values(a,a::text||'@classpulse.invalid','{"full_name":"Email A"}',false),(b,b::text||'@classpulse.invalid','{"full_name":"Email B"}',false);
 execute 'set local role authenticated';perform set_config('request.jwt.claims',jsonb_build_object('sub',a,'is_anonymous',false)::text,true);
 insert into public.rosters(teacher_id,name) values(a,label) returning id into roster;
 perform public.classpulse_import_roster(roster,'[{"id":"001","name":"Faculty A","emailid":"a@classpulse.invalid"},{"id":"002","name":"Faculty B","emailid":"b@classpulse.invalid"},{"id":"003","name":"Missing Email","emailid":""},{"id":"004","name":"Not Joined","emailid":"c@classpulse.invalid"}]');
 insert into public.rooms(teacher_id,roster_id,room_name) values(a,roster,label) returning id into room;
 doc:=public.classpulse_save_quiz(null,null,'Email quiz','[{"type":"short_answer","prompt":"Explain","points":3,"options":[],"correct_position":null,"accepted_answers":[],"manual_grading":true}]',null,null);
 s:=public.classpulse_launch_quiz(room,(doc->>'quiz_id')::uuid,(doc->>'version_id')::uuid,(doc->>'revision')::integer);
 denied:=false;begin perform public.classpulse_email_recipients((s->>'id')::uuid);exception when raise_exception then denied:=true;end;if not denied then raise exception 'FAIL: active email preview';end if;
 perform public.classpulse_end_session((s->>'id')::uuid);
 select student_id into sa from public.session_roster_students where session_id=(s->>'id')::uuid and student_code_snapshot='001';select student_id into sb from public.session_roster_students where session_id=(s->>'id')::uuid and student_code_snapshot='002';
 execute 'reset role';
 insert into public.session_participants(session_id,student_id,teacher_id) select session_id,student_id,teacher_id from public.session_roster_students where session_id=(s->>'id')::uuid and student_code_snapshot<>'004';
 insert into public.quiz_responses(session_id,student_id,teacher_id,quiz_version_id,question_id,answer_text,awarded_points,is_correct)
 select (s->>'id')::uuid,st.student_id,a,(doc->>'version_id')::uuid,q.id,'Answer for '||st.student_code_snapshot,case when st.student_code_snapshot='001' then 2 else null end,false
 from public.session_roster_students st cross join public.questions q where st.session_id=(s->>'id')::uuid and st.student_code_snapshot in('001','002') and q.quiz_version_id=(doc->>'version_id')::uuid;
 execute 'set local role authenticated';
 preview:=public.classpulse_email_recipients((s->>'id')::uuid);if jsonb_array_length(preview)<>4 then raise exception 'FAIL: email roster';end if;
 select value into c from jsonb_array_elements(preview) where value->>'code'='001';if c->>'email'<>'a@classpulse.invalid' or c->>'status'<>'ready' then raise exception 'FAIL: valid recipient';end if;fp:=c->>'fingerprint';
 if exists(select 1 from jsonb_array_elements(preview) x where x->>'code'<>'001' and x->>'status'<>'ineligible') then raise exception 'FAIL: pending, absent or missing email permitted';end if;
 denied:=false;begin perform public.classpulse_prepare_report_email((s->>'id')::uuid,sa,'stale');exception when raise_exception then denied:=true;end;if not denied then raise exception 'FAIL: stale report accepted';end if;
 job:=public.classpulse_prepare_report_email((s->>'id')::uuid,sa,fp);again:=public.classpulse_prepare_report_email((s->>'id')::uuid,sa,fp);if job->>'job_id'<>again->>'job_id' then raise exception 'FAIL: duplicate email job';end if;
 denied:=false;begin perform public.classpulse_claim_report_email((job->>'job_id')::uuid,100);exception when insufficient_privilege then denied:=true;end;if not denied then raise exception 'FAIL: browser obtained private email claim';end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',b,'is_anonymous',false)::text,true);
 denied:=false;begin perform public.classpulse_email_recipients((s->>'id')::uuid);exception when raise_exception then denied:=true;end;if not denied then raise exception 'FAIL: other teacher preview';end if;
 denied:=false;begin perform public.classpulse_prepare_report_email((s->>'id')::uuid,sa,fp);exception when raise_exception then denied:=true;end;if not denied then raise exception 'FAIL: other teacher queued email';end if;
 execute 'reset role';execute 'set local role service_role';
 claim:=public.classpulse_claim_report_email((job->>'job_id')::uuid,1);
 if claim->>'recipient'<>'a@classpulse.invalid' or jsonb_array_length(claim->'script_snapshot'->'students')<>1 or claim->'script_snapshot'->'students'->0->>'id'<>sa::text then raise exception 'FAIL: wrong student attachment';end if;
 again:=public.classpulse_claim_report_email((job->>'job_id')::uuid,1);if again?'claimed' then raise exception 'FAIL: two email senders claimed job';end if;
 denied:=false;begin perform public.classpulse_finish_report_email((job->>'job_id')::uuid,gen_random_uuid(),'accepted','fake-id',null);exception when raise_exception then denied:=true;end;if not denied then raise exception 'FAIL: wrong completion token';end if;
 perform public.classpulse_store_email_payload((job->>'job_id')::uuid,(claim->>'attempt_token')::uuid,'moosend','{"to":["a@classpulse.invalid"]}');
 perform public.classpulse_finish_report_email((job->>'job_id')::uuid,(claim->>'attempt_token')::uuid,'accepted','fake-id',null);
 again:=public.classpulse_claim_report_email((job->>'job_id')::uuid,1);if again->>'status'<>'accepted' or again?'claimed' then raise exception 'FAIL: accepted email resent';end if;
 execute 'reset role';
 if exists(select 1 from private.report_email_jobs where id=(job->>'job_id')::uuid and (payload is not null or script_snapshot is not null)) then raise exception 'FAIL: accepted payload retention';end if;
 update public.quiz_responses set awarded_points=3 where session_id=(s->>'id')::uuid and student_id=sb;
 execute 'set local role authenticated';perform set_config('request.jwt.claims',jsonb_build_object('sub',a,'is_anonymous',false)::text,true);
 preview:=public.classpulse_email_recipients((s->>'id')::uuid);select value into c from jsonb_array_elements(preview) where value->>'code'='002';
 job:=public.classpulse_prepare_report_email((s->>'id')::uuid,sb,c->>'fingerprint');
 execute 'reset role';execute 'set local role service_role';
 denied:=false;begin perform public.classpulse_claim_report_email((job->>'job_id')::uuid,1);exception when raise_exception then denied:=true;end;if not denied then raise exception 'FAIL: daily quota not enforced';end if;
 claim:=public.classpulse_claim_report_email((job->>'job_id')::uuid,100);perform public.classpulse_finish_report_email((job->>'job_id')::uuid,(claim->>'attempt_token')::uuid,'unknown',null,'Test uncertain outcome');
 again:=public.classpulse_claim_report_email((job->>'job_id')::uuid,100);if again->>'status'<>'unknown' or again?'claimed' then raise exception 'FAIL: uncertain email blindly retried';end if;
 execute 'reset role';execute 'set local role anon';perform set_config('request.jwt.claims','{}',true);
 denied:=false;begin perform public.classpulse_email_recipients((s->>'id')::uuid);exception when insufficient_privilege then denied:=true;end;if not denied then raise exception 'FAIL: student viewed recipient emails';end if;
 execute 'reset role';raise exception using errcode='CP001',message='Rollback fixtures';
 exception when sqlstate 'CP001' then null;
 end;
 if exists(select 1 from auth.users where id in(a,b)) then raise exception 'FAIL: fixtures remain';end if;
end $test$;
rollback;
select 'PASS: Moosend payloads, report recipients, duplicates, quota and privacy verified; fixtures rolled back' as result;
