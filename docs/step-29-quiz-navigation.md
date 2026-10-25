# Quiz navigation at launch

Install `supabase/migrations/202610250001_quiz_navigation.sql` in the Supabase SQL Editor after the existing migrations, followed by `supabase/migrations/202610250002_answer_revisions.sql`, then run `supabase/tests/quiz_navigation.sql`. Expect `PASS: quiz navigation, free-mode revisions, sequential enforcement, grading, legacy clients, quick questions and privacy; fixtures rolled back`.

In Launch, choose Quiz. Above the quiz list, choose the student navigation setting before selecting the quiz:

- **Sequential only** (default): students submit each question in order. They cannot skip questions or return to earlier ones.
- **Free navigation**: students use Previous and Next above the question, skip questions, return to unfinished questions and revise their own saved answers. Submit answer saves a new answer and opens the first unanswered question. Save changes updates an existing answer and keeps the student on that question. Students can revise even after all questions have answers, until the teacher pauses or ends the session.

Sequential submissions cannot be changed. Free navigation supports revisions after installing the answer-revision migration (see step-30-answer-revisions.md). Moving between questions preserves unsubmitted drafts on that device while the page stays open. Drafts are not saved to the server; refreshing or leaving loses drafts. Saved answers survive rejoining.

The setting belongs to the launched session. Existing sessions and launches from older clients default to sequential. Retrying a launch with a different setting cannot change an open session. Quick questions retain their existing one-answer flow.

Server enforcement retains session status checks, per-student locks, sequential restrictions, grading and ownership/faculty checks. Review returns only the student's own submitted choice/text; answer keys, marks, correctness and other students' answers are excluded. Student table access is unchanged.

Manual checks with a three-question quiz and two students:

1. Launch Sequential only. Check that students cannot go back or skip and that a refresh resumes at the first unanswered question.
2. End it, launch Free navigation, and start the session. Move forward without answering, return, and verify that a typed draft is retained. Submit the last question before the first, then review it, change the answer and select Save changes. Verify the latest saved answer is used for grading.
3. Confirm another student cannot see the saved answer. Save all remaining answers, review with Previous/Next, and refresh/rejoin to confirm saved answers remain.
4. Pause and end the session; question controls must disappear and new submissions must be refused. Check that quick questions still submit once and finish normally.

Local validation: isolated PostgreSQL-compatible PGlite database with all existing migrations and the new migration, navigation/privacy regression SQL, existing administrator usage SQL, TypeScript checking, application tests and production web export. Live Supabase installation and Cloudflare publication are separate deployment steps.
