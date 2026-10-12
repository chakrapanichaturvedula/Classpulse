# Saved report CSV downloads

Open Reports, choose a completed activity, then Download CSV. The web download is generated locally from the same teacher-only saved result document; no new SQL or permissions are needed. Native builds show a browser-download hint until native file sharing is added.

Each export includes all snapshot roster students, room, activity title, stable session ID, activity type, Student ID, full name, joined state, answer count, question count, completion, and saved answers aligned to question IDs. Quizzes also include earned/possible points, final percentage only for fully graded completed quizzes, grading status, and per-question results and awarded points. Incomplete and unanswered students remain in the export. Quick questions have no grading columns; word-cloud phrases retain their original spelling and repetitions.

Downloads include the full roster and answers regardless of the on-screen visibility switches. CSV uses UTF-8 with a BOM for Excel, CRLF row separators, doubled quotes, and quoted cells for commas/newlines. Formula-looking text receives a protective apostrophe. Numeric-only IDs are preserved in the CSV text; import student_id as Text in Excel to preserve leading zeros. The filename includes the room, title and session ID, distinguishing repeated runs. College ERP import column requirements may need a separate export mapping.

Validation: 16 CSV/result tests passed, TypeScript passed, web export passed, and actual quiz and word-cloud downloads were parsed to verify roster row counts, aligned columns, CF2026 identity, quiz score columns and raw ungraded cloud answers. No downloaded student data or screenshots are committed to GitHub.

User confirmed Step 9 room and report flow works. Deployed room/report privacy test passed: PASS: room identity, saved reports and teacher privacy verified; fixtures rolled back.
