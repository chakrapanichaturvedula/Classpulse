-- Run on the new Classpulse project after its Step 2 migration.
-- All fixtures and changes are rolled back, including on assertion failures.
begin;
insert into auth.users (id, email, raw_user_meta_data, is_anonymous)
values
 ('00000000-0000-4000-8000-000000000101', 'teacher-a@classpulse.invalid', '{"full_name":"Teacher A"}', false),
 ('00000000-0000-4000-8000-000000000102', 'teacher-b@classpulse.invalid', '{"full_name":"Teacher B"}', false),
 ('00000000-0000-4000-8000-000000000103', null, '{}', true);

do $$ begin
 if exists (select 1 from public.users where id = '00000000-0000-4000-8000-000000000103') then
  raise exception 'FAIL: anonymous student received a teacher profile';
 end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000101","role":"authenticated","is_anonymous":false}', true);
do $$ declare affected integer; begin
 if (select count(*) from public.users) <> 1 then raise exception 'FAIL: teacher can read other profiles'; end if;
 if not exists (select 1 from public.users where full_name = 'Teacher A') then raise exception 'FAIL: own profile unavailable'; end if;
 update public.users set full_name = 'Not allowed' where id = '00000000-0000-4000-8000-000000000102';
 get diagnostics affected = row_count;
 if affected <> 0 then raise exception 'FAIL: teacher updated another profile'; end if;
 update public.users set full_name = 'Teacher A updated' where id = '00000000-0000-4000-8000-000000000101';
 get diagnostics affected = row_count;
 if affected <> 1 then raise exception 'FAIL: own profile update failed'; end if;
 begin
  insert into public.users (id, full_name) values ('00000000-0000-4000-8000-000000000103', 'Forged teacher');
  raise exception 'FAIL: client inserted teacher profile';
 exception when insufficient_privilege then null;
 end;
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000102","role":"authenticated","is_anonymous":false}', true);
do $$ begin
 if (select count(*) from public.users) <> 1 or not exists (select 1 from public.users where full_name = 'Teacher B') then
  raise exception 'FAIL: second teacher isolation';
 end if;
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000103","role":"authenticated","is_anonymous":true}', true);
do $$ begin
 if (select count(*) from public.users) <> 0 then raise exception 'FAIL: student read a teacher profile'; end if;
end $$;
reset role;
set local role anon;
do $$ begin
 begin
  perform count(*) from public.users;
  raise exception 'FAIL: unauthenticated profile access';
 exception when insufficient_privilege then null;
 end;
end $$;
reset role;
rollback;
select 'PASS: teacher profiles isolated; fixtures rolled back' as result;
