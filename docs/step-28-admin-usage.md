# Administrator usage overview

Administrator usage overview. Install the Supabase setup and verify its privacy test before publishing the frontend.

Install `supabase/migrations/202610140006_admin_usage.sql`, then run `supabase/tests/admin_usage.sql`. Expect `PASS: administrator usage statistics, period filters, historic counts and student privacy verified; fixtures rolled back`.

Admin has Usage overview and Faculty access views. Faculty approval management remains available in the latter. The usage RPC requires both a currently approved, confirmed faculty account and membership in the private administrator table. Ordinary faculty, student and revoked administrator requests are denied; no table RLS policies or client table grants are broadened.

Metrics:

- Faculty registrations, confirmed registrations, awaiting confirmation and approved emails without accounts are all-time counts, including administrators.
- Active faculty means at least one launched quiz or quick question in the selected 7/30/90-day or all-time period. Logging in or editing a library quiz alone does not count.
- Activities launched use creation date. Quizzes conducted and quick questions conducted count ended sessions by end date, separately.
- Student participations count joined student/session pairs by join date. A student joining two sessions counts twice; this is not an unduplicated count of people.
- Answers saved count response records by submission date. Report email acceptance counts provider-accepted jobs, not inbox delivery.
- Available rooms/quizzes exclude items in Deleted; current sessions count sessions that have not ended.
- Monthly chart shows completed quizzes and quick questions in six IST calendar months, independently of the selected rolling period.
- Optional faculty usage includes name, email, approval/confirmation state, activity counts and last launch. Student identities, responses, prompts and marks are not returned.

Historical counts include sessions whose rooms, quizzes or reports have subsequently been deleted. Faculty whose approval was removed remain part of historical usage. No browser/session tracking, new login logs, analytics cookies or third-party telemetry is introduced.

Checks: isolated PostgreSQL setup twice; 7/30/90-day and all-time filters; approved and unconfirmed fixture accounts with explicit confirmation timestamps; repeated participation; quiz/quick separation; preserved counts after soft deletion; provider-acceptance count; aggregate payload privacy; ordinary/metadata-spoofed/unconfirmed/revoked/anonymous access denial. Fixtures roll back. Existing application tests, type checking and production build checked before local delivery.
