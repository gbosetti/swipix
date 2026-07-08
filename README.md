# Swipix — Tinder-style photo declutter app

Built with Expo (React Native) + TypeScript, React Navigation.

## Getting started

```bash
cd swipix
npm install
npx expo start
```

Scan the QR code with the Expo Go app on your iPhone. Note: `expo-media-library`
requires a physical device (or a custom dev client) — the iOS Simulator doesn't
have a real photo library to read.

Run `npm run typecheck` and `npm run lint` before committing.

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
