begin;
create or replace function public.classpulse_reset_failed_email_provider(target_job uuid,new_provider text)
returns boolean language plpgsql security definer set search_path='' as $$declare changed boolean;begin
 if new_provider is null or new_provider not in('resend','brevo','moosend') then raise exception 'Invalid email provider.';end if;
 update private.report_email_jobs j set payload=null,provider=null,attempt_token=null,error_message='Provider changed; awaiting a new sending attempt.',updated_at=now()
 where j.id=target_job and j.status='failed' and j.provider is not null and j.provider<>new_provider and j.script_snapshot is not null
 and private.classpulse_faculty_id_allowed(j.teacher_id);
 changed:=found;return changed;
end $$;
revoke all on function public.classpulse_reset_failed_email_provider(uuid,text) from public,anon,authenticated;
grant execute on function public.classpulse_reset_failed_email_provider(uuid,text) to service_role;
commit;
