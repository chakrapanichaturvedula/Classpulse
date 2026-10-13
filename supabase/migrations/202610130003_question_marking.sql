begin;
create or replace function public.classpulse_grade_question_batch(target_session uuid,target_question uuid,input_marks jsonb)
returns void language plpgsql security definer set search_path='' as $$ declare item jsonb;n integer;begin
 if auth.uid() is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'Sign in as a teacher.';end if;
 if jsonb_typeof(input_marks) is distinct from 'array' then raise exception 'Provide a list of marks.';end if;
 n:=jsonb_array_length(input_marks);if n not between 1 and 150 then raise exception 'Save between 1 and 150 student marks.';end if;
 if exists(select 1 from jsonb_array_elements(input_marks) x where jsonb_typeof(x)<>'object' or not(x ?& array['student_id','new_points','expected_points','expected_graded_at'])) then raise exception 'Check the student marks and saved revisions.';end if;
 if (select count(distinct x->>'student_id') from jsonb_array_elements(input_marks) x)<>n then raise exception 'Duplicate or missing student IDs.';end if;
 -- Stable row locking order prevents two marking windows taking opposite locks.
 -- Any failed validation or stale mark rolls back the entire RPC batch.
 for item in select value from jsonb_array_elements(input_marks) order by (value->>'student_id')::uuid loop
  if jsonb_typeof(item->'new_points') is distinct from 'number' or jsonb_typeof(item->'expected_points') not in('number','null') or jsonb_typeof(item->'expected_graded_at') not in('string','null') then raise exception 'Check the marks and saved revisions.';end if;
  perform public.classpulse_grade_short_answer(target_session,(item->>'student_id')::uuid,target_question,(item->>'new_points')::numeric,item->>'feedback',(item->>'expected_points')::numeric,(item->>'expected_graded_at')::timestamptz);
 end loop;
end $$;
revoke all on function public.classpulse_grade_question_batch(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.classpulse_grade_question_batch(uuid,uuid,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
