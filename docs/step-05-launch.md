# Step 5A: classroom rooms and launch preparation

Teacher flow: Save quiz in My quizzes, select a class in My classes, open Launch, create/select its room, browse quiz folders and Launch quiz. There is no teacher-facing Publish button.

## Install
Create a NEW Supabase SQL Editor query named Classpulse — Classroom launch. Run supabase/migrations/202610120004_classroom_launch.sql once. Keep prior queries and migrations. Existing quizzes, including previously published quizzes, remain available.

## Review
1. Refresh the app, open your teacher workspace and verify My quizzes has Save quiz and no Publish quiz button.
2. Select First Year — Section A in My classes, then open Launch. Check that Section A stays selected.
3. Create a unique room name such as IMT-Y1-A. Room names use 4–32 uppercase letters, numbers, hyphens or underscores. Each class has one reusable room in this version.
4. Choose the quiz's folder, select the saved Asset check quiz and choose Launch quiz.
5. Verify the prepared session shows the selected class, room and saved student count.
6. Refresh and return to Launch. The room and prepared session should remain.
7. Edit and Save quiz in My quizzes. The existing room session keeps the original question version. Later launches use the newly saved version.
8. End the prepared session using its confirmation controls, then launch again. A new session is created using the current saved quiz and class roster.
9. Choose Section B and create its own room. Verify class and room selection are kept separate.

Launch validates the saved quiz and freezes that version internally. It also copies the student list at launch. Changes to class rosters and quiz content affect later sessions. Starting a different quiz requires ending the room's existing session. Repeating the same launch request reuses the existing session.

This stage creates a persistent waiting-room session. Real student authentication, question delivery, answers, and live results are the next stage; the student sample screen remains explicitly a sample. Do not invite real students until those features are implemented and tested.

## Privacy verification
In a separate NEW query named Classpulse — Launch privacy check, run supabase/tests/classroom_launch.sql.
Expected result: PASS: classroom launch, session copies and teacher isolation verified; fixtures rolled back.

The test covers incomplete quiz rejection, teacher room isolation, repeated launch requests, fixed question and roster copies, one active session per room, and protected session writes. The local test passed in isolated PostgreSQL with simulated Supabase auth functions; deployed Supabase and teacher UI checks remain pending.