# Step 16: Short-answer marking

Implemented locally on 13 October 2026. Requires migration 202610130002_manual_grading.sql after the corrected scripts setup. No production deployment.

## Faculty acceptance
Run setup in a new SQL Editor query; expect Success, No rows returned. Refresh localhost, open Reports and an ended quiz containing short answers. Click Mark short answers. Pending submitted responses appear first. Select one, enter marks from zero to the question maximum (two decimal places allowed), optionally add feedback, and Save marks. The report totals refresh and a student with no remaining pending answers becomes eligible for corrected scripts and the bulk ZIP. Show all short answers permits reviewing/revising prior or automatic short-answer marks. MCQ and true/false grading remains automatic. Unanswered questions remain zero; teachers cannot invent a response to grade.

Saving uses the points and timestamp originally read to prevent silent overwrites from another window. In a conflict, go back, refresh answers and reopen the response. Original student answer text is never changed. Full points count as correct; a positive award below the maximum is partial credit; zero is incorrect for a scored question. Question maximum and total stay tied to the historical quiz version.

Feedback is included in individual corrected PDFs and faculty ZIP scripts. Grading is restricted to ended quizzes owned by the signed-in teacher. Audit history is private; browser users cannot directly write grades or read the audit table. These changes grant no additional student access.

## Verification
Local PostgreSQL checks passed: boundary and precision validation, active-session rejection, missing-response and MCQ rejection, partial/full grades, feedback export, immutable student text, stale-write conflict, audit entries, teacher isolation and anonymous access. Existing corrected-script tests pass against the migration. Eight marking/script tests passed; type check and production web export passed. Rendered PDF verified for partial credit and feedback. Real Supabase marking/save test awaits faculty setup.
