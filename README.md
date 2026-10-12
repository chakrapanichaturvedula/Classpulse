# Classpulse

A classroom assessment app for a small group of college teachers. Maximum planned class size: 150 students.

## Step 5A is ready for database installation and teacher review
Welcome page, teacher dashboard with sample quiz and roster views, and student entry with a fictional waiting room. Teacher signup, confirmation, login, session restoration, logout and deployed profile isolation have passed review. Named classes, template downloads, CSV imports, persistence and deployed roster privacy checks have passed teacher review. Quiz folders/subfolders and authoring for three question types are implemented; run the Step 4 migration before using quizzes. Sample student entry remains local. There is no live quiz or report email sending yet.

### Try it on Windows
Double-click Start-Classpulse.cmd in this folder. Keep its window open, then open http://localhost:8081 in your browser. Close the window when you are finished.

The launcher uses an installed pnpm/npm, or the bundled Codex runtime if available. On another machine install a supported Node.js version and pnpm, run pnpm install, then pnpm web.

Sample room: DEMO101. Sample student IDs: 25A2HP001, 25A2HP002, 25A2HP003. All names and records in the preview are fictional.

See docs/step-05-launch.md for the Save quiz / classroom Launch workflow. Earlier quiz setup is in docs/step-04-testing.md. Roster checks remain in docs/step-03-testing.md. Teacher account setup remains in docs/step-02-setup.md. Step 1 checks remain in docs/step-01-testing.md. To test on a phone, connect to the same Wi-Fi and use the laptop's network address; localhost on a phone refers to the phone itself.

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
React Native, Expo and TypeScript. Later stages add Supabase authentication, PostgreSQL and classroom updates, plus Brevo student report emails. Initial web hosting can use Cloudflare Pages. Keep migrations, deployment settings and replaceable provider integrations with the project for later college hosting.

## Sensitive information
Never commit real rosters, credentials, database exports or private student reports. The GitHub repository is currently public. .env.example contains documentation only.

## Next stage
Install and test classroom launch setup and privacy. Student admission and live question/answer delivery follow next.
