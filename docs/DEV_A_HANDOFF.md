# Dev A frontend handoff

> Status: this describes the visual prototype as delivered in `mobile/`. Since then the screens were moved into the root app and connected to the backend. The components live in `src/components/`, the screens in `app/`, and the in-memory demo state (`src/voyage.tsx`) is gone. The design notes below still apply.

## Design source

The user-supplied `oracle-of-the-open-road-main.zip` export (archive commit `765b963fc1e3e4e0169b4c74bcb4dbe540827c1e`) is the design reference. `assets/sprites/lovable-pixels.json` contains its original ship, island, Ithaca and avatar pixel matrices from `src/components/pixel.tsx`. Its OKLCH palette from `src/styles.css` is converted to sRGB for native SVG rendering. Fonts, screen width, spacing, typography and sample copy follow that source.

## Ownership

This delivery is Dev A only: Expo screens/navigation, visual components, pixel assets, styling and presentation animations. `src/components/Bob.tsx` respects reduced-motion preferences. The app retains its pre-existing in-memory demo state solely to show screen states. No Supabase code, real AI, geocoding, device location, realtime synchronization, stage validation or production points ledger is implemented.

## Frontend integration points

- `Screen` consumes the existing demo view model from `src/voyage.tsx`. Dev B/C can replace this with the agreed service/view-model contract.
- Arrival/demo buttons currently advance local sample UI state. Production arrival must call Dev C's workflow and Dev B's RPC.
- Fog is demonstrated with static samples. Production hidden-stage data must be filtered on the backend before reaching the frontend.
- The 8-bit Maps button sits beside visible destinations and has no action or placeholder message. Supply its optional onPress callback when maps integration is ready.
- Avatar selection, nickname, route visibility, code sharing, crew list and completed-trip visuals are frontend controls.

## Validation

Run `npm run typecheck`, `npx expo lint`, and `npx expo export --platform web`. Native UI still needs simulator/physical-device visual QA. The hosted web preview uses the same Expo screen components.
