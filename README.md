# Swipix — Tinder-style photo declutter app

Expo (React Native) + TypeScript. Can't run in Expo Go — it uses native modules, so it needs a dev or release build.

## Test on a physical device

Standalone release build that opens straight into the app (no Metro, no dev launcher):

```bash
npm run ios:reset-demo    # iPhone — uninstalls, then reinstalls a Release build
npm run android:device    # connected Android device — Release build
```

## Develop (fast JS iteration)

```bash
npm install
npx expo run:ios              # first run only: builds the dev client onto simulator/device
npx expo run:android         # same, for Android
npx expo start --dev-client  # after that: JS hot-reloads, no rebuild
```

Rerun `expo run:*` only when native code changes (new native dependency, `app.json` plugin config).

## Before committing

```bash
npm run typecheck && npm run lint && npm test   # all three also run in CI
```

## Release — iOS (App Store)

```bash
npm run release:ios              # bump patch + build + submit to App Store Connect
npm run release:ios -- minor     # or: major, or an exact version e.g. 1.4.0
```

The version bump is mandatory (Apple rejects a reused marketing version) — the script does it automatically. Then finish in App Store Connect: attach the build to a version and submit for review. If the app is already live, create a new version via the chevron next to the app name and fill in "What's New" (required).

## Release — Android (Google Play, closed testing)

```bash
npm run release:android          # builds the .aab (auto-submit not wired up yet)
```

Then upload the `.aab` in Play Console → Testing → Closed testing → Create new release. `versionCode` auto-increments; the marketing version can stay the same. Closed-testing gate for new accounts: 12 opted-in, actively-using testers for 14 continuous days before requesting production.
