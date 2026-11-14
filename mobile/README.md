# Odyssey mobile frontend

Dev A's Expo / React Native frontend for Odyssey. The app uses Expo Router and follows the pixel-art direction from the Lovable reference. This project lives in `mobile/`; the backend and its shared types live separately at the repository root. Coordinate any future move to the root layout with the team.

## Run locally

Use a Node version supported by Expo SDK 58: Node 22.13 or later in the 22.x line, Node 24.3 or later in the 24.x line, or Node 26 or later. Then, from the repository root:

```sh
cd mobile
npm install
npx expo start
```

Open the app using a compatible Expo Go installation, an Expo development build, or a simulator. To verify the frontend:

```sh
npm run typecheck
npm run lint
npx expo export --platform android
```

For an installable Android test APK, sign in to the Expo account that owns the linked EAS project and run `npx eas-cli@latest build --platform android --profile preview`. The EAS project ID and Android package in `app.json` belong to the current project owner; coordinate with the team before using them for release. The `development` build profile requires `expo-dev-client` before use.

## Demo behavior

Create a trip, select open or fog mode, and begin the voyage. Use **Simulate travel** or **We have arrived** to advance through the sample stages. Join with the demo code `ODYSSEY` and a nickname. The route, crew, stage progress, and points are local in-memory demo data. The Maps button is visual only. Closing the app resets demo state.

No AI, backend, real multiplayer, location tracking, server-side fog filtering, or points ledger is connected. See [the Dev A handoff](docs/DEV_A_HANDOFF.md) before integrating with Dev B and Dev C's work. Screen copy is in `src/theme/copy.ts`.

The separate `../prototype` folder contains an earlier web experiment and is not needed to run or build this app.
