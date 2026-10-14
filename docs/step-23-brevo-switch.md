# Switch student PDF reports to Brevo

Microsoft 365 SMTP in Supabase Auth remains unchanged. This changes only the report-email provider.

1. Verify classpulse@imthyderabad.edu.in as a sender in Brevo, with display name Classpulse. Sender verification in Moosend does not apply to Brevo. Institute IT must authenticate the domain using Brevo's own DNS records. Existing Microsoft/Moosend domain authentication does not authenticate Brevo. Do not alter existing SPF/DMARC records blindly.
2. Ensure Brevo has activated transactional sending for the account. Sender verification alone is not a live inbox test.
3. Run Classpulse-email-provider-switch-setup.sql in a new Supabase SQL Editor query. It allows service-side clearing of a frozen old-provider payload only for definitively failed jobs. Accepted, sending and uncertain jobs cannot be reset. Saved student identity, recipient, report snapshot and fingerprint remain intact. Only active approved faculty owners qualify.
4. Create a Brevo API key under SMTP & API > API keys; enter it directly in Supabase Edge Functions Secrets as BREVO_API_KEY. Do not use a Brevo SMTP password as an API key. Change EMAIL_PROVIDER to brevo and EMAIL_DAILY_LIMIT to 300. Keep REPORT_FROM_EMAIL=classpulse@imthyderabad.edu.in, REPORT_FROM_NAME=Classpulse and ALLOWED_ORIGINS=http://localhost:8081,https://classpulse-7ae.pages.dev.
5. Redeploy send-report-email using the latest Classpulse-send-report-email.ts. Keep Verify JWT enabled. No Cloudflare frontend change is required. Supabase's daily limit is an application safety cap; Brevo's provider quota may use a different day boundary and includes other sends from this account.
6. Test only the administrator's failed report first. Confirm the recipient before sending, then check inbox, attachment and marks. Accepted means API acceptance, not inbox delivery. Do not send the faculty batch before this succeeds.

Local validation: real-PDF mocked provider tests, isolated PostgreSQL privacy tests and server typechecking. Live Brevo configuration and the inbox test are pending. No real Brevo reports were sent by the agent.
