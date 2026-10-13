# Faculty demo and report emails

## Prepare the quiz and room first
1. Import IMT-Hyderabad-Faculty-Quiz.xlsx using Library > Add Quiz > Excel Template. Review the ten questions and Save and Exit.
2. Create a room such as FACULTYDEMO. Use the roster template: id,name,emailid. Assign IDs such as FD001 and enter each faculty member's real name and correct email. Upload before launching the quiz; a session stores its own copy of roster email addresses.
3. Launch the quiz. Faculty use Student entry, room FACULTYDEMO and their assigned ID; they do not create teacher accounts.
4. After submissions, End session. Review any short answers that require changed marks before issuing reports.
5. Reports > the completed quiz > Email scripts shows recipients. Email ready scripts > Confirm send emails sends separate PDF attachments. The teacher explicitly initiates sending; unattended dispatch on student completion is not implemented in this demo.

The supplied quiz is automatically scored, with Q5 accepting Cherlaguda (case insensitive) and Q10 accepting 30 or 30 Acres. All questions are one mark. Source answer keys were preserved; this conversion is not a fact-check of institutional claims.

## Email service setup last
There is no email service account yet. No real emails have been sent. Code is tested locally with fake providers; production deployment and inbox delivery must be tested before the faculty demo.

Both Resend and Brevo are supported. Pick one at setup. Resend's onboarding sender emails only its account owner's address; arbitrary faculty recipients require a verified domain. A college domain may need IT help with DNS. Brevo may temporarily rewrite unauthenticated/free-provider sender domains; sender/domain verification and transactional account approval still need to be checked. We will first test a report to your own inbox, then faculty recipients.

### Database
Run Classpulse-report-email-setup.sql in a new Supabase SQL Editor query after the corrected-script and question-marking setups. Expect Success, No rows returned. The separate privacy check uses fictional fixtures and rolls them back. The service_role used by the sender is a Supabase server role, not a student role.

### Server function
Supabase dashboard > Edge Functions > Deploy a new function > Via Editor. Name it send-report-email. Paste the complete Classpulse-send-report-email.ts file, replacing the sample code, and deploy. Keep JWT verification enabled. The function also verifies the signed-in user through Supabase Auth and checks teacher session ownership in its database RPCs. For command-line deployment, use the repository's supabase/functions/send-report-email folder. No function has been deployed during this work.

### Secrets
In Supabase Edge Function Secrets set:
- EMAIL_PROVIDER = resend or brevo
- REPORT_FROM_EMAIL = your verified sender address
- REPORT_FROM_NAME = Classpulse
- RESEND_API_KEY or BREVO_API_KEY = the selected provider's API key
- EMAIL_DAILY_LIMIT = 100 by default; match the provider's available quota
- ALLOWED_ORIGINS = http://localhost:8081,https://classpulse-7ae.pages.dev

SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are normally supplied automatically to Edge Functions. Do not add provider or service-role keys to EXPO_PUBLIC variables, Cloudflare frontend build settings, chat messages or GitHub.

## Demo readiness check
Create a test room with your own email in the roster. Complete a quiz, end it, open the recipient preview and send one report. Verify the correct PDF, marks and inbox/spam folder. Then publish the verified app update and rehearse with a second participant. Provider acceptance means the API accepted the message, not proof of inbox delivery. Delivery/bounce webhooks are not included yet.

## Implemented protections
The browser sends only session/student IDs and the preview fingerprint. The server gets the recipient from the saved roster and builds the PDF from an authoritative, single-student script. Pending marks, absent students and missing/invalid emails are blocked. A changed report must be previewed again. One private job is kept per student/report content; repeated clicks do not resend accepted scripts. Provider payload is frozen for definite failures; timeouts and uncertain outcomes require provider-log review before retry. Private attachment data is cleared after acceptance; failed/unknown jobs retain it for review. A project-wide daily cap controls sends.

Provider keys remain server-side. CORS allows configured app origins. Accounts are not yet faculty-allowlisted; that remains a prerequisite before opening registration widely. No forced resend of an already accepted unchanged script is provided.

## Local validation
PostgreSQL privacy tests passed for recipients, pending/missing emails, ownership, session status, claims, duplicate clicks, completion tokens, quota and uncertain outcomes. Deno tests passed for both provider payloads, real server PDF rendering, auth/origin checks, recipient injection, duplicates, mismatched student data, rejected/uncertain sends and frozen retries. No live SMTP requests were made. UI/typecheck and production build checks apply to the app, with a separate Deno check for the server.

## Source documentation
- https://resend.com/docs/knowledge-base/403-error-resend-dev-domain
- https://github.com/resend/resend-openapi/blob/main/resend.yaml
- https://developers.brevo.com/reference/sendtransacemail
- https://help.brevo.com/hc/en-us/articles/16045394674066-Troubleshooting-Domain-authentication
- https://supabase.com/docs/guides/functions/secrets
- https://supabase.com/docs/guides/functions/quickstart-dashboard

When the app's PDF layout changes, run pnpm prepare:email and redeploy the server function. Keep both renderers aligned. Do not publish the demo as email-ready until the sender setup, real inbox test and public deployment are confirmed.
