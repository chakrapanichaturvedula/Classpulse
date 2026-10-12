begin;
create table public.rosters (
 id uuid primary key default gen_random_uuid(),
 teacher_id uuid not null references public.users(id),
 name text not null check (length(btrim(name)) between 1 and 120),
 created_at timestamptz not null default now(),
 unique(id,teacher_id)
);
create unique index roster_name_per_teacher on public.rosters(teacher_id,lower(btrim(name)));
create table public.students (
 id uuid primary key default gen_random_uuid(),
 teacher_id uuid not null references public.users(id),
 student_code text not null check (length(btrim(student_code)) between 1 and 64 and student_code !~ E'[\r\n\t]'),
 full_name text not null check (length(btrim(full_name)) between 1 and 200 and full_name !~ E'[\r\n]'),
 email text check (email is null or (length(email) <= 254 and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')),
 created_at timestamptz not null default now(),
 unique(id,teacher_id)
);
create unique index student_code_per_teacher on public.students(teacher_id,upper(btrim(student_code)));
create table public.roster_students (
 roster_id uuid not null,
 student_id uuid not null,
 teacher_id uuid not null,
 enrolled_at timestamptz not null default now(),
 withdrawn_at timestamptz,
 primary key(roster_id,student_id),
 foreign key(roster_id,teacher_id) references public.rosters(id,teacher_id),
 foreign key(student_id,teacher_id) references public.students(id,teacher_id)
);
create index active_roster_members on public.roster_students(roster_id) where withdrawn_at is null;
create index roster_members_by_teacher on public.roster_students(teacher_id);

do $$ declare t text; begin
 foreach t in array array['rosters','students','roster_students'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from anon, authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
  execute format('create policy %I on public.%I for select to authenticated using (teacher_id = (select auth.uid()) and not coalesce((select auth.jwt())->>''is_anonymous'',''false'')::boolean)',t || '_read_own',t);
 end loop;
end $$;
grant insert on public.rosters to authenticated;
grant update(name) on public.rosters to authenticated;
create policy rosters_create_own on public.rosters for insert to authenticated
with check (teacher_id = (select auth.uid()) and not coalesce((select auth.jwt())->>'is_anonymous','false')::boolean);
create policy rosters_rename_own on public.rosters for update to authenticated
using (teacher_id = (select auth.uid()) and not coalesce((select auth.jwt())->>'is_anonymous','false')::boolean)
with check (teacher_id = (select auth.uid()) and not coalesce((select auth.jwt())->>'is_anonymous','false')::boolean);

-- Imports are atomic. Only this checked function writes student identities
-- and memberships; clients cannot bypass validation with direct writes.
create function public.classpulse_import_roster(target_roster uuid,input_rows jsonb)
returns integer language plpgsql security definer set search_path = ''
as $$
declare
 caller uuid := auth.uid(); item jsonb; code text; display_name text;
 address text; student_uuid uuid; existing public.students%rowtype;
 accepted uuid[] := array[]::uuid[]; count_rows integer;
begin
 if caller is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false)
    or not exists(select 1 from public.users where id=caller) then
  raise exception 'Sign in as a teacher before importing a roster.';
 end if;
 -- Serialize imports by the same teacher to protect shared student records.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(caller::text,0));
 perform 1 from public.rosters where id=target_roster and teacher_id=caller for update;
 if not found then raise exception 'This class is not available to your account.'; end if;
 if jsonb_typeof(input_rows) is distinct from 'array' then raise exception 'Upload a valid student list.'; end if;
 count_rows := jsonb_array_length(input_rows);
 if count_rows < 1 or count_rows > 150 or octet_length(input_rows::text)>262144 then
  raise exception 'Upload between 1 and 150 students using a small CSV.';
 end if;
 for item in select value from jsonb_array_elements(input_rows) loop
  if jsonb_typeof(item->'id') is distinct from 'string'
     or jsonb_typeof(item->'name') is distinct from 'string'
     or jsonb_typeof(item->'emailid') is distinct from 'string' then
   raise exception 'Every row needs id,name,emailid; emailid may be blank.';
  end if;
  code:=btrim(item->>'id'); display_name:=btrim(item->>'name'); address:=nullif(lower(btrim(item->>'emailid')),'');
  if length(code) not between 1 and 64 or length(display_name) not between 1 and 200
     or code ~ E'[\r\n\t]' or display_name ~ E'[\r\n]' then
   raise exception 'Every student needs a valid ID and full name.';
  end if;
  if address is not null and (length(address)>254 or address !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') then
   raise exception 'A student email address is invalid.';
  end if;
 end loop;
 if (select count(distinct upper(btrim(value->>'id'))) from jsonb_array_elements(input_rows)) <> count_rows then
  raise exception 'The upload contains duplicate student IDs.';
 end if;
 for item in select value from jsonb_array_elements(input_rows) loop
  code:=btrim(item->>'id'); display_name:=btrim(item->>'name'); address:=nullif(lower(btrim(item->>'emailid')),'');
  select * into existing from public.students where teacher_id=caller and upper(btrim(student_code))=upper(code);
  if found then
   if lower(regexp_replace(existing.full_name,'[[:space:]]+',' ','g')) <> lower(regexp_replace(display_name,'[[:space:]]+',' ','g'))
      or (existing.email is not null and address is not null and lower(existing.email)<>address) then
    raise exception 'ID % already has different details in another saved roster. Check the name and email before importing.',code;
   end if;
   student_uuid:=existing.id;
   if existing.email is null and address is not null then update public.students set email=address where id=student_uuid and teacher_id=caller; end if;
  else
   insert into public.students(teacher_id,student_code,full_name,email)
   values(caller,code,display_name,address) returning id into student_uuid;
  end if;
  accepted:=array_append(accepted,student_uuid);
 end loop;
 update public.roster_students set withdrawn_at=now()
 where roster_id=target_roster and teacher_id=caller and withdrawn_at is null and not (student_id=any(accepted));
 insert into public.roster_students(roster_id,student_id,teacher_id)
 select target_roster,student,caller from unnest(accepted) as student
 on conflict(roster_id,student_id) do update set withdrawn_at=null;
 return count_rows;
end $$;
revoke all on function public.classpulse_import_roster(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.classpulse_import_roster(uuid,jsonb) to authenticated;
commit;