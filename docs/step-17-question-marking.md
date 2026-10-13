# Step 17: Question-wise class marking

Faculty requested all student responses on one screen instead of individual answer dialogs. Implemented locally. Run Classpulse-question-marking-setup.sql, which includes the prior manual-marking setup and the new atomic batch function.

Reports > ended quiz > Mark short answers shows question buttons, one prompt and all roster students. Submitted responses have inline marks and feedback. Missing responses are labelled unanswered/absent and cannot be given invented marks. Save all marks writes only changed submitted responses in one RPC. Pending inputs left blank stay pending. A filter can show pending submissions only. Unsaved edits prevent changing question, refreshing or closing until saved/discarded.

Atomic validation, permissions and stale-write checks reuse the single-response grading function. Any failed row rolls back the entire batch; row locks follow student UUID order. Local tests cover multi-student save, rollback including audit history, duplicate IDs, stale batches, foreign teacher and anonymous access. Six edit/marks tests and production build passed. Real Supabase batch save awaits faculty installation and testing.

Post-exam correction of an MCQ/TF/accepted-answer key is a separate proposed feature. It must use session-specific overrides, recalculate that session only, update reports and regenerated scripts, and preserve other sessions and Library versions. Previously downloaded/emailed PDFs require reissue. No key-correction functionality is implemented in this step.
