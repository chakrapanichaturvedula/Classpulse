begin;
create table if not exists private.report_email_jobs(
 id uuid primary key default gen_random_uuid(),teacher_id uuid not null,session_id uuid not null,student_id uuid not null,
 recipient text not null,fingerprint text not null,script_snapshot jsonb,payload jsonb,provider text,
 status text not null default 'queued' check(status in('queued','sending','accepted','failed','unknown')),
 attempt_token uuid,claimed_at timestamptz,provider_message_id text,error_message text,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(session_id,student_id,fingerprint),foreign key(session_id,student_id,teacher_id) references public.session_roster_students(session_id,student_id,teacher_id)
);
alter table private.report_email_jobs enable row level security;
revoke all on private.report_email_jobs from public,anon,authenticated;
create or replace function private.classpulse_email_content(target_session uuid,target_student uuid)
returns jsonb language plpgsql security definer set search_path='' as $$ declare doc jsonb;recipient text;begin
 doc:=public.classpulse_student_script(target_session,target_student);
 if not(doc->'students'->0->>'joined')::boolean and jsonb_array_length(doc->'responses')=0 then raise exception 'This student did not participate.';end if;
 if exists(select 1 from jsonb_array_elements(doc->'responses') r where r->'awarded_points'='null'::jsonb) then raise exception 'Finish marking before emailing this script.';end if;
 select lower(btrim(email_snapshot)) into recipient from public.session_roster_students where session_id=target_session and student_id=target_student and teacher_id=auth.uid();
 if recipient is null or recipient !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'This student needs a valid email address in the saved session roster.';end if;
 return jsonb_build_object('script',doc,'recipient',recipient,'fingerprint',md5(doc::text||recipient));
end $$;
revoke all on function private.classpulse_email_content(uuid,uuid) from public,anon,authenticated;
create or replace function public.classpulse_email_recipients(target_session uuid)
returns jsonb language plpgsql security definer set search_path='' as $$ declare s public.quiz_sessions%rowtype;st public.session_roster_students%rowtype;c jsonb;status text;reason text;outrows jsonb:='[]';begin
 if auth.uid() is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'Sign in as a teacher.';end if;
 select * into s from public.quiz_sessions where id=target_session and teacher_id=auth.uid();if not found then raise exception 'This report is not available to your account.';end if;
 if s.status<>'ended' or s.activity_type<>'quiz' then raise exception 'Email corrected scripts after ending the quiz.';end if;
 for st in select * from public.session_roster_students where session_id=s.id order by full_name_snapshot,student_code_snapshot loop
  c:=null;reason:=null;status:='ready';
  begin c:=private.classpulse_email_content(s.id,st.student_id);exception when raise_exception then reason:=sqlerrm;status:='ineligible';end;
  if c is not null then select j.status into status from private.report_email_jobs j where j.session_id=s.id and j.student_id=st.student_id and j.fingerprint=c->>'fingerprint';status:=coalesce(status,'ready');end if;
  outrows:=outrows||jsonb_build_array(jsonb_build_object('student_id',st.student_id,'name',st.full_name_snapshot,'code',st.student_code_snapshot,'email',st.email_snapshot,'fingerprint',c->>'fingerprint','status',status,'reason',reason));
 end loop;return outrows;
end $$;
create or replace function public.classpulse_prepare_report_email(target_session uuid,target_student uuid,expected_fingerprint text)
returns jsonb language plpgsql security definer set search_path='' as $$ declare c jsonb;j private.report_email_jobs%rowtype;begin
 perform 1 from public.quiz_sessions where id=target_session and teacher_id=auth.uid() for share;
 if not found then raise exception 'This report is not available to your account.';end if;
 c:=private.classpulse_email_content(target_session,target_student);
 if c->>'fingerprint' is distinct from expected_fingerprint then raise exception 'The report changed. Refresh recipients before sending.';end if;
 insert into private.report_email_jobs(teacher_id,session_id,student_id,recipient,fingerprint,script_snapshot)
 values(auth.uid(),target_session,target_student,c->>'recipient',c->>'fingerprint',c->'script') on conflict(session_id,student_id,fingerprint) do nothing;
 select * into j from private.report_email_jobs where session_id=target_session and student_id=target_student and fingerprint=c->>'fingerprint';
 return jsonb_build_object('job_id',j.id,'status',j.status);
end $$;
create or replace function public.classpulse_claim_report_email(target_job uuid,daily_limit integer)
returns jsonb language plpgsql security definer set search_path='' as $$ declare j private.report_email_jobs%rowtype;begin
 if daily_limit is null or daily_limit not between 1 and 1000 then raise exception 'Invalid daily email limit.';end if;
 perform pg_advisory_xact_lock(842913);
 select * into j from private.report_email_jobs where id=target_job;if not found then raise exception 'Email job unavailable.';end if;
 perform 1 from public.quiz_sessions where id=j.session_id for share;
 select * into j from private.report_email_jobs where id=target_job for update;
 if j.status in('accepted','sending','unknown') then return jsonb_build_object('status',j.status);end if;
 if j.script_snapshot is null and j.payload is null then return jsonb_build_object('status','failed');end if;
 if (select count(*) from private.report_email_jobs where claimed_at>=(date_trunc('day',now() at time zone 'UTC') at time zone 'UTC') and status in('sending','accepted','unknown'))>=daily_limit then raise exception 'Daily email limit reached. Try again tomorrow.';end if;
 update private.report_email_jobs set status='sending',attempt_token=gen_random_uuid(),claimed_at=clock_timestamp(),updated_at=now(),error_message=null where id=j.id returning * into j;
 return to_jsonb(j)||jsonb_build_object('claimed',true);
end $$;
create or replace function public.classpulse_store_email_payload(target_job uuid,token uuid,provider_name text,email_payload jsonb)
returns void language plpgsql security definer set search_path='' as $$begin
 if provider_name not in('resend','brevo') or jsonb_typeof(email_payload) is distinct from 'object' or octet_length(email_payload::text)>20000000 then raise exception 'Invalid email payload.';end if;
 update private.report_email_jobs set payload=email_payload,provider=provider_name where id=target_job and attempt_token=token and status='sending' and payload is null;
 if not found then raise exception 'Email claim or payload changed.';end if;
end $$;
create or replace function public.classpulse_finish_report_email(target_job uuid,token uuid,result_status text,message_id text,error_text text)
returns void language plpgsql security definer set search_path='' as $$begin
 if result_status not in('accepted','failed','unknown') then raise exception 'Invalid email outcome.';end if;
 update private.report_email_jobs set status=result_status,provider_message_id=message_id,error_message=left(error_text,500),updated_at=now(),
 script_snapshot=case when result_status='accepted' then null else script_snapshot end,payload=case when result_status='accepted' then null else payload end
 where id=target_job and attempt_token=token and status='sending';if not found then raise exception 'Email claim changed.';end if;
end $$;
revoke all on function public.classpulse_email_recipients(uuid) from public,anon,authenticated;
revoke all on function public.classpulse_prepare_report_email(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.classpulse_email_recipients(uuid) to authenticated;
grant execute on function public.classpulse_prepare_report_email(uuid,uuid,text) to authenticated;
revoke all on function public.classpulse_claim_report_email(uuid,integer) from public,anon,authenticated;
revoke all on function public.classpulse_store_email_payload(uuid,uuid,text,jsonb) from public,anon,authenticated;
revoke all on function public.classpulse_finish_report_email(uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.classpulse_claim_report_email(uuid,integer) to service_role;
grant execute on function public.classpulse_store_email_payload(uuid,uuid,text,jsonb) to service_role;
grant execute on function public.classpulse_finish_report_email(uuid,uuid,text,text,text) to service_role;
notify pgrst,'reload schema';commit;
