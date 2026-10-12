begin;
alter table public.quizzes add column source_kind text not null default 'library' check(source_kind in('library','quick'));
alter table public.quiz_sessions add column activity_type text not null default 'quiz' check(activity_type in('quiz','quick_mcq','quick_tf','word_cloud'));
alter table public.quiz_sessions add column launch_key text;
create unique index session_launch_retry_key on public.quiz_sessions(teacher_id,launch_key) where launch_key is not null;
create function public.classpulse_launch_quick(target_room uuid,activity_kind text,option_count integer,question_prompt text,request_key text)
returns jsonb language plpgsql security definer set search_path=''
as $$ declare caller uuid:=auth.uid();r public.rooms%rowtype;s public.quiz_sessions%rowtype;
 qid uuid;vid uuid;pid uuid;kind text;label text;prompt text;choices integer;i integer;doc jsonb;begin
 if caller is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'Sign in as a teacher.';end if;
 if activity_kind is null or activity_kind not in('quick_mcq','quick_tf','word_cloud') then raise exception 'Choose a quick-question type.';end if;
 if request_key is null or length(request_key) not between 1 and 100 then raise exception 'Reopen the quick-question dialog.';end if;
 prompt:=btrim(coalesce(question_prompt,''));if length(prompt)>4000 then raise exception 'Use a shorter question.';end if;
 choices:=case when activity_kind='quick_mcq' then option_count when activity_kind='quick_tf' then 2 else 0 end;
 if activity_kind='quick_mcq' and (choices is null or choices not between 2 and 6) then raise exception 'Choose 2 to 6 answer options.';end if;
 select * into r from public.rooms where id=target_room and teacher_id=caller for update;
 if not found then raise exception 'Choose one of your own classroom rooms.';end if;
 select * into s from public.quiz_sessions where teacher_id=caller and launch_key=request_key;
 if found then
  if s.room_id<>r.id or s.activity_type<>activity_kind then raise exception 'This launch request has already been used.';end if;
  return to_jsonb(s);
 end if;
 if exists(select 1 from public.quiz_sessions where room_id=r.id and status<>'ended') then raise exception 'End the current session in Live Results before launching another activity.';end if;
 kind:=case when activity_kind='quick_mcq' then 'multiple_choice' when activity_kind='quick_tf' then 'true_false' else 'short_answer' end;
 label:=case when activity_kind='quick_mcq' then 'Quick Question · Multiple Choice' when activity_kind='quick_tf' then 'Quick Question · True / False' else 'Quick Question · Word Cloud' end;
 if prompt='' then prompt:=case when activity_kind='word_cloud' then 'Answer your teacher’s question with one word or a short phrase.' else 'Answer the question your teacher asks. Choose an option below.' end;end if;
 insert into public.quizzes(teacher_id,title,source_kind) values(caller,label,'quick') returning id into qid;
 insert into public.quiz_versions(teacher_id,quiz_id,version_number,title) values(caller,qid,1,label) returning id into vid;
 insert into public.questions(teacher_id,quiz_version_id,question_type,prompt,position,points) values(caller,vid,kind,prompt,1,0) returning id into pid;
 for i in 1..choices loop
  insert into public.question_options(teacher_id,question_id,position,label) values(caller,pid,i,case when activity_kind='quick_tf' then case when i=1 then 'True' else 'False' end else chr(64+i) end);
 end loop;
 -- Opinion polls deliberately have no correct answer or marks.
 insert into private.question_answer_keys(question_id,teacher_id,manual_grading) values(pid,caller,true);
 update public.quiz_versions set status='published',published_at=now() where id=vid;
 doc:=public.classpulse_launch_quiz(r.id,qid,vid,1);
 update public.quiz_sessions set activity_type=activity_kind,launch_key=request_key,status='live' where id=(doc->>'id')::uuid returning * into s;
 return to_jsonb(s);
end $$;
revoke all on function public.classpulse_launch_quick(uuid,text,integer,text,text) from public,anon,authenticated;
grant execute on function public.classpulse_launch_quick(uuid,text,integer,text,text) to authenticated;

alter function public.classpulse_student_question(uuid) rename to classpulse_student_question_v1;
revoke all on function public.classpulse_student_question_v1(uuid) from public,anon,authenticated;
create function public.classpulse_student_question(entry_token uuid)
returns jsonb language plpgsql security definer set search_path=''
as $$ declare doc jsonb;kind text;begin
 doc:=public.classpulse_student_question_v1(entry_token);
 select s.activity_type into kind from private.student_entry_tokens t join public.quiz_sessions s on s.id=t.session_id where t.token=entry_token;
 return doc||jsonb_build_object('activity_type',kind);
end $$;
alter function public.classpulse_submit_answer(uuid,uuid,integer,text) rename to classpulse_submit_answer_v1;
revoke all on function public.classpulse_submit_answer_v1(uuid,uuid,integer,text) from public,anon,authenticated;
create function public.classpulse_submit_answer(entry_token uuid,target_question uuid,selected_option integer default null,response_text text default null)
returns jsonb language plpgsql security definer set search_path=''
as $$ declare kind text;begin
 select s.activity_type into kind from private.student_entry_tokens t join public.quiz_sessions s on s.id=t.session_id where t.token=entry_token;
 if kind='word_cloud' and (response_text is null or length(btrim(response_text)) not between 1 and 80) then raise exception 'Use one word or a short phrase, up to 80 characters.';end if;
 return public.classpulse_submit_answer_v1(entry_token,target_question,selected_option,response_text);
end $$;
alter function public.classpulse_live_results(uuid) rename to classpulse_live_results_v1;
revoke all on function public.classpulse_live_results_v1(uuid) from public,anon,authenticated;
create function public.classpulse_live_results(target_session uuid)
returns jsonb language plpgsql security definer set search_path=''
as $$ declare doc jsonb;kind text;begin
 doc:=public.classpulse_live_results_v1(target_session);
 select activity_type into kind from public.quiz_sessions where id=target_session;
 return doc||jsonb_build_object('activity_type',kind);
end $$;
revoke all on function public.classpulse_student_question(uuid) from public,anon,authenticated;
revoke all on function public.classpulse_submit_answer(uuid,uuid,integer,text) from public,anon,authenticated;
revoke all on function public.classpulse_live_results(uuid) from public,anon,authenticated;
grant execute on function public.classpulse_student_question(uuid) to anon,authenticated;
grant execute on function public.classpulse_submit_answer(uuid,uuid,integer,text) to anon,authenticated;
grant execute on function public.classpulse_live_results(uuid) to authenticated;
notify pgrst, 'reload schema';
commit;
