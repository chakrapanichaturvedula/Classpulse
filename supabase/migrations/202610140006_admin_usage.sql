begin;
create or replace function public.classpulse_admin_usage(window_days integer default 30)
returns jsonb language plpgsql security definer set search_path='' as $$
declare cutoff timestamptz; generated timestamptz:=now(); result jsonb;
begin
 perform private.classpulse_require_admin();
 if window_days is null or window_days not in(0,7,30,90) then raise exception 'Choose 7, 30, 90 days or All time.';end if;
 cutoff:=case when window_days=0 then '-infinity'::timestamptz else generated-make_interval(days=>window_days) end;
 with faculty as (
  select p.id,p.full_name,u.email,u.email_confirmed_at,coalesce(a.enabled,false) approved
  from public.users p join auth.users u on u.id=p.id left join private.faculty_approvals a on a.email=lower(btrim(u.email))
  where not coalesce(u.is_anonymous,false)
 ), launched as (
  select teacher_id,count(*) activities,count(*) filter(where activity_type='quiz') quiz_launches,
   count(*) filter(where activity_type<>'quiz') quick_launches
  from public.quiz_sessions where created_at>=cutoff and created_at<=generated group by teacher_id
 ), completed as (
  select teacher_id,count(*) filter(where activity_type='quiz') quizzes,count(*) filter(where activity_type<>'quiz') quick
  from public.quiz_sessions where status='ended' and ended_at>=cutoff and ended_at<=generated group by teacher_id
 ), history as (
  select teacher_id,max(created_at) last_activity,count(*) all_launches from public.quiz_sessions where created_at<=generated group by teacher_id
 ), participation as (
  select teacher_id,count(*) joined from public.session_participants where joined_at>=cutoff and joined_at<=generated group by teacher_id
 ), responses as (
  select count(*) n from public.quiz_responses where submitted_at>=cutoff and submitted_at<=generated
 ), months as (
  select generate_series(date_trunc('month',generated at time zone 'Asia/Kolkata')-interval '5 months',date_trunc('month',generated at time zone 'Asia/Kolkata'),interval '1 month') as bucket_start
 ), trend as (
  select to_char(m.bucket_start,'YYYY-MM') as month_key,to_char(m.bucket_start,'Mon YYYY') label,
  (select count(*) from public.quiz_sessions s where s.status='ended' and s.activity_type='quiz' and s.ended_at>=m.bucket_start at time zone 'Asia/Kolkata' and s.ended_at<(m.bucket_start+interval '1 month') at time zone 'Asia/Kolkata' and s.ended_at<=generated) quizzes,
  (select count(*) from public.quiz_sessions s where s.status='ended' and s.activity_type<>'quiz' and s.ended_at>=m.bucket_start at time zone 'Asia/Kolkata' and s.ended_at<(m.bucket_start+interval '1 month') at time zone 'Asia/Kolkata' and s.ended_at<=generated) quick
  from months m
 )
 select jsonb_build_object('generated_at',generated,'window_days',window_days,
 'accounts',jsonb_build_object(
   'approved_emails',(select count(*) from private.faculty_approvals where enabled),
   'registered_faculty',(select count(*) from faculty),
   'confirmed_faculty',(select count(*) from faculty where email_confirmed_at is not null),
   'awaiting_confirmation',(select count(*) from faculty where email_confirmed_at is null),
   'approved_not_registered',(select count(*) from private.faculty_approvals a where a.enabled and not exists(select 1 from faculty f where lower(btrim(f.email))=a.email)),
   'faculty_ever_launched',(select count(*) from faculty f join history h on h.teacher_id=f.id)),
 'usage',jsonb_build_object(
   'active_faculty',(select count(*) from faculty f join launched l on l.teacher_id=f.id),
   'activities_launched',coalesce((select sum(activities) from launched),0),
   'quizzes_conducted',coalesce((select sum(quizzes) from completed),0),
   'quick_questions_conducted',coalesce((select sum(quick) from completed),0),
   'student_participations',coalesce((select sum(joined) from participation),0),
   'answers_saved',(select n from responses),
   'current_sessions',(select count(*) from public.quiz_sessions where status<>'ended'),
   'saved_library_quizzes',(select count(*) from public.quizzes where source_kind='library' and deleted_at is null),
   'active_rooms',(select count(*) from public.rosters where deleted_at is null),
   'report_emails_accepted',(select count(*) from private.report_email_jobs where status='accepted' and updated_at>=cutoff and updated_at<=generated)),
 'monthly_trend',coalesce((select jsonb_agg(to_jsonb(t) order by t.month_key) from trend t),'[]'::jsonb),
 'faculty',coalesce((select jsonb_agg(jsonb_build_object('id',f.id,'name',f.full_name,'email',f.email,'approved',f.approved,'confirmed',f.email_confirmed_at is not null,
   'active',coalesce(l.activities,0)>0,'activities_launched',coalesce(l.activities,0),'quizzes_conducted',coalesce(c.quizzes,0),'quick_questions_conducted',coalesce(c.quick,0),
   'student_participations',coalesce(p.joined,0),'last_activity',h.last_activity,'ever_launched',coalesce(h.all_launches,0)>0)
   order by coalesce(l.activities,0) desc,lower(f.full_name),f.id)
   from faculty f left join launched l on l.teacher_id=f.id left join completed c on c.teacher_id=f.id left join history h on h.teacher_id=f.id left join participation p on p.teacher_id=f.id),'[]'::jsonb)) into result;
 return result;
end $$;
revoke all on function public.classpulse_admin_usage(integer) from public,anon,authenticated;
grant execute on function public.classpulse_admin_usage(integer) to authenticated;
notify pgrst,'reload schema';
commit;


