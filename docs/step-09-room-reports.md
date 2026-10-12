# Room reports and one room name

The Reports tab lists ended sessions for the selected room, newest first, in pages of 25. Search matches activity titles. Each launch remains a separate report. Opening one uses the existing teacher-only result RPC, with controls for names, answers, and grades; report views have no start/end controls. Quick activities show distributions or word clouds without scores. Saved quiz versions, roster snapshots, and responses are retained.

Room creation and renaming now use classpulse_save_room, which saves the roster label and student join name together. Names are uppercase, globally unique, and 4–32 letters, digits, underscores or hyphens. Renames are rejected during an open activity. The migration renames the existing IMTY1A room attached to CF2026 to CF2026 without changing its UUID, preserving historical sessions. A conflicting existing room name causes the migration to roll back instead of merging data. Other legacy names are preserved until explicitly renamed in Rooms.

Apply 202610120009_room_identity.sql once after migrations 1–8. Then refresh the app. Students use CF2026 and their original roster IDs. Run supabase/tests/room_reports.sql in a separate query. Expected: PASS: room identity, saved reports and teacher privacy verified; fixtures rolled back.

Validated locally: TypeScript and web export; all prior SQL checks plus room create/rename, active rename rejection, repeated report retention, saved answers after rename, student/foreign-teacher access denial. Browser verification used existing completed activities and a saved quiz's scores. Actual Supabase migration and new deployed privacy check await user execution. Earlier quick-question checks passed in deployed Supabase, including MC, TF and the corrected Word Cloud.

Download/email exports remain a later step. Reports are available for ended activities; ongoing sessions use Live Results. Historical labels show the room's current name while original class/quiz snapshots remain stored.
