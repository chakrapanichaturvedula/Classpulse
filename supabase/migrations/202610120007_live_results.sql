begin;
create function public.classpulse_live_results(target_session uuid)
returns jsonb language plpgsql security definer set search_path=''
as $$ declare s public.quiz_sessions%rowtype; begin
 if auth.uid() is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'Sign in as a teacher.'; end if;
 select * into s from public.quiz_sessions where id=target_session and teacher_id=auth.uid();
 if not found then raise exception 'This session is not available to your account.'; end if;
 -- One JSON aggregate avoids the REST row limit on a 150-student response grid.
 return jsonb_build_object('session_id',s.id,'quiz_title',s.quiz_title_snapshot,'class_name',s.class_name_snapshot,
  'room_name',(select room_name from public.rooms where id=s.room_id),'status',s.status,
  'questions',coalesce((select jsonb_agg(jsonb_build_object('id',q.id,'position',q.position,'prompt',q.prompt,'type',q.question_type,'points',q.points,
   'options',coalesce((select jsonb_agg(jsonb_build_object('position',o.position,'label',o.label) order by o.position) from public.question_options o where o.question_id=q.id),'[]'::jsonb)) order by q.position)
   from public.questions q where q.quiz_version_id=s.quiz_version_id),'[]'::jsonb),
  'students',coalesce((select jsonb_agg(jsonb_build_object('id',p.student_id,'name',p.full_name_snapshot,'code',p.student_code_snapshot,
   'joined',exists(select 1 from public.session_participants j where j.session_id=s.id and j.student_id=p.student_id)) order by p.full_name_snapshot,p.student_code_snapshot,p.student_id)
   from public.session_roster_students p where p.session_id=s.id),'[]'::jsonb),
  'responses',coalesce((select jsonb_agg(jsonb_build_object('student_id',r.student_id,'question_id',r.question_id,'option_position',r.option_position,
   'answer_text',r.answer_text,'is_correct',r.is_correct,'awarded_points',r.awarded_points)) from public.quiz_responses r where r.session_id=s.id),'[]'::jsonb));
end $$;
revoke all on function public.classpulse_live_results(uuid) from public,anon,authenticated;
grant execute on function public.classpulse_live_results(uuid) to authenticated;
-- Realtime delivers changes only to clients allowed to read the row by RLS.
-- A local PostgreSQL test may not have Supabase's publication.
do $$ declare t text; begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') then
  foreach t in array array['quiz_responses','session_participants','quiz_sessions'] loop
   if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=t) then
    execute format('alter publication supabase_realtime add table public.%I',t);
   end if;
  end loop;
 end if;
end $$;
commit;
