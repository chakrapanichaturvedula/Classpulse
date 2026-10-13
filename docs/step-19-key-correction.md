# Post-exam answer-key correction

Install `202610130005_key_correction.sql` after the question marking setup. Email setup is optional and can be installed later. Teachers open Reports, choose an ended quiz, and select Correct answer key. Choose a question, change the key, enter a reason, preview all students' marks, then Apply correction to this exam.

Supports one correct option for MCQ/TF and up to 20 accepted short-answer aliases. Manually assessed questions use Mark short answers. Regrading a question replaces manual mark adjustments for that question; the preview warns about these. Original student answers remain unchanged. Feedback is removed where the grade changes. Missing answers remain zero and absent students are not scored.

An exam-specific key override preserves the published quiz and every other session using it. Private audit records retain the previous key, reason and previous grades. The preview token covers effective keys and responses, so any intervening marking or key change requires a new preview. Session locks serialize manual marking, correction and email claims. When email setup is present, correction blocks during an in-flight send and invalidates queued/failed attachments. Previously delivered/downloaded scripts cannot be recalled; faculty must issue updated scripts.

Future script PDFs show an answer-key update timestamp. CSV/live results use recalculated marks. New email fingerprints distinguish corrected scripts from prior versions. The email function's server PDF renderer must be regenerated and redeployed after layout changes.

Validation: isolated PostgreSQL fixtures test mark changes, aliases, preview conflicts, exam isolation, feedback preservation/removal, email sending conflicts, stale attachment invalidation and teacher/student access. Run the privacy SQL as the SQL editor's postgres role. All test fixtures roll back.
