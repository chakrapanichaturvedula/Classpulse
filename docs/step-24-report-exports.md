# Simplified reports and exports

Report details lead with quiz title/date and Email Results / Export Results. Review marks reveals manual marking and answer-key tools. Participation, completion, average graded-participant score and pending marking are displayed in a responsive summary strip. Names, responses and results remain independently switchable. Click Q1, Q2 etc. to inspect the full question. Saved report list/delete/restore remain available.

Export Results provides a real Excel workbook with frozen student columns, leading-zero IDs as text, all roster responses, pending/absent status and optional MCQ full text; a portrait PDF with student scores and per-question summary; individual PDF/ZIP scripts; and the existing CSV. Quick questions export responses without invented scores. No Email Me/Drive/AI buttons are shown because those features are not implemented.

Individual filenames use StudentID-Full-Name.pdf, or StudentID.pdf when no name is available. ZIP files use QuizTitle-scripts.zip. Only actual filename collisions inside a ZIP receive a numeric suffix; a case-insensitive check protects Windows extraction. Internal session IDs are omitted from these names, while the document itself retains quiz, room and exam date. Downloads of the same student across separate exams may share a basename; normal browser download behavior supplies its own duplicate suffix.

Corrected scripts use a compact identity/score panel, paired short choices and adjacent student/key answer text. Long choices remain full width; long questions can flow across pages. All marks, aliases and teacher feedback are preserved. Rendered sample has 10 questions on two pages, compared with the original three-page example.

Local changes only: no new Supabase SQL is required for this UI/PDF step. Server PDF model is regenerated; deploy the latest send-report-email alongside the frontend to change future emailed attachments. Already accepted emails are not resent automatically, and definite-failure retries retain their frozen original attachments. No real reports were emailed during this work.
