begin;
create or replace function public.classpulse_store_email_payload(target_job uuid,token uuid,provider_name text,email_payload jsonb)
returns void language plpgsql security definer set search_path='' as $$begin
 if provider_name is null or provider_name not in('resend','brevo','moosend') or jsonb_typeof(email_payload) is distinct from 'object' or octet_length(email_payload::text)>=19000000 then raise exception 'Invalid email payload.';end if;
 update private.report_email_jobs set payload=email_payload,provider=provider_name where id=target_job and attempt_token=token and status='sending' and payload is null;
 if not found then raise exception 'Email claim or payload changed.';end if;
end $$;
revoke all on function public.classpulse_store_email_payload(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.classpulse_store_email_payload(uuid,uuid,text,jsonb) to service_role;
commit;
