begin;
create table if not exists private.faculty_approvals(
 email text primary key check(email=lower(btrim(email)) and length(email)<=254 and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
 name text check(name is null or length(name) between 1 and 200),enabled boolean not null default true,
 created_by uuid references public.users(id),updated_by uuid references public.users(id),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create table if not exists private.classpulse_admins(user_id uuid primary key references public.users(id) on delete cascade,created_at timestamptz not null default now());
create table if not exists private.faculty_access_audit(id uuid primary key default gen_random_uuid(),email text not null,enabled boolean not null,actor uuid not null references public.users(id),created_at timestamptz not null default now());
alter table private.faculty_approvals enable row level security;
alter table private.classpulse_admins enable row level security;
alter table private.faculty_access_audit enable row level security;
revoke all on private.faculty_approvals,private.classpulse_admins,private.faculty_access_audit from public,anon,authenticated;
-- Bootstrap only the existing, email-confirmed project owner's teacher account.
do $$declare owner_id uuid;begin
 select u.id into owner_id from auth.users u join public.users p on p.id=u.id where lower(btrim(u.email))='cchakrapani@imthyderabad.edu.in' and not coalesce(u.is_anonymous,false) and u.email_confirmed_at is not null;
 if owner_id is null then raise exception 'Administrator account cchakrapani@imthyderabad.edu.in must already exist with a confirmed email and teacher profile. No changes were applied.';end if;
 insert into private.faculty_approvals(email,name,created_by,updated_by) select 'cchakrapani@imthyderabad.edu.in',full_name,owner_id,owner_id from public.users where id=owner_id on conflict(email) do update set enabled=true;
 insert into private.classpulse_admins(user_id) values(owner_id) on conflict do nothing;
end $$;
create or replace function private.classpulse_faculty_id_allowed(target_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from auth.users u join private.faculty_approvals a on a.email=lower(btrim(u.email)) join public.users p on p.id=u.id where u.id=target_id and a.enabled and not coalesce(u.is_anonymous,false) and u.email_confirmed_at is not null)
$$;
revoke all on function private.classpulse_faculty_id_allowed(uuid) from public,anon,authenticated;
create or replace function public.classpulse_faculty_allowed()
returns boolean language sql stable security definer set search_path='' as $$
 select not coalesce((auth.jwt()->>'is_anonymous')::boolean,false) and private.classpulse_faculty_id_allowed(auth.uid())
$$;
create or replace function public.classpulse_require_faculty()
returns void language plpgsql security definer set search_path='' as $$begin
 if not public.classpulse_faculty_allowed() then raise exception 'Teacher access requires an approved faculty email. Contact the Classpulse administrator.';end if;
 -- Serialize protected teacher operations with approval removal.
 perform 1 from private.faculty_approvals a join auth.users u on lower(btrim(u.email))=a.email where u.id=auth.uid() and a.enabled for share of a;
 if not found then raise exception 'Teacher access requires an approved faculty email. Contact the Classpulse administrator.';end if;
end $$;
create or replace function private.classpulse_require_admin()
returns void language plpgsql security definer set search_path='' as $$begin
 perform public.classpulse_require_faculty();
 if not exists(select 1 from private.classpulse_admins where user_id=auth.uid()) then raise exception 'Only the Classpulse administrator can manage faculty access.';end if;
end $$;
revoke all on function private.classpulse_require_admin() from public,anon,authenticated;
create or replace function public.classpulse_access_status()
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('approved',public.classpulse_faculty_allowed(),'is_admin',public.classpulse_faculty_allowed() and exists(select 1 from private.classpulse_admins where user_id=auth.uid()))
$$;
create or replace function public.classpulse_admin_faculty_list()
returns jsonb language plpgsql security definer set search_path='' as $$begin
 perform private.classpulse_require_admin();
 return coalesce((select jsonb_agg(jsonb_build_object('email',a.email,'name',a.name,'enabled',a.enabled,'registered',u.id is not null,'confirmed',u.email_confirmed_at is not null,'is_admin',exists(select 1 from private.classpulse_admins d where d.user_id=u.id)) order by a.email) from private.faculty_approvals a left join auth.users u on lower(btrim(u.email))=a.email),'[]'::jsonb);
end $$;
create or replace function public.classpulse_admin_approve_faculty(input_rows jsonb)
returns integer language plpgsql security definer set search_path='' as $$declare item jsonb;address text;label text;prior boolean;n integer:=0;begin
 perform private.classpulse_require_admin();
 if jsonb_typeof(input_rows) is distinct from 'array' or jsonb_array_length(input_rows) not between 1 and 500 then raise exception 'Approve 1 to 500 faculty emails at a time.';end if;
 if exists(select 1 from jsonb_array_elements(input_rows) r where jsonb_typeof(r)<>'object' or jsonb_typeof(r->'email') is distinct from 'string' or (r?'name' and jsonb_typeof(r->'name') not in('string','null'))) then raise exception 'Each row needs an email and optional name.';end if;
 if exists(select 1 from jsonb_array_elements(input_rows) r cross join lateral jsonb_object_keys(r) k where k not in('email','name')) then raise exception 'Use only email and optional name fields.';end if;
 if exists(select 1 from jsonb_array_elements(input_rows) r group by lower(btrim(r->>'email')) having count(*)>1) then raise exception 'Remove duplicate email addresses from the list.';end if;
 for item in select value from jsonb_array_elements(input_rows) order by lower(btrim(value->>'email')) loop
  address:=lower(btrim(item->>'email'));label:=nullif(btrim(item->>'name'),'');
  if length(address)>254 or address !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or length(label)>200 then raise exception 'Use a valid email and a name of up to 200 characters.';end if;
  select enabled into prior from private.faculty_approvals where email=address for update;
  insert into private.faculty_approvals(email,name,created_by,updated_by) values(address,label,auth.uid(),auth.uid()) on conflict(email) do update set enabled=true,name=coalesce(excluded.name,private.faculty_approvals.name),updated_by=auth.uid(),updated_at=clock_timestamp();
  if prior is distinct from true then insert into private.faculty_access_audit(email,enabled,actor) values(address,true,auth.uid());end if;n:=n+1;
 end loop;return n;
end $$;
create or replace function public.classpulse_admin_remove_faculty(target_email text)
returns void language plpgsql security definer set search_path='' as $$declare address text:=lower(btrim(target_email));active_send boolean;teacher_ids uuid[];begin
 perform private.classpulse_require_admin();
 if address is null then raise exception 'Choose a faculty email.';end if;
 if exists(select 1 from private.classpulse_admins d join auth.users u on u.id=d.user_id where lower(btrim(u.email))=address) then raise exception 'Administrator emails cannot be removed.';end if;
 perform 1 from private.faculty_approvals where email=address and enabled for update;if not found then return;end if;
 select array_agg(id) into teacher_ids from auth.users where lower(btrim(email))=address;
 -- Email claims and student answers lock their session first; wait before revoking.
 perform 1 from public.quiz_sessions where teacher_id=any(teacher_ids) order by id for update;
 if to_regclass('private.report_email_jobs') is not null then execute 'select exists(select 1 from private.report_email_jobs where teacher_id=any($1) and status=''sending'')' into active_send using teacher_ids;if active_send then raise exception 'An email send is in progress for this faculty account. Finish or review it before removing approval.';end if;end if;
 update private.faculty_approvals set enabled=false,updated_by=auth.uid(),updated_at=clock_timestamp() where email=address;
 update public.quiz_sessions set status='ended',ended_at=clock_timestamp() where teacher_id=any(teacher_ids) and status<>'ended';
 insert into private.faculty_access_audit(email,enabled,actor) values(address,false,auth.uid());
end $$;
-- Auth hook provides the readable signup error. The profile trigger is a second,
-- transactional check even before the dashboard hook has been enabled.
create or replace function public.classpulse_before_user_created(event jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$begin
 if coalesce((event->'user'->>'is_anonymous')::boolean,false) or not exists(select 1 from private.faculty_approvals where email=lower(btrim(event->'user'->>'email')) and enabled) then
  return jsonb_build_object('error',jsonb_build_object('http_code',403,'message','Teacher registration is restricted to approved faculty emails. Contact the Classpulse administrator.'));
 end if;return '{}'::jsonb;
end $$;
create or replace function public.classpulse_create_teacher_profile()
returns trigger language plpgsql security definer set search_path='' as $$begin
 if coalesce(new.is_anonymous,false) then raise exception 'Auth accounts are restricted to approved faculty emails. Students use room entry.';end if;
 perform 1 from private.faculty_approvals where email=lower(btrim(new.email)) and enabled for share;
 if not found then raise exception 'Teacher registration is restricted to approved faculty emails.';end if;
 insert into public.users(id,full_name) values(new.id,left(coalesce(nullif(btrim(new.raw_user_meta_data->>'full_name'),''),'Teacher'),200));
 return new;
end $$;
revoke all on function public.classpulse_create_teacher_profile(),public.classpulse_before_user_created(jsonb) from public,anon,authenticated;
grant usage on schema public to supabase_auth_admin;
grant execute on function public.classpulse_before_user_created(jsonb) to supabase_auth_admin;
revoke all on function public.classpulse_faculty_allowed(),public.classpulse_require_faculty(),public.classpulse_access_status(),public.classpulse_admin_faculty_list(),public.classpulse_admin_approve_faculty(jsonb),public.classpulse_admin_remove_faculty(text) from public,anon,authenticated;
grant execute on function public.classpulse_faculty_allowed(),public.classpulse_require_faculty(),public.classpulse_access_status(),public.classpulse_admin_faculty_list(),public.classpulse_admin_approve_faculty(jsonb),public.classpulse_admin_remove_faculty(text) to authenticated;
-- Email changes must also lead to an approved faculty identity.
create or replace function public.classpulse_guard_faculty_identity()
returns trigger language plpgsql security definer set search_path='' as $$begin
 if not coalesce(new.is_anonymous,false) then
  perform 1 from private.faculty_approvals where email=lower(btrim(new.email)) and enabled for share;
  if not found then raise exception 'The new email must be approved by the Classpulse administrator.';end if;
 end if;return new;
end $$;
revoke all on function public.classpulse_guard_faculty_identity() from public,anon,authenticated;
drop trigger if exists classpulse_faculty_identity_guard on auth.users;
create trigger classpulse_faculty_identity_guard before update of email,is_anonymous on auth.users for each row when(old.email is distinct from new.email or old.is_anonymous is distinct from new.is_anonymous) execute function public.classpulse_guard_faculty_identity();
-- Apply a restrictive gate alongside all existing ownership policies.
do $$declare t text;begin
 foreach t in array array['users','rosters','students','roster_students','quiz_folders','quizzes','quiz_versions','questions','question_options','rooms','quiz_sessions','session_roster_students','session_participants','quiz_responses'] loop
  execute format('drop policy if exists classpulse_faculty_gate on public.%I',t);
  execute format('create policy classpulse_faculty_gate on public.%I as restrictive for all to authenticated using((select public.classpulse_faculty_allowed())) with check((select public.classpulse_faculty_allowed()))',t);
 end loop;
end $$;
-- Existing SECURITY DEFINER teacher RPCs bypass RLS, so guard them explicitly.
-- Future migrations changing these routines must preserve/reapply this check.
do $$declare f record;definition text;begin
 for f in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=any(array[
 'classpulse_import_roster','classpulse_get_quiz','classpulse_save_quiz','classpulse_publish_quiz','classpulse_launch_quiz','classpulse_end_session','classpulse_start_session','classpulse_launch_quick','classpulse_live_results','classpulse_live_results_v1','classpulse_save_room','classpulse_set_report_deleted','classpulse_student_script','classpulse_short_answer_marks','classpulse_grade_short_answer','classpulse_grade_question_batch','classpulse_answer_keys','classpulse_preview_key_correction','classpulse_apply_key_correction','classpulse_email_recipients','classpulse_prepare_report_email']) loop
  definition:=pg_get_functiondef(f.oid);
  if strpos(definition,'perform public.classpulse_require_faculty();')=0 then
   definition:=regexp_replace(definition,'(\mBEGIN\M)',E'\\1\n perform public.classpulse_require_faculty();','i');execute definition;
  end if;
 end loop;
 -- Block an already-prepared email job if its faculty owner has been removed.
 for f in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='classpulse_claim_report_email' loop
  definition:=pg_get_functiondef(f.oid);
  if strpos(definition,'private.classpulse_faculty_id_allowed(j.teacher_id)')=0 then
   definition:=replace(definition,'if j.status in(',E'if not private.classpulse_faculty_id_allowed(j.teacher_id) then return jsonb_build_object(''status'',''failed'');end if;\n if j.status in(');execute definition;
  end if;
 end loop;
end $$;
notify pgrst,'reload schema';
commit;
