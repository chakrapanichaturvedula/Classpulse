begin;
create table public.quiz_folders (
 id uuid primary key default gen_random_uuid(), teacher_id uuid not null references public.users(id),
 parent_id uuid, name text not null check(length(btrim(name)) between 1 and 120),
 unique(id,teacher_id), check(parent_id is null or parent_id<>id),
 foreign key(parent_id,teacher_id) references public.quiz_folders(id,teacher_id)
);
create unique index folder_sibling_name on public.quiz_folders(teacher_id,coalesce(parent_id,'00000000-0000-0000-0000-000000000000'::uuid),lower(btrim(name)));
create table public.quizzes (
 id uuid primary key default gen_random_uuid(), teacher_id uuid not null references public.users(id), folder_id uuid,
 title text not null check(length(btrim(title)) between 1 and 200), created_at timestamptz not null default now(),
 unique(id,teacher_id), foreign key(folder_id,teacher_id) references public.quiz_folders(id,teacher_id)
);
create table public.quiz_versions (
 id uuid primary key default gen_random_uuid(), teacher_id uuid not null, quiz_id uuid not null,
 version_number integer not null check(version_number>0), revision integer not null default 1 check(revision>0),
 title text not null, status text not null default 'draft' check(status in ('draft','published')),
 published_at timestamptz, created_at timestamptz not null default now(),
 foreign key(quiz_id,teacher_id) references public.quizzes(id,teacher_id),
 unique(quiz_id,version_number),unique(id,teacher_id),
 check((status='draft' and published_at is null) or (status='published' and published_at is not null))
);
create unique index one_draft_per_quiz on public.quiz_versions(quiz_id) where status='draft';
create table public.questions (
 id uuid primary key default gen_random_uuid(),teacher_id uuid not null,quiz_version_id uuid not null,
 question_type text not null check(question_type in ('multiple_choice','true_false','short_answer')),
 prompt text not null check(length(prompt)<=4000),position integer not null check(position>0),
 points numeric(8,2) not null check(points between 0 and 1000),
 foreign key(quiz_version_id,teacher_id) references public.quiz_versions(id,teacher_id),
 unique(quiz_version_id,position),unique(id,teacher_id)
);
create table public.question_options (
 id uuid primary key default gen_random_uuid(),teacher_id uuid not null,question_id uuid not null,
 label text not null check(length(label)<=1000),position integer not null check(position>0),
 foreign key(question_id,teacher_id) references public.questions(id,teacher_id) on delete cascade,
 unique(question_id,position)
);
create schema if not exists private;
revoke all on schema private from public,anon,authenticated;
create table private.question_answer_keys (
 question_id uuid primary key,teacher_id uuid not null,correct_position integer,
 accepted_answers jsonb not null default '[]' check(jsonb_typeof(accepted_answers)='array'),
 manual_grading boolean not null default false,
 foreign key(question_id,teacher_id) references public.questions(id,teacher_id) on delete cascade
);
alter table private.question_answer_keys enable row level security;
revoke all on private.question_answer_keys from public,anon,authenticated;
do $$ declare t text; begin
 foreach t in array array['quiz_folders','quizzes','quiz_versions','questions','question_options'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from anon,authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
  execute format('create policy %I on public.%I for select to authenticated using(teacher_id=(select auth.uid()) and not coalesce((select auth.jwt())->>''is_anonymous'',''false'')::boolean)',t||'_read_own',t);
 end loop;
end $$;
-- Parent links cannot be changed; new random IDs prevent cyclic trees.
grant insert(teacher_id,parent_id,name) on public.quiz_folders to authenticated;
grant update(name) on public.quiz_folders to authenticated;
create policy folders_create_own on public.quiz_folders for insert to authenticated
with check(teacher_id=(select auth.uid()) and not coalesce((select auth.jwt())->>'is_anonymous','false')::boolean);
create policy folders_rename_own on public.quiz_folders for update to authenticated
using(teacher_id=(select auth.uid()) and not coalesce((select auth.jwt())->>'is_anonymous','false')::boolean)
with check(teacher_id=(select auth.uid()) and not coalesce((select auth.jwt())->>'is_anonymous','false')::boolean);

create function public.classpulse_guard_published()
returns trigger language plpgsql set search_path=''
as $$ declare vid uuid; begin
 if tg_table_name='quiz_versions' then
  if old.status='published' then raise exception 'Published quiz versions cannot be changed.'; end if;
 else
  if tg_table_name='questions' then vid:=coalesce(new.quiz_version_id,old.quiz_version_id);
  else
   select quiz_version_id into vid from public.questions where id=coalesce(new.question_id,old.question_id);
  end if;
  if tg_op='UPDATE' then
   if tg_table_name='questions' then
    if exists(select 1 from public.quiz_versions where id=old.quiz_version_id and status='published') then raise exception 'Published questions cannot be moved.'; end if;
   elsif exists(select 1 from public.questions p join public.quiz_versions v on v.id=p.quiz_version_id where p.id=old.question_id and v.status='published') then
    raise exception 'Published question content cannot be moved.';
   end if;
  end if;
  if exists(select 1 from public.quiz_versions where id=vid and status='published') then
   raise exception 'Published question content cannot be changed.';
  end if;
 end if;
 if tg_op='DELETE' then return old; else return new; end if;
end $$;
create trigger immutable_published_version before update or delete on public.quiz_versions for each row execute function public.classpulse_guard_published();
create trigger immutable_published_question before insert or update or delete on public.questions for each row execute function public.classpulse_guard_published();
create trigger immutable_published_option before insert or update or delete on public.question_options for each row execute function public.classpulse_guard_published();
create trigger immutable_published_answer before insert or update or delete on private.question_answer_keys for each row execute function public.classpulse_guard_published();

create function public.classpulse_get_quiz(target_quiz uuid)
returns jsonb language plpgsql security definer set search_path=''
as $$ declare q public.quizzes%rowtype; v public.quiz_versions%rowtype; caller uuid:=auth.uid(); begin
 if caller is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'Sign in as a teacher.'; end if;
 select * into q from public.quizzes where id=target_quiz and teacher_id=caller;
 if not found then raise exception 'This quiz is not available to your account.'; end if;
 select * into v from public.quiz_versions where quiz_id=q.id order by version_number desc limit 1;
 return jsonb_build_object('quiz_id',q.id,'folder_id',q.folder_id,'title',v.title,'version_id',v.id,'revision',v.revision,'version_number',v.version_number,'status',v.status,
 'questions',coalesce((select jsonb_agg(jsonb_build_object('type',p.question_type,'prompt',p.prompt,'points',p.points,
 'options',coalesce((select jsonb_agg(o.label order by o.position) from public.question_options o where o.question_id=p.id),'[]'::jsonb),
 'correct_position',a.correct_position,'accepted_answers',a.accepted_answers,'manual_grading',a.manual_grading) order by p.position)
 from public.questions p join private.question_answer_keys a on a.question_id=p.id where p.quiz_version_id=v.id),'[]'::jsonb));
end $$;

create function public.classpulse_save_quiz(target_quiz uuid,target_folder uuid,quiz_title text,input_questions jsonb,expected_version uuid,expected_revision integer)
returns jsonb language plpgsql security definer set search_path=''
as $$ declare caller uuid:=auth.uid(); q public.quizzes%rowtype; v public.quiz_versions%rowtype;
 item jsonb; option_value jsonb; answer_value jsonb; qid uuid; pos integer:=0; optpos integer; kind text; score numeric; answerpos integer; begin
 if caller is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) or not exists(select 1 from public.users where id=caller) then raise exception 'Sign in as a teacher.'; end if;
 if quiz_title is null or length(btrim(quiz_title)) not between 1 and 200 then raise exception 'Enter a quiz title.'; end if;
 if target_folder is not null and not exists(select 1 from public.quiz_folders where id=target_folder and teacher_id=caller) then raise exception 'Choose one of your own folders.'; end if;
 if jsonb_typeof(input_questions) is distinct from 'array' then raise exception 'Questions must be a list.'; end if;
 if jsonb_array_length(input_questions)>100 or octet_length(input_questions::text)>524288 then raise exception 'Use at most 100 questions in a small quiz.'; end if;
 if target_quiz is null then
  insert into public.quizzes(teacher_id,folder_id,title) values(caller,target_folder,btrim(quiz_title)) returning * into q;
  insert into public.quiz_versions(teacher_id,quiz_id,version_number,title) values(caller,q.id,1,btrim(quiz_title)) returning * into v;
 else
  select * into q from public.quizzes where id=target_quiz and teacher_id=caller for update;
  if not found then raise exception 'This quiz is not available to your account.'; end if;
  select * into v from public.quiz_versions where quiz_id=q.id order by version_number desc limit 1 for update;
  if expected_version is distinct from v.id or expected_revision is distinct from v.revision then raise exception 'This quiz changed in another window. Reopen it before editing.'; end if;
  if v.status='published' then
   insert into public.quiz_versions(teacher_id,quiz_id,version_number,title) values(caller,q.id,v.version_number+1,btrim(quiz_title)) returning * into v;
  else
   update public.quiz_versions set title=btrim(quiz_title),revision=revision+1 where id=v.id returning * into v;
   delete from public.questions where quiz_version_id=v.id;
  end if;
  update public.quizzes set title=btrim(quiz_title),folder_id=target_folder where id=q.id;
 end if;
 for item in select value from jsonb_array_elements(input_questions) loop
  kind:=item->>'type';
  if kind is null or kind not in('multiple_choice','true_false','short_answer') or jsonb_typeof(item->'prompt') is distinct from 'string' or length(item->>'prompt')>4000 then raise exception 'A question has an invalid type or prompt.'; end if;
  if jsonb_typeof(item->'points') is distinct from 'number' then raise exception 'Question points must be a number.'; end if;
  score:=(item->>'points')::numeric;
  if score<0 or score>1000 or score<>round(score,2) then raise exception 'Use points between 0 and 1000 with at most two decimal places.'; end if;
  if jsonb_typeof(item->'options') is distinct from 'array' or jsonb_array_length(item->'options')>6 then raise exception 'A question can have up to six options.'; end if;
  if kind='true_false' and item->'options'<>'["True","False"]'::jsonb then raise exception 'True/false questions must have True and False options.'; end if;
  if kind='short_answer' and jsonb_array_length(item->'options')<>0 then raise exception 'Short answers do not use options.'; end if;
  if jsonb_typeof(item->'manual_grading') is distinct from 'boolean' or jsonb_typeof(item->'accepted_answers') is distinct from 'array' or jsonb_array_length(item->'accepted_answers')>20 then raise exception 'Check the short-answer grading settings.'; end if;
  for answer_value in select value from jsonb_array_elements(item->'accepted_answers') loop
   if jsonb_typeof(answer_value) is distinct from 'string' or length(btrim(answer_value#>>'{}')) not between 1 and 1000 then raise exception 'Accepted answers must be nonempty text.'; end if;
  end loop;
  answerpos:=null;
  if item->'correct_position' is not null and item->'correct_position'<>'null'::jsonb then
   if jsonb_typeof(item->'correct_position') is distinct from 'number' or (item->>'correct_position')::numeric<>trunc((item->>'correct_position')::numeric) then raise exception 'Choose a valid correct option.'; end if;
   answerpos:=(item->>'correct_position')::integer;
   if answerpos<1 or answerpos>jsonb_array_length(item->'options') then raise exception 'Choose a valid correct option.'; end if;
  end if;
  if kind='short_answer' and answerpos is not null then raise exception 'Short answers do not use a correct option.'; end if;
  pos:=pos+1;
  insert into public.questions(teacher_id,quiz_version_id,question_type,prompt,position,points) values(caller,v.id,kind,btrim(item->>'prompt'),pos,score) returning id into qid;
  optpos:=0;
  for option_value in select value from jsonb_array_elements(item->'options') loop
   if jsonb_typeof(option_value) is distinct from 'string' or length(option_value#>>'{}')>1000 then raise exception 'Options must be text.'; end if;
   optpos:=optpos+1;
   insert into public.question_options(teacher_id,question_id,label,position) values(caller,qid,btrim(option_value#>>'{}'),optpos);
  end loop;
  insert into private.question_answer_keys(question_id,teacher_id,correct_position,accepted_answers,manual_grading)
  values(qid,caller,answerpos,item->'accepted_answers',(item->>'manual_grading')::boolean);
 end loop;
 return public.classpulse_get_quiz(q.id);
end $$;

create function public.classpulse_publish_quiz(target_version uuid,expected_revision integer)
returns jsonb language plpgsql security definer set search_path=''
as $$ declare caller uuid:=auth.uid(); v public.quiz_versions%rowtype; p public.questions%rowtype; a private.question_answer_keys%rowtype; n integer; begin
 if caller is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'Sign in as a teacher.'; end if;
 -- Match the save function lock order: quiz first, then its version.
 perform 1 from public.quizzes where teacher_id=caller and id=(select quiz_id from public.quiz_versions where id=target_version and teacher_id=caller) for update;
 select * into v from public.quiz_versions where id=target_version and teacher_id=caller for update;
 if not found then raise exception 'This quiz is not available to your account.'; end if;
 if v.status<>'draft' or v.revision<>expected_revision then raise exception 'Reopen this draft before publishing.'; end if;
 if not exists(select 1 from public.questions where quiz_version_id=v.id) then raise exception 'Add at least one question before publishing.'; end if;
 for p in select * from public.questions where quiz_version_id=v.id loop
  if btrim(p.prompt)='' then raise exception 'Every question needs a prompt.'; end if;
  select * into a from private.question_answer_keys where question_id=p.id;
  if not found then raise exception 'Every question needs grading settings.'; end if;
  if p.question_type in('multiple_choice','true_false') then
   select count(*) into n from public.question_options where question_id=p.id;
   if n<2 or a.correct_position is null or a.correct_position>n or exists(select 1 from public.question_options where question_id=p.id and btrim(label)='') then raise exception 'Add at least two nonempty options and choose a correct answer.'; end if;
   if (select count(distinct lower(btrim(label))) from public.question_options where question_id=p.id)<>n then raise exception 'Answer options must be different.'; end if;
  elsif not a.manual_grading and jsonb_array_length(a.accepted_answers)=0 then raise exception 'Short answers need an accepted answer or manual grading.';
  end if;
 end loop;
 update public.quiz_versions set status='published',published_at=now() where id=v.id;
 return public.classpulse_get_quiz(v.quiz_id);
end $$;
revoke all on function public.classpulse_get_quiz(uuid) from public,anon,authenticated;
revoke all on function public.classpulse_save_quiz(uuid,uuid,text,jsonb,uuid,integer) from public,anon,authenticated;
revoke all on function public.classpulse_publish_quiz(uuid,integer) from public,anon,authenticated;
grant execute on function public.classpulse_get_quiz(uuid) to authenticated;
grant execute on function public.classpulse_save_quiz(uuid,uuid,text,jsonb,uuid,integer) to authenticated;
grant execute on function public.classpulse_publish_quiz(uuid,integer) to authenticated;
commit;