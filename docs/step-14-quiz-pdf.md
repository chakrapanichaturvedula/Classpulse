# Step 14: Library quiz PDFs

Implemented locally on 13 October 2026; not yet published.

## Teacher check
1. Open Library, then a folder or All quizzes.
2. Choose PDF beside a saved quiz.
3. Choose Question paper (without answers) or Answer key (with answers).
4. Download PDF, open the file and print if required.

The PDF exports the latest saved version, not unsaved edits or a historical exam snapshot. The paper contains name/Student ID blanks, question points and answer space for short answers. The key adds the correct choice or accepted short-answer aliases; manually graded answers are labelled for teacher assessment. Both use A4 pages, embedded Roboto, page numbering and total marks. Ordinary questions stay together; unusually long content continues across pages. Content is generated in the teacher's browser without a third-party PDF service. Library export uses the existing teacher-protected quiz RPC. No SQL migration is needed. PDF dependencies load on demand.

## Validation
- Type check and clean Expo production export passed.
- Eight quiz model/PDF tests passed, including absence of private short-answer aliases and answer annotations in student papers.
- Downloaded both PDFs from Basics 1 in the authenticated local browser; inspected their extracted contents and found no browser errors.
- Generated and visually reviewed multi-page fixtures covering MCQ, true/false, accepted answers, manual grading, rupee symbols, fractional marks and a long question/option spanning pages.

## Remaining work
Faculty acceptance and publishing. Student corrected scripts, exam results PDFs and email delivery are separate next stages. Question images, video, equation images and comprehensive non-Latin font shaping are not included in this stage.
