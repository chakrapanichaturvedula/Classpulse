# Revising student answers

After installing quiz navigation, run `supabase/migrations/202610250002_answer_revisions.sql` in the Supabase SQL Editor. The migration can be rerun. Run `supabase/tests/quiz_navigation.sql` for the updated navigation and revision regression test.

In Free navigation, students can change a saved option or short answer and select **Save changes** while the session is live. The latest saved answer replaces the earlier answer and is graded again. Saving a revision keeps the student on the same question. New answers continue to open the first unanswered question. The answer count does not increase for a revision.

Unsaved changes remain on the device when moving between questions. Background progress refreshes do not overwrite these drafts. Refreshing or leaving the page discards unsaved changes. Paused and ended sessions reject revisions; Sequential only and quick questions retain their existing locked-submission behavior. Students receive no correctness, marks, answer keys or other students' responses.

The frontend waits for the database's `can_revise_answers` capability before enabling editing of saved answers. This permits publishing the app before the SQL update is installed. Existing Free navigation sessions gain revision support after the SQL update and the next student progress refresh.

Validation: PostgreSQL-compatible isolated database, all migrations, revision migration applied twice, revised short-answer and option grading, invalid revisions, one response per question, student isolation, paused/ended rejection, sequential restrictions and existing quick-question behavior. Component checks cover editable saved options, draft retention through polling/navigation, resubmission, unchanged-answer prevention and old-server compatibility. TypeScript and production build checks accompany delivery.
