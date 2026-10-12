# Familiar quiz creation flow

Library > Add Quiz opens a choice dialog with Excel Template and Blank Quiz. Blank Quiz starts with an editable Untitled Quiz title, current-folder breadcrumb and Save and Exit. Empty quizzes offer the three question types and an Excel import option. Import still creates a new quiz and respects unsaved-change protection.

Questions use one open editing card at a time. New multiple-choice questions have four options; saved/imported questions keep their actual option counts. The prompt and points share a compact row, options carry letter labels and one accessible correct-answer radio circle, and answer rows can be added/removed within the existing 2–6 choice limit. Removing a choice reindexes the correct position or clears it if the correct choice itself is removed. True/false uses the same radio design and short answers retain automatic aliases/manual grading.

Done collapses the question into a summary and retains the draft locally. Edit reopens it. Delete removes the local question, and Duplicate copies all question settings without sharing the mutable options array. Up/down controls move the question while stable keys keep the active editor attached to the correct item. Save and Exit persists the whole quiz using the existing protected RPC/version workflow. Earlier session snapshots are unaffected. No SQL migration is needed.

Only functional choices are displayed. AI generation, copy/paste import, Word extraction, image attachments, video embedding and quiz sharing remain later features. Upcoming requested stages remain Library PDF without/with answers and question-wise exam PDF results.

Validation: TypeScript and web export passed, eleven quiz/import tests passed, including removal/correct-option integrity. Browser walkthrough checked Add Quiz, Blank Quiz, title, A–D answer entry, correct-answer radio selection, collapse/reopen, duplication independence, TF and short-answer editing. Temporary edits were discarded without saving a test quiz. The template's instructions were revised for Add Quiz > Excel Template and visually checked.

Faculty approved the local UI and requested publishing to GitHub. This release includes both the Excel importer and creator flow. Live save/launch review remains a post-deployment check.
