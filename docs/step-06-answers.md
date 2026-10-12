# Step 6A: start a quiz and save student answers

Install `supabase/migrations/202610120006_student_answers.sql` once in a new Supabase SQL Editor query. Earlier migrations must already be installed. Do not replace earlier setup queries.

This milestone supports student-paced questions in fixed order, with one submission per question. Teachers prepare a room, then click Start quiz. Waiting students check for the start within ten seconds. After each answer is acknowledged, the next unanswered question loads immediately. Rejoining or refreshing resumes from saved answers. Repeated identical requests count once; different replacements are rejected. Ending the session stops new answers.

The server checks the student's secret token, the session state, the fixed quiz version, question order and answer shape. Teacher-owned responses are protected with RLS and cannot be written directly by the browser. Session read locks coordinate answer submission with session ending, and participant row locks serialize simultaneous submissions for one student while permitting other students to submit independently.

Multiple choice and true/false are scored from private answer keys. Automatic short answers match accepted answers after trimming outside spaces and ignoring letter case; they do not use fuzzy or AI matching. Manual short answers retain null scores for later teacher review. Students receive only a saved acknowledgement, not correctness, scores or keys. The teacher refreshes joined and exact answer counts. A live results grid, manual grading UI, teacher-paced mode, shuffle settings and report emails are later milestones. This is not yet a full realtime release.

## Test on your laptop

1. Launch a saved quiz in a class with a saved roster, and join as one student in a second browser tab. Before Start quiz, the student remains in the waiting room.
2. Click Start quiz as teacher. Within about ten seconds, the student sees question 1.
3. Select an option or type a short answer and click Submit answer. Verify that the next question appears and the saved count increases.
4. Refresh the student tab and rejoin: it resumes at the next unanswered question. Saved answers cannot be changed.
5. Finish the quiz: the student sees All answers submitted. Refresh the teacher launch list to see the answer count.
6. Try with a second student: progress is separate.
7. End the session with a student midway through: that student should see the ended message, and new submissions are rejected. Next launches use a new session and start fresh.

After the functional test, run `supabase/tests/student_answers.sql` in a separate query as the default SQL Editor administrator role. It simulates teacher/student roles itself and rolls fixtures back inside its block. Expected result: `PASS: question delivery, answer saving, grading and privacy verified; fixtures rolled back`.

Local PostgreSQL checks cover before-start rejection, wrong quiz/invalid token/invalid option rejection, ordered answering, duplicate submission handling, private grading, manual pending scores, teacher isolation, protected writes, completion and ended-session rejection. They passed along with the browser typecheck/build. The teacher has verified question delivery, three saved responses, and the deployed answer privacy test. Explicit refresh/rejoin verification and larger classroom testing remain part of the rollout checks. This is not a 150-student load test; test concurrency and add server request throttling before a public classroom rollout.
