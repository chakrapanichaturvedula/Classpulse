# Step 4: folders and versioned quiz authoring

## Install
Create a NEW Supabase SQL Editor query named Classpulse — Quiz creator. Run supabase/migrations/202610120003_quizzes.sql once. Keep all earlier saved setup and privacy queries; do not rerun earlier migrations.

## Review one quiz
1. Refresh the local app, open your teacher workspace, and select My quizzes.
2. Create a top-level First Year folder.
3. Under Create inside, choose First Year and create a Finance subfolder.
4. Browse First Year / Finance, then choose New quiz.
5. Title it Asset check and select that folder in the editor.
6. Add a multiple-choice question: Which is an asset? Options Cash and Loan. Choose Cash as correct; points 2.
7. Add true/false: Cash is an asset. Choose True; points 1.
8. Add short answer: Name an asset. Accepted answers cash and equipment on separate lines; points 3. Alternatively choose manual grading.
9. Save draft, refresh, reopen My quizzes, and open Asset check. Verify every prompt, option, correct answer, and point value.
10. Edit, reorder or remove a question, then Save draft. Check it reopens correctly.
11. Publish quiz. Verify Version 1 is published.
12. Edit its title or prompt and Save as new draft. Verify Version 2 is draft. Published Version 1 stays fixed.

## Other checks
- Publish an incomplete quiz: it must remain a draft with an explanation.
- Try blank, negative or nonnumeric points.
- Rename a folder and move a quiz by selecting a different quiz folder and saving.
- Change a question, then choose Home, My classes or Sign out. The app must warn before discarding unsaved edits.
- Open the same saved draft in two windows. Save in one, then save the old version in the second. The second save must be rejected and the quiz reopened.
- Use My classes to verify existing rosters still work.

Folder parent links are chosen on creation and cannot be moved in this first version. Folder names can be edited. Quizzes can be moved between folders. A folder view shows its directly contained quizzes; All quizzes shows the whole library.

## Privacy verification
As a separate saved query named Classpulse — Quiz privacy check, run supabase/tests/quiz_isolation.sql. Expected result: PASS: quiz ownership, answer privacy and published versions verified; fixtures rolled back.

Checks cover cross-teacher folder links, quiz reads, answer-key privacy, anonymous users, incomplete publication, stale writes, invalid-save rollback and immutable published content.

## Developer validation
pnpm typecheck
node --test tests/quiz-model.test.mjs tests/roster-csv.test.mjs
pnpm build:web

Model tests and the database migration/privacy test passed locally in an isolated PostgreSQL engine with simulated Supabase auth functions. Supabase deployment and signed-in teacher testing remain pending. No live student sessions or grading of submitted responses is implemented yet.