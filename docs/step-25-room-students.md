# Rooms and student management

Status: implemented and checked locally; production publication is pending.

## Setup

Run `supabase/migrations/202610140003_room_students.sql` in the Supabase SQL editor, using the existing administrator workflow. It adds four faculty-only functions; no new tables or public student permissions are introduced. The setup is safe to run again.

Then run `supabase/tests/room_students.sql`. Expect `PASS: room additions, edits, removal, capacity, saved quiz snapshots and teacher privacy verified; fixtures rolled back`. Test accounts, rosters and sessions are fictional and rolled back.

Refresh Rooms in the local application. Before setup, existing rooms and rosters remain readable, dialogs can be previewed, and the new student save buttons stay disabled.

## Faculty flow

- Searchable room list with server-aggregated active student counts, 20 rooms per page.
- Roster beside the room list on screens at least 1000 pixels wide; separate roster view with All rooms navigation on smaller screens.
- Add students opens Individual, Paste a group and Upload CSV tabs.
- Paste accepts Excel columns or CSV, with an optional `id,name,emailid` header. CSV upload uses the existing template and validation.
- New imports **add** to the roster. They do not replace enrolled students. Active duplicate IDs are rejected, and a room holds at most 150 students.
- A teacher's matching student identity can be reused in another room. Conflicting details reject the entire addition.
- Edit changes the full name and optional email. Student ID remains fixed. The dialog explains that name/email changes affect the teacher's other rooms using that identity.
- Remove confirms withdrawal from this room only. Matching details can later be added again; the shared student identity is retained.
- Current and completed quiz rosters remain fixed at launch, preserving access, reports and email recipient snapshots.
- The global room picker also supports search.
- Landing button now says Join Classroom, with room name / Student ID / no password guidance.

## Validation

80 application unit tests passed, including Excel paste, quoted CSV, leading zero IDs, duplicate IDs, invalid email and capacity handling. Type checking and web production build passed. The isolated PostgreSQL suite passed the setup twice and tested atomic additions, shared identity edits, stale edit protection, withdrawal/reentry, active and ended roster snapshots, capacity, other-teacher isolation, revoked faculty and anonymous denial. Laptop and phone layouts, room/student searches and all dialog types were checked in the browser without changing real roster data.

## Publication order

1. Install the new SQL and run its privacy test in Supabase.
2. Test local Rooms with the faculty owner.
3. Publish the frontend together with the pending Reports improvements.
4. Redeploy the updated report email function so emailed PDFs match the revised downloadable PDF layout.
