begin;
alter table public.quiz_sessions add column report_deleted_at timestamptz;
alter table public.quiz_sessions add constraint deleted_reports_are_ended check(report_deleted_at is null or status='ended');
create function public.classpulse_set_report_deleted(target_sessions uuid[],deleted boolean)
returns integer language plpgsql security definer set search_path='' as $$
declare caller uuid:=auth.uid(); requested integer; matched integer;
begin
 if caller is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'Sign in as a teacher.'; end if;
 requested:=cardinality(target_sessions);
 if requested is null or requested not between 1 and 25 or deleted is null or exists(select 1 from unnest(target_sessions) id where id is null) or (select count(distinct id) from unnest(target_sessions) id)<>requested then raise exception 'Select 1 to 25 distinct reports.'; end if;
 perform 1 from public.quiz_sessions where id=any(target_sessions) and teacher_id=caller order by id for update;
 select count(*) into matched from public.quiz_sessions where id=any(target_sessions) and teacher_id=caller and status='ended';
 if matched<>requested then raise exception 'Select only your own completed reports. No changes were saved.'; end if;
 update public.quiz_sessions set report_deleted_at=case when deleted then coalesce(report_deleted_at,now()) else null end where id=any(target_sessions) and teacher_id=caller;
 return matched;
end $$;
revoke all on function public.classpulse_set_report_deleted(uuid[],boolean) from public,anon,authenticated;
grant execute on function public.classpulse_set_report_deleted(uuid[],boolean) to authenticated;
notify pgrst,'reload schema';
commit;
