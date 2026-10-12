# Step 1: your review checklist

Use fictional data only. This stage is a screen preview, not a live service.

1. Open the welcome page. Confirm the Teacher and Student choices are clear.
2. Open the teacher dashboard. Switch between Overview, Quizzes, and Roster.
3. Open and close a sample quiz's details.
4. Check that the roster shows complete multi-part names and IDs beginning with 25A2HP.
5. Open Student entry and choose Fill sample details.
6. Enter DEMO101 and 25A2HP001. Confirm the welcome message shows Mira Devika Rao.
7. Go back and try a blank field, a wrong room, and an unknown student ID. Confirm each gives a clear message.
8. Try DEMO101 with 25A2HP002 and 25A2HP003.
9. Use Home to return to the welcome page.
10. Check phone-sized and laptop-sized layouts for readable text and comfortable buttons.

Nothing is saved yet. Refreshing returns to the welcome screen. Login, roster import, real quiz authoring, live results and email are later stages.

## Developer checks

- `pnpm typecheck`
- `pnpm build:web`
- `pnpm web`

To test on a phone, connect it to the same Wi-Fi as the laptop and use the network address printed by Expo. Windows Firewall may need to permit the development server on the private network. Do not disable the firewall.
