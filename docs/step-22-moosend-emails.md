# Moosend report email setup

Faculty confirmation mail already uses Microsoft 365 SMTP in Supabase Auth. This setup is separate: it sends individual corrected PDF scripts through Moosend's transactional API. It does not change the existing SMTP connection.

1. Run Classpulse-moosend-email-setup.sql in a new Supabase SQL Editor query as postgres. It extends the service-role payload recorder to accept Moosend. Existing faculty gates, private jobs, roster recipients and report ownership checks remain in place. Expect Success. No rows returned.
2. Supabase > Edge Functions > Secrets: enter the following values. Never put the provider key into chat, GitHub or EXPO_PUBLIC frontend settings.

EMAIL_PROVIDER = moosend
MOOSEND_API_KEY = the replacement key, entered directly into Secrets
REPORT_FROM_EMAIL = classpulse@imthyderabad.edu.in
REPORT_FROM_NAME = Classpulse
EMAIL_DAILY_LIMIT = 1000
ALLOWED_ORIGINS = http://localhost:8081,https://classpulse-7ae.pages.dev

1000 is an application safety cap per day across this Supabase project, not a Moosend plan limit. Each browser sends selected student reports sequentially, one API call per student. The reported 300-at-a-time plan limit still needs its exact meaning confirmed with IT. Multiple teachers may send concurrently. Moosend rate limits/rejections are retained as failed jobs for later retry; no automatic mass retry is performed.

SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are supplied automatically by Supabase Edge Functions. Do not copy them into the frontend. Moosend's API username is not needed by the HTTP API; the replacement key authenticates the request.

3. Supabase > Edge Functions > Deploy a new function > Via Editor. Function name: send-report-email. Replace the sample source with all of Classpulse-send-report-email.ts, then deploy. If the function already exists, replace its source and redeploy. Keep Verify JWT enabled. No new Cloudflare frontend deployment is required for this provider change: production already has Email scripts.
4. Create a test room roster with only your own email, complete a quiz as that participant, end the session and finish marking. Reports > completed quiz > Email scripts > Refresh recipients > Email PDF > review recipient > Confirm send emails. Verify the attachment, student identity, marks and inbox/spam folder before using a faculty or student list. Saved session rosters retain emails from launch time; changing a room roster afterwards does not change an old report's recipient.

Accepted means Moosend accepted the request, not confirmed inbox delivery. Unknown outcomes must be reviewed in Moosend before any retry, avoiding duplicate reports. A campaign ID returned in Context is stored when present; it is not a unique per-recipient delivery ID. No webhooks/bounce delivery tracking are installed in this step. The API requires the key in its query string: never log that URL. The sender code does not log provider URLs, keys or provider response bodies and refuses redirects.

Local validation: 10 server tests pass using fake providers and real PDF rendering, plus isolated PostgreSQL regression/privacy tests under faculty approval gates. Tests cover Moosend's Code/Error envelope even on HTTP 200, single recipients, attachments, duplicates, sender setup, missing credentials, uncertain outcomes and oversized PDFs. Live deployment and the first inbox test remain pending. No real key was read or used and no real email was sent.

Documentation:
https://docs.moosend.com/api-documentation/articles/KnowledgeBase/54597-Manage-a-transactional-campaign?lang=en_US
https://docs.moosend.com/api-documentation/articles/KnowledgeBase/54553-Request-and-response-parameters?lang=en_US
https://docs.moosend.com/api-documentation/articles/KnowledgeBase/54558-API-rate-limiting?lang=en_US
