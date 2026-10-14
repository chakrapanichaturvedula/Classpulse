# Delete and restore rooms

Status: implemented and checked locally; production publication pending.

Install `202610140003_room_students.sql` first, then `202610140004_room_deletion.sql`. The combined user setup includes both and can be run again. The deletion setup alone is also idempotent.

Delete room opens a confirmation dialog in the selected roster. It moves the room to Rooms → Deleted, removing it from Launch and the global room picker. Restore returns its original UUID, name and roster. The room name remains reserved while deleted; restore the room to reuse it.

The server blocks deletion if any activity in that room has not ended. A server trigger prevents new sessions in deleted rooms, including requests from stale clients. Existing checked roster and rename functions exclude deleted rooms. No direct client grants to the deletion column are added. All delete, restore and deleted-list functions require approved faculty access and verify teacher ownership.

Students, room memberships, completed sessions, responses and report snapshots are retained. Saved reports remain accessible through Reports → All rooms. Room deletion does not move reports into Reports → Deleted.

Checks: type checking, production web build, isolated PostgreSQL delete/restore/privacy test and existing roster tests passed. Tests cover active session denial, repeat deletion, list filtering, blocked launches and roster changes, unchanged saved results and snapshot rows, restoration with a fresh launch, foreign teacher denial, revoked faculty and anonymous denial. Fixtures are rolled back. The browser confirmation was checked without deleting a real room.
