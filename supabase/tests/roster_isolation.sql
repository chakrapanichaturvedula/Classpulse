begin;
insert into auth.users(id,email,raw_user_meta_data,is_anonymous) values
('00000000-0000-4000-8000-000000000201','roster-a@classpulse.invalid','{"full_name":"Roster Teacher A"}',false),
('00000000-0000-4000-8000-000000000202','roster-b@classpulse.invalid','{"full_name":"Roster Teacher B"}',false),
('00000000-0000-4000-8000-000000000203',null,'{}',true);
insert into public.rosters(id,teacher_id,name) values
('00000000-0000-4000-8000-000000000213','00000000-0000-4000-8000-000000000202','Teacher B Class');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000201","role":"authenticated","is_anonymous":false}',true);
insert into public.rosters(id,teacher_id,name) values
('00000000-0000-4000-8000-000000000211','00000000-0000-4000-8000-000000000201','Section A'),
('00000000-0000-4000-8000-000000000212','00000000-0000-4000-8000-000000000201','Section B');
select public.classpulse_import_roster('00000000-0000-4000-8000-000000000211','[{"id":"001","name":"Mira Devika Rao","emailid":""},{"id":"25A2HP002","name":"Arjun Mehta","emailid":"arjun@example.invalid"}]');
select public.classpulse_import_roster('00000000-0000-4000-8000-000000000212','[{"id":"001","name":"Mira Devika Rao","emailid":""}]');
do $$ declare denied boolean; affected integer; begin
 if (select count(*) from public.rosters)<>2 or (select count(*) from public.students)<>2 then raise exception 'FAIL: ownership or shared identity'; end if;
 if not exists(select 1 from public.students where student_code='001') then raise exception 'FAIL: leading zeros lost'; end if;
 denied:=false;
 begin perform public.classpulse_import_roster('00000000-0000-4000-8000-000000000213','[{"id":"x","name":"X","emailid":""}]'); exception when raise_exception then denied:=true; end;
 if not denied then raise exception 'FAIL: imported into another teacher class'; end if;
 update public.rosters set name='Hijacked' where id='00000000-0000-4000-8000-000000000213'; get diagnostics affected=row_count;
 if affected<>0 then raise exception 'FAIL: renamed another teacher class'; end if;
 denied:=false;
 begin insert into public.rosters(teacher_id,name) values('00000000-0000-4000-8000-000000000202','Forged'); exception when insufficient_privilege then denied:=true; end;
 if not denied then raise exception 'FAIL: forged class owner'; end if;
 denied:=false;
 begin insert into public.students(teacher_id,student_code,full_name) values('00000000-0000-4000-8000-000000000201','bypass','Bypass'); exception when insufficient_privilege then denied:=true; end;
 if not denied then raise exception 'FAIL: bypassed import validation'; end if;
 -- First row would be created, but conflicting second row must roll it back.
 denied:=false;
 begin perform public.classpulse_import_roster('00000000-0000-4000-8000-000000000211','[{"id":"NEW","name":"New Student","emailid":""},{"id":"001","name":"Wrong Name","emailid":""}]'); exception when raise_exception then denied:=true; end;
 if not denied or exists(select 1 from public.students where student_code='NEW') then raise exception 'FAIL: partial import or conflicting identity accepted'; end if;
 if (select count(*) from public.roster_students where withdrawn_at is null)<>3 then raise exception 'FAIL: failed import changed membership'; end if;
 denied:=false;
 begin perform public.classpulse_import_roster('00000000-0000-4000-8000-000000000211','[{"id":"001","name":"Mira Devika Rao","emailid":""},{"id":"001","name":"Mira Devika Rao","emailid":""}]'); exception when raise_exception then denied:=true; end;
 if not denied then raise exception 'FAIL: duplicate IDs accepted'; end if;
 denied:=false;
 begin perform public.classpulse_import_roster('00000000-0000-4000-8000-000000000211','[{"id":"z","name":"Z","emailid":"bad"}]'); exception when raise_exception then denied:=true; end;
 if not denied then raise exception 'FAIL: invalid email accepted'; end if;
end $$;
select public.classpulse_import_roster('00000000-0000-4000-8000-000000000211','[{"id":"25A2HP002","name":"Arjun Mehta","emailid":"arjun@example.invalid"}]');
do $$ begin
 if (select count(*) from public.roster_students where roster_id='00000000-0000-4000-8000-000000000211' and withdrawn_at is null)<>1 then raise exception 'FAIL: replacement did not update selected class'; end if;
 if (select count(*) from public.roster_students where roster_id='00000000-0000-4000-8000-000000000212' and withdrawn_at is null)<>1 then raise exception 'FAIL: replacement affected another class'; end if;
end $$;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000202","role":"authenticated","is_anonymous":false}',true);
do $$ begin
 if (select count(*) from public.rosters)<>1 or (select count(*) from public.students)<>0 or (select count(*) from public.roster_students)<>0 then raise exception 'FAIL: second teacher sees another roster'; end if;
end $$;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000203","role":"authenticated","is_anonymous":true}',true);
do $$ declare denied boolean:=false; begin
 if (select count(*) from public.rosters)<>0 or (select count(*) from public.students)<>0 then raise exception 'FAIL: student sees teacher data'; end if;
 begin perform public.classpulse_import_roster('00000000-0000-4000-8000-000000000211','[{"id":"x","name":"X","emailid":""}]'); exception when raise_exception then denied:=true; end;
 if not denied then raise exception 'FAIL: student imports roster'; end if;
end $$;
reset role;
rollback;
select 'PASS: class ownership, CSV import and rollback verified; fixtures rolled back' as result;