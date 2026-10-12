# Launch activities and quick questions

Install `supabase/migrations/202610120008_quick_questions.sql` once in a new Supabase SQL Editor query after migrations 1–7. Existing rooms, quizzes and answer records are preserved. No new paid service is involved.

Launch has four activity icons: Quiz, Multiple Choice, True / False, Word Cloud. A room with an open activity disables launching another. All session controls are in Live Results, including Start quiz for a prepared saved quiz and End session with confirmation.

Quiz opens the library picker. Selecting a saved quiz prepares its fixed session and opens Live Results; click Start quiz there. The library now filters out the internal quick-question records.

Quick-question icons open a small dialog. The question text is optional: the teacher may ask it aloud. MCQ uses 2–6 letter choices (default A–D), with choices spoken or shown on a board. True / False uses two fixed choices. Word Cloud accepts one word or short phrase, up to 80 characters. Start question launches immediately and opens Live Results.

Quick questions are ungraded. MCQ/TF display counts and percentages of submitted responses. Word Cloud groups whole phrases by normalized case and whitespace, with repeated phrases rendered larger. It does not split phrases into words or remove punctuation. Names and individual responses can still be shown in the grid. Cloud/histogram summaries are visible without exposing names. Responses remain available after ending the activity.

Students join with the same room and roster ID as before, and each student has one immutable response per quick activity. For the next activity, students rejoin the room using Join another session/Join room; automatic transfer to a new session is not implemented yet. Existing quiz scoring, sequencing and student privacy remain unchanged.

Quick launch is atomic, teacher-owned and rejects occupied/foreign rooms, empty rosters and invalid choices. Retrying the same request key reuses its session instead of creating duplicates. The server enforces the cloud character limit, and renamed internal RPCs are no longer directly executable by browser roles. Existing RLS protects the same response/session tables and Realtime subscriptions.

## Teacher review

1. Install the setup query, refresh Classpulse, and open Launch. Confirm there are four icons and no End session/View Live Results controls there.
2. If the room has an open quiz, open Live Results to end it using confirmation.
3. Launch Multiple Choice with the default four options and no typed question. Ask a question aloud. Join two students and submit different letters; verify the live bars/counts.
4. End it in Live Results, launch True / False, rejoin students and verify the split.
5. Launch Word Cloud. Submit `Cash` and `cash` from different students; one larger term should represent both responses. A distinct phrase remains a separate term.
6. Verify individual names/responses can be shown, while no grades or average scores appear for quick questions.
7. End the activity and confirm its saved results remain selectable.
8. Launch a saved quiz: it opens Live Results in the waiting state. Start quiz there and check normal scores still work.

After the functional checks, run `supabase/tests/quick_questions.sql` in a separate query. Expected: `PASS: quick questions, ungraded responses, word cloud limits and privacy verified; fixtures rolled back`.

Local PostgreSQL checks passed for all three modes, retry deduplication, foreign/occupied room rejection, ungraded responses, short-phrase limits, internal RPC protection, ended response rejection and teacher privacy. Earlier answer/result tests also pass after the migration. Model checks cover phrase aggregation and letter labels. Deployed Supabase UI and realtime checks for these new modes remain pending; this is not a concurrency/load test.

Browser review before installation confirmed all four icons and that End session/its Cancel confirmation are in Live Results. The existing active quiz was left open and its records were not changed. The new icons remain disabled until the setup is installed and the current activity is ended. New quick sessions, charts and cloud delivery still need the teacher’s deployed test.
