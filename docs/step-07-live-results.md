# Step 7: teacher Live Results

Run `supabase/migrations/202610120007_live_results.sql` once in a new Supabase SQL Editor query after migrations 1–6. It adds a teacher-only results RPC and adds response, participant and session tables to the existing Supabase Realtime publication. It preserves table RLS and grants no student access to results. On a database without that publication, automatic refresh still works.

Open Live Results in the teacher workspace, or View Live Results from a prepared/live room. Select a session from the latest 50 sessions. Ended sessions remain readable. This first version lists recent sessions across the teacher's classes; a full searchable report archive is a later milestone.

The grid uses the roster and quiz version saved at launch. It includes students who have not joined, submitted multiple choice/true-false/short answers, automatic correctness and marks, and manual answers awaiting grading. Joined means the student has entered at least once, not that their browser is currently connected. Question columns scroll sideways on smaller screens. Names, responses and results are hidden by default and can be shown independently. Those switches control projection, not database access permissions.

Completion counts all questions answered, even if manual grading is pending. Average score includes only completed quizzes with every answer graded and positive total possible points. Incomplete and pending scores are labelled. Zero-point quizzes have no percentage. Scores use question points, not a count of correct answers. Pass-rate settings and manual grading controls are not yet implemented.

Live changes are coalesced for 500 ms before reading a new snapshot. A 15-second refresh catches missed changes or reconnects. A manual refresh is also available. The connection label and last-update time expose connectivity or stale data. Leaving the tab removes its subscription/timer. Ended sessions stop automatic refresh. The snapshot RPC returns all response records in one JSON result, avoiding the REST row-count limit.

Implementation reference: [Supabase Postgres Changes](https://supabase.com/docs/guides/realtime/postgres-changes). Publication membership is required for changes; read permissions and RLS protect delivered rows. Only the teacher's selected session is subscribed to.

## User test

1. Install the setup query and refresh Classpulse. Open Live Results and select Basics 1. Existing saved answers should appear when Show responses/results is enabled.
2. Enable Show names to see the saved student names and IDs. Disable it: names and IDs disappear, replaced by Student 1, Student 2, etc.
3. Toggle Show responses and Show results independently. Hiding results removes scores, average and correctness colors. Hiding responses replaces answer text with Submitted.
4. Prepare a fresh session, join as a student and open View Live Results as teacher. Start the quiz from Launch. Each submission should update the grid automatically; leave it open without clicking Refresh.
5. Verify completion reaches 1 of 3 after the student's third answer. Check that incomplete students do not lower the average for completed quizzes.
6. End the session from Launch. Return to Live Results: results remain saved and the status shows Ended. Change the selected session to inspect another quiz.
7. If live updates cannot connect, wait up to 15 seconds or use Refresh results. The label should identify the fallback.

After the functional test, run `supabase/tests/live_results.sql` in a separate query as the default administrator role. Expected result: `PASS: live results, saved scores and teacher privacy verified; fixtures rolled back`. The test retains fixture variables in one procedural block and rolls fixtures back internally.

Local checks passed for teacher/student/anonymous isolation, ended-session retrieval, private data shape, all 1,200 responses in a 150-student grid, publication membership, and score calculations including incomplete/manual/zero-point cases. Typecheck and browser build are checked locally. This is a data-size correctness check, not a 150-browser load test. The teacher has verified the saved-results view, automatic new-answer updates and the deployed live-results privacy test. Larger classroom/browser concurrency testing remains pending.
