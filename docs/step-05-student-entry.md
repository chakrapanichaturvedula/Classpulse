# Step 5B: real student room entry

Run `supabase/migrations/202610120005_student_entry.sql` once after the classroom launch migration. Save this as a separate Supabase query. No anonymous Auth setting, student passwords or server secret is required.

This step verifies Room Name + Student ID against the immutable session roster, returns only that student's name/ID and session summary, and records one joined participant per student. Student requests use a separate public client so a teacher's login remains intact on the same device. Waiting rooms check session status every ten seconds; ended sessions stop checking. Refreshing requires rejoining. The teacher refreshes the launch list to see the joined count (historical joins, not currently connected devices).

An unguessable session token is kept in memory and in a private server table. Public tables and answer keys remain inaccessible to students. Invalid room and ID combinations return the same message. Knowing another student's room and ID still allows acting as that student: these identifiers are the requested access method, not proof of personal identity. Before a public deployment, add server-side request throttling to resist ID guessing. This laptop milestone does not claim to include that protection.

## User test

1. Keep a prepared session open, or launch a quiz in a class with a saved roster.
2. Open Classpulse in a second tab or private browser window, choose Student entry, enter its room and a Student ID from the saved roster.
3. Confirm the correct full name and waiting room appear. Letter case and outer spaces should not matter; leading zeros in IDs remain significant.
4. Refresh the teacher launch list: joined count increases by one. Rejoining the same student does not increase the count.
5. Try an ID outside that roster: entry should be rejected without listing other students.
6. End the session as teacher: within about ten seconds, the waiting room says the session ended. Further joins to the ended session are rejected unless a new session is prepared.

Questions, answer submissions, launch modes and live results are subsequent milestones. No emails are sent here.

The SQL test `supabase/tests/student_entry.sql` uses fictional fixtures in a transaction and rolls them back. Local validation does not replace testing on the connected Supabase project.

The privacy test now retains fixture IDs in a single procedural block, without temporary-table lookups across role changes. A deliberate, specifically caught exception rolls back test writes within that block; unexpected failures propagate. Local checks also cover an empty search path and running the block alone. The teacher has verified valid student entry, joined counts, invalid-ID rejection and rejection after session end on the connected project; the revised deployed privacy check has passed.
