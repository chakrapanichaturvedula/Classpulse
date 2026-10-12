# Step 2: teacher accounts

## Current status
Signup, login, email-confirmation handling, session restoration, verified teacher profiles and sign-out are implemented. Real account and database isolation testing require a Supabase project. No project has been configured or migrated by this code change.

## Create your free project
1. Open https://supabase.com/dashboard and sign in. You must accept account terms yourself.
2. Create a Free organization if needed, then create a project named Classpulse.
3. Choose a nearby available region. Choose and privately save the database password. Do not send it to the assistant or put it in the application.
4. Wait for the project to be ready.
5. Open the project's Connect dialog or Settings/API Keys. Copy the Project URL and the Publishable key beginning sb_publishable_. These are public client configuration, not the database password or a secret key.
6. Copy .env.example to .env in the local project and replace its placeholders with these two values. .env is ignored by Git.

## Install the database setup
In the Supabase SQL Editor, run supabase/migrations/202610120001_teacher_profiles.sql once against the NEW Classpulse project. Do not run it on the college ERP or an existing application. The file creates teacher profiles and ownership policies and skips anonymous student users.

## Authentication settings
- Enable email/password authentication. Keep email confirmation enabled.
- Set password minimum length to 12 in the provider settings as well as the app.
- For this laptop stage, set Site URL and an allowed redirect URL to http://localhost:8081. Signup confirmation currently returns to that address. Hosted/mobile callback addresses will be configured when deployment/deep linking is introduced.
- Supabase's built-in email sender is for testing, is rate limited, and ordinarily sends only to authorized organization members. For real teacher signup, configure a permitted SMTP provider such as Brevo. Do not silently turn off email verification to avoid sender restrictions.
- Native email confirmation callbacks have not been implemented or tested yet. This phase verifies the web app first.

## Test after connection
1. Restart the local development server to load .env.
2. Create a teacher account with your full name, email, and a password of at least 12 characters. Enter the password yourself, not through the assistant.
3. Follow the confirmation email, then sign in.
4. Confirm that your full name appears in an empty personal workspace. Sample quizzes and students must not appear as your real records.
5. Refresh and return to Teacher sign in; the session should restore.
6. Sign out. Reopening Teacher sign in must show the form, not your private workspace.
7. Check invalid login, malformed email, short passwords, and mismatched signup passwords.
8. Create a second teacher account and run the isolation SQL verification below. This is needed before marking Step 2 complete.

## Teacher isolation verification
Run supabase/tests/teacher_profile_isolation.sql in SQL Editor AFTER applying the migration. It creates fictional users inside a transaction, asserts read/update/insert restrictions and exclusion of anonymous students, and rolls all records back. It does not send emails.

Future class, roster, folder, quiz and response tables each need their own ownership constraints and policies. Profile isolation does not automatically secure future tables.
