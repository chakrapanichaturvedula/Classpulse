begin;

-- Counts are aggregated on the server: a long room list does not fetch every student.
create or replace function public.classpulse_room_list()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
 perform public.classpulse_require_faculty();
 select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'name',r.name,'student_count',
  (select count(*) from public.roster_students rs where rs.roster_id=r.id and rs.teacher_id=auth.uid() and rs.withdrawn_at is null)) order by r.name),'[]'::jsonb)
 into result from public.rosters r where r.teacher_id=auth.uid();
 return result;
end $$;

-- Reuse the existing atomic validator, preserving all currently enrolled students.
create or replace function public.classpulse_add_students(target_roster uuid,input_rows jsonb)
returns integer language plpgsql security definer set search_path = '' as $$
declare caller uuid:=auth.uid(); existing_rows jsonb; added integer; duplicate_code text;
begin
 perform public.classpulse_require_faculty();
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(caller::text,0));
 perform 1 from public.rosters where id=target_roster and teacher_id=caller for update;
 if not found then raise exception 'This room is not available to your account.'; end if;
 if jsonb_typeof(input_rows) is distinct from 'array' then raise exception 'Provide a valid student list.'; end if;
 added:=jsonb_array_length(input_rows);
 if added<1 or added>150 or octet_length(input_rows::text)>262144 then raise exception 'Add between 1 and 150 students.'; end if;
 select st.student_code into duplicate_code from public.roster_students rs join public.students st on st.id=rs.student_id and st.teacher_id=caller
 where rs.roster_id=target_roster and rs.teacher_id=caller and rs.withdrawn_at is null
 and exists(select 1 from jsonb_array_elements(input_rows) x where upper(btrim(x->>'id'))=upper(btrim(st.student_code))) limit 1;
 if found then raise exception 'Student ID % is already in this room. Use Edit to change their details.',duplicate_code; end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',st.student_code,'name',st.full_name,'emailid',coalesce(st.email,''))),'[]'::jsonb)
 into existing_rows from public.roster_students rs join public.students st on st.id=rs.student_id and st.teacher_id=caller
 where rs.roster_id=target_roster and rs.teacher_id=caller and rs.withdrawn_at is null;
 if jsonb_array_length(existing_rows)+added>150 then raise exception 'A room can contain up to 150 students.'; end if;
 perform public.classpulse_import_roster(target_roster,existing_rows||input_rows);
 return added;
end $$;

create or replace function public.classpulse_edit_student(target_roster uuid,student_code_input text,desired_name text,desired_email text,expected_name text,expected_email text)
returns void language plpgsql security definer set search_path = '' as $$
declare caller uuid:=auth.uid(); st public.students%rowtype; display_name text:=btrim(desired_name); address text:=nullif(lower(btrim(desired_email)),'');
begin
 perform public.classpulse_require_faculty();
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(caller::text,0));
 perform 1 from public.rosters where id=target_roster and teacher_id=caller for update;
 if not found then raise exception 'This room is not available to your account.'; end if;
 select s.* into st from public.students s join public.roster_students rs on rs.student_id=s.id and rs.teacher_id=caller
 where rs.roster_id=target_roster and rs.withdrawn_at is null and s.teacher_id=caller and upper(btrim(s.student_code))=upper(btrim(student_code_input)) for update of s;
 if not found then raise exception 'This student is no longer in the room. Refresh the roster.'; end if;
 if st.full_name is distinct from expected_name or coalesce(st.email,'') is distinct from expected_email then raise exception 'Student details have changed. Refresh the roster before editing.'; end if;
 if display_name is null or length(display_name) not between 1 and 200 or display_name ~ E'[\r\n]' then raise exception 'Enter a valid full name.'; end if;
 if desired_email is null or (address is not null and (length(address)>254 or address !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')) then raise exception 'Enter a valid email address or leave it blank.'; end if;
 update public.students set full_name=display_name,email=address where id=st.id and teacher_id=caller;
end $$;

create or replace function public.classpulse_remove_student(target_roster uuid,student_code_input text)
returns void language plpgsql security definer set search_path = '' as $$
declare caller uuid:=auth.uid();
begin
 perform public.classpulse_require_faculty();
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(caller::text,0));
 perform 1 from public.rosters where id=target_roster and teacher_id=caller for update;
 if not found then raise exception 'This room is not available to your account.'; end if;
 update public.roster_students rs set withdrawn_at=now() from public.students st
 where rs.roster_id=target_roster and rs.teacher_id=caller and rs.withdrawn_at is null and st.id=rs.student_id and st.teacher_id=caller
 and upper(btrim(st.student_code))=upper(btrim(student_code_input));
 if not found then raise exception 'This student is no longer in the room. Refresh the roster.'; end if;
end $$;

revoke all on function public.classpulse_room_list() from public,anon,authenticated;
revoke all on function public.classpulse_add_students(uuid,jsonb) from public,anon,authenticated;
revoke all on function public.classpulse_edit_student(uuid,text,text,text,text,text) from public,anon,authenticated;
revoke all on function public.classpulse_remove_student(uuid,text) from public,anon,authenticated;
grant execute on function public.classpulse_room_list() to authenticated;
grant execute on function public.classpulse_add_students(uuid,jsonb) to authenticated;
grant execute on function public.classpulse_edit_student(uuid,text,text,text,text,text) to authenticated;
grant execute on function public.classpulse_remove_student(uuid,text) to authenticated;
commit;
