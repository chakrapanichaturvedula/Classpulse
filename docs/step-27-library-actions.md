# Quiz and folder actions

Status: implemented and checked locally; production publication pending.

Install `supabase/migrations/202610140005_library_actions.sql`, then run `supabase/tests/library_actions.sql`. Both are independent of the recent Rooms migrations; the test uses existing classroom and roster functions. Expect the PASS result with all fixtures rolled back.

Library rows now have a three-dot actions button for Rename, Move to… and Delete. The move dialog searches folder paths and includes Personal as the root destination. Folder moves exclude the folder itself and its descendants; the server also rejects cycles and foreign or deleted destinations. Rename and move for a quiz reuse checked quiz saving, preserving questions and answer keys and creating a new version when the previous version was published.

Delete is recoverable. Deleting a folder also deletes its active subfolders and quizzes as one batch. Restoring the folder restores only that batch; items independently deleted earlier remain deleted. A quiz within a deleted folder requires its containing folder to be restored first. Names of deleted folders remain reserved, so a sibling name conflict should be resolved by restoring or renaming the existing folder.

Deleting an active quiz, or a folder containing one, is blocked until its session is ended. Completed sessions, grades, student answers and reports are retained. Deleted quizzes are hidden from Library and Launch. Server-side guards block stale clients from opening, saving or launching a deleted quiz, or adding content to a deleted folder. All management functions require current faculty approval and ownership. No direct client delete or move grants are added.

The Deleted tab shows the roots of deletion batches and provides Restore. Until the setup is installed, menus and confirmation dialogs can be reviewed, but save actions are disabled.

Validation: type checking and production web build passed. The isolated PostgreSQL suite ran this setup twice and verified rename, question/key preservation, published version safety, stale name checks, quiz/folder moves, cycle denial, active deletion denial, recursive deletion/restoration, independently deleted items, deleted-parent restrictions, saved answer/score preservation, foreign ownership/destination rejection, revoked faculty and anonymous denial. Existing application unit tests also passed. Browser checks covered the menu, rename/move/delete dialogs and destination search without changing real quizzes.
