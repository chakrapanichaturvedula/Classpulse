# Word quiz import

Library > Add Quiz > Word Document. Upload a plain-text .docx quiz, review every prompt, option, answer and mark in Preview, then Open in editor and Save and Exit. The import itself does not save a quiz. No SQL migration is needed for Word import.

Use headings `Question 1 (Multiple Choice)`, `Question 2 (True / False)` and `Question 3 (Short Answer)`, numbered consecutively. Type A) through F) for choice options. Include exactly one `Correct Answer:` line per question. Short-answer aliases use `|`; `MANUAL` explicitly requests teacher marking. Optional `Points:` defaults to 1. A `Short Answer (Number)` key containing a unit also accepts the bare number; both appear in preview.

Supports paragraph breaks and soft line breaks, including the supplied ten-question faculty quiz. Type labels MCQ, TF and SHORT are supported. Download Word format example provides copyable plain text to paste into Word and save as .docx. Legacy .doc, encrypted files, tables, images, equations, tracked changes and automatic numbering must be converted to plain paragraphs first. Limits: 2 MB compressed, 10 MB expanded, 512 archive entries, 100 questions, existing quiz text/answer/mark limits. Import does not execute macros, fetch external relationships or call an AI service.

Validation: actual supplied .docx imported through the browser and all ten questions opened in the editor. Test draft discarded. Parser tests cover keys, aliases, soft breaks, marks, invalid formats and archive limits. Production deployment remains pending user acceptance.
