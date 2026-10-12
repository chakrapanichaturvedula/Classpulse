begin;

create table public.users (
    id uuid primary key references auth.users(id) on delete cascade,
    full_name text not null check (length(btrim(full_name)) between 1 and 200),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);
alter table public.users enable row level security;
revoke all on public.users from anon, authenticated;
grant select on public.users to authenticated;
grant update (full_name) on public.users to authenticated;

create policy teacher_reads_own_profile on public.users
for select to authenticated
using (
    id = (select auth.uid())
    and not coalesce((select auth.jwt())->>'is_anonymous', 'false')::boolean
);
create policy teacher_updates_own_profile on public.users
for update to authenticated
using (
    id = (select auth.uid())
    and not coalesce((select auth.jwt())->>'is_anonymous', 'false')::boolean
)
with check (
    id = (select auth.uid())
    and not coalesce((select auth.jwt())->>'is_anonymous', 'false')::boolean
);

create function public.classpulse_create_teacher_profile()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
    -- Anonymous student accounts must never receive teacher profiles.
    if not coalesce(new.is_anonymous, false) and new.email is not null then
        insert into public.users (id, full_name)
        values (new.id, left(coalesce(nullif(btrim(new.raw_user_meta_data->>'full_name'), ''), 'Teacher'), 200));
    end if;
    return new;
end;
$$;
revoke all on function public.classpulse_create_teacher_profile() from public, anon, authenticated;
create trigger classpulse_teacher_created
after insert on auth.users
for each row execute function public.classpulse_create_teacher_profile();

create function public.classpulse_touch_profile()
returns trigger language plpgsql set search_path = ''
as $$ begin new.updated_at = now(); return new; end; $$;
create trigger classpulse_profile_updated
before update on public.users
for each row execute function public.classpulse_touch_profile();

-- Backfill accounts created before this migration. Names are display data,
-- not an authorization role; access relies on auth.uid() and database policies.
insert into public.users (id, full_name)
select id, left(coalesce(nullif(btrim(raw_user_meta_data->>'full_name'), ''), 'Teacher'), 200)
from auth.users
where not coalesce(is_anonymous, false) and email is not null
on conflict (id) do nothing;

commit;
