# Step 3: named classes and CSV rosters

## Install
In the existing Classpulse Supabase project's SQL Editor, create a NEW saved query named Classpulse — Classes and rosters. Run supabase/migrations/202610120002_rosters.sql once. Keep the previous Step 2 queries; do not rerun them.

The migration adds named class rosters, teacher-owned student identities and class memberships. Imports run atomically through a server-side function. Every table has ownership policies. Anonymous student users cannot manage rosters.

## Teacher review
1. Refresh Classpulse and open your teacher workspace.
2. Create First Year — Section A and First Year — Section B. Choose between them.
3. Download the template. Its columns are exactly id,name,emailid.
4. Format the id column as Text in Excel. Fill full names without splitting them. Email is optional. Save as CSV UTF-8 (.csv), not .xlsx.
5. Upload to Section A. Review the preview before pressing Save roster.
6. Refresh and sign out/in. Check the saved roster returns.
7. Try a missing ID, missing name, duplicate ID, incorrect headers, invalid email, and 151 students. Saving must be blocked.
8. Add the same ID and matching name to Section B. It should share the student identity and preserve Section A membership.
9. Replace Section A's CSV with a shorter list. Only Section A changes. Existing memberships are withdrawn rather than deleted.
10. Rename a class. Duplicate class names within the same teacher account are rejected without case sensitivity.

The application is limited to 150 active students in each class. IDs retain leading zeros. ID comparisons ignore case; imported display values are retained. Extra surrounding spaces are trimmed. Existing names and nonblank emails must match on repeated IDs; blank email does not erase an existing email. Filling a previously missing email updates that student's shared identity across your own classes.

This step uses a browser CSV file picker on laptops and smartphones. Native Expo file import will be added for the native mobile release. No real student room access or quiz sessions are introduced here.

## Verification
- pnpm typecheck
- node --test tests/roster-csv.test.mjs
- pnpm build:web
- Run supabase/tests/roster_isolation.sql as a separate query AFTER the migration. Expected result: PASS: class ownership, CSV import and rollback verified; fixtures rolled back.

CSV parser tests and the database migration/privacy test were executed locally in an isolated PostgreSQL engine with Supabase auth functions simulated. The deployed Supabase test and real signed-in teacher workflow still need verification.