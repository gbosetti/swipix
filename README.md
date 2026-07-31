# Swipix — Tinder-style photo declutter app

Built with Expo (React Native) + TypeScript, React Navigation.

## Getting started

```bash
cd swipix
npm install
npx expo run:ios       # first run: builds the native project + installs the dev client
npx expo run:android   # same, for a connected Android device or emulator
```

This app can't run in Expo Go — it depends on several native modules (AdMob,
image manipulation, device info, store review, clipboard) that Expo Go doesn't
include. `npx expo run:ios`/`run:android` build a custom dev client and
install it on a simulator/emulator or connected device; after that first
build, day-to-day development just needs:

```bash
npx expo start --dev-client
```

Then open the already-installed Swipix app (not Expo Go) on the
simulator/device — it connects straight to this Metro server. Only rerun
`expo run:*` when native code changes (new native dependency, `app.json`
plugin config, etc.); for JS-only changes, `expo start --dev-client` +
reloading the app is enough and much faster.

For a physical Android device, run `adb devices` first (with Android
platform-tools on your `PATH`) to confirm it's connected and get its id, then
pass it explicitly — `npx expo run:android` alone expects to show an
interactive device picker, which can hang depending on how the terminal is
invoked:

```bash
npx expo run:android --device <device-id-from-adb-devices>
```

Note: `expo-media-library` needs a real photo library to read, so most photo
features won't do much on a freshly-created Simulator with no seeded photos —
a physical device (or a Simulator you've added test photos to) is more useful
for exercising them.

Run `npm run typecheck`, `npm run lint`, and `npm test` before committing —
all three also run automatically on every push/PR via GitHub Actions
(`.github/workflows/ci.yml`).

## Where core React Native concepts live in this project

| Concept | Where to use it here |
|---|---|
| Core Components & Styling | `PhotoCard.tsx` |
| State & Events | `SwipeScreen.tsx` (freedCount, candidates state) |
| Gestures / Animated API | `SwipeDeck.tsx` — this is the meatiest file, revisit it after the animations section |
| Navigation | `RootNavigator.tsx` |
| Permissions / device features | `PhotoLibraryService.ts` |
| Async storage / persistence | `TrashService.ts` |
| Deployment | Use this to actually ship what you build here |

## Architecture rationale (the "why", not just the "what")

- **Strategies are pluggable** (`src/strategies/`). Adding "Duplicate Photos"
  or "Videos over 100MB" next month = one new file, zero changes elsewhere.
- **SwipeDeck is domain-agnostic.** It has never heard of a "photo" or a
  "category" — it just swipes generic `data`. This is intentional: it keeps
  the trickiest code (gesture math) isolated and testable on its own.
- **Deletion is always soft** (`TrashService`). Swipe-left never destroys
  anything immediately — a 24h grace period exists specifically so a
  mis-swipe doesn't cost someone an irreplaceable photo. Don't remove this
  safety net even once the app "feels done."

## Milestones

1. **Wire real image analysis** — `ImageAnalysisService.getAverageBrightness`
   is currently a random stub. Replace with real pixel sampling.
2. **Trash review screen** — a screen listing trashed photos with "restore"
   and a manual "empty now" button, plus a background check for expired
   items using `TrashService.getExpired()`.
3. **App Store submission** — once functional, follow Expo's deployment
   guide, but double check current Apple Developer Program / App Store
   Connect steps directly on Apple's site since UI details there change
   often.
