# Classpulse

A classroom assessment app for a small group of college teachers. Maximum planned class size: 150 students.

## Step 7: Live Results is ready for database installation
Teacher login, named class rosters, CSV imports, quiz authoring, rooms, student entry, ordered questions and saved answers have been reviewed on the connected project, including the answer privacy check. The next migration adds teacher Live Results with a student/question grid, scores, completion and projection controls. Live changes have a periodic refresh backup. Deployed realtime verification, manual grading controls, other launch modes and reports are subsequent steps.

### Try it on Windows
Double-click Start-Classpulse.cmd in this folder. Keep its window open, then open http://localhost:8081 in your browser. Close the window when you are finished.

The launcher uses an installed pnpm/npm, or the bundled Codex runtime if available. On another machine install a supported Node.js version and pnpm, run pnpm install, then pnpm web.

Student entry checks the roster saved in the launched session. The sample teacher dashboard uses fictional names and records; it does not create a joinable sample room.

See docs/step-07-live-results.md for live teacher results. See docs/step-06-answers.md for question delivery and answer saving. See docs/step-05-student-entry.md for student-entry setup and tests. See docs/step-05-launch.md for the Save quiz / classroom Launch workflow. Earlier quiz setup is in docs/step-04-testing.md. Roster checks remain in docs/step-03-testing.md. Teacher account setup remains in docs/step-02-setup.md. Step 1 checks remain in docs/step-01-testing.md. To test on a phone, connect to the same Wi-Fi and use the laptop's network address; localhost on a phone refers to the phone itself.

## Agreed scope
- Teacher quiz creation and live classroom session controls.
- CSV roster import with Student ID, Full Name and optional Email.
- IDs remain text; full names are not automatically split into first/last names.
- Room Name + Student ID entry without student passwords.
- Live teacher results and student report emails; no parent emails.
- Complements the college ERP; does not replace it.

## Development checks
pnpm typecheck
pnpm build:web

## Architecture and portability
React Native, Expo and TypeScript. Supabase authentication and PostgreSQL are connected. Later stages add classroom updates and Brevo student report emails. Initial web hosting can use Cloudflare Pages. Keep migrations, deployment settings and replaceable provider integrations with the project for later college hosting.

## Sensitive information
Never commit real rosters, credentials, database exports or private student reports. The GitHub repository is currently public. .env.example contains documentation only.

## Next stage
Install and test Live Results and its privacy check. Manual grading, report exports and additional launch settings follow later.
