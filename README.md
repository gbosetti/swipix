# Swipix — Tinder-style photo declutter app

Built with Expo (React Native) + TypeScript, React Navigation.

> Need a clean reinstall on a physical iPhone (fresh permissions/onboarding,
> no leftover state)? Run `npm run ios:reset-demo` — it uninstalls the app
> and rebuilds it as a Release build, which is more reliable to debug
> against than a Debug build (no dev-client error screen, no extra
> local-network permission prompt). See `scripts/reset-ios-demo-device.sh`.

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

## Releasing to iOS (App Store)

1. **Bump the version in `app.json`** — the `version` field (e.g. `1.0.0` →
   `1.0.1`), *before* building. `eas.json`'s `production` profile
   auto-increments the internal build number on every build, but **not**
   this marketing version — it has to be bumped by hand. Once a version has
   been approved and released on the App Store, Apple rejects any new
   build still claiming that same version number (error 90062/90186:
   "must contain a higher version than that of the previously approved
   version" / "train is closed for new build submissions"), so this step
   isn't optional for a second release.

2. **Build:**
   ```bash
   eas build --platform ios --profile production
   ```

3. **Submit the build that was just produced:**
   ```bash
   eas submit --platform ios --profile production --non-interactive --latest
   ```

4. **Wait for Apple to finish processing the upload** (usually 5-10 min,
   sometimes longer) — check status here:
   https://appstoreconnect.apple.com/apps/6797083484/testflight/ios

5. **Attach the build to a version and submit for review:**
   https://appstoreconnect.apple.com/apps/6797083484/distribution/ios/version/inflight
   - If the app is **not yet live** (first submission, or a rejected/pending
     version still open for edits): select the new build directly in the
     Build section on that page, then submit.
   - If the app is **already live** (this is a follow-up release): that
     page won't let you attach a new build to an already-released version.
     Click the small **dropdown chevron next to the app name** at the very
     top of the page (next to "Swipix: Swipe away the clutter", not the
     "iOS App Version X.X" heading below it) — that opens a "New Version"
     option. Enter the same `version` bumped in step 1, save, then on the
     new version's page: select the build, fill in "What's New in This
     Version" (required — "Add for Review" fails without it), and submit.

## Releasing to Android (Google Play closed testing)

Android submission isn't wired up for one-command `eas submit` yet —
`eas.json`'s `submit.production` only has an `ios` block. Until a Google
Cloud service account key is generated and added there (Play Console →
Setup → API access), builds have to be uploaded to Play Console by hand.

1. **Test on an actual Android device/emulator first** — all development
   and testing so far has been iPhone-only, so don't assume parity.
   ```bash
   npx expo run:android --device <device-id-from-adb-devices>
   ```

2. **Bump the version in `app.json`** if this is a follow-up release —
   same `version` field as the iOS flow above (shared between platforms).

3. **Build the Android app bundle:**
   ```bash
   eas build --platform android --profile production
   ```

4. **Upload the resulting `.aab` manually** in Play Console → Testing →
   Closed testing → your track → "Create new release."

5. **Closed testing requirement for new developer accounts:** 12 opted-in
   testers, continuously, for 14 days before production access can be
   requested. Uploading new releases (bug fixes, etc.) does **not** reset
   this clock — only the opted-in tester count dropping below 12 does.
   Since April 2026 Google also checks that testers are actually *using*
   the app, not just opted in, so it's worth nudging testers to open it.

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
