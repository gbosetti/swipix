#!/usr/bin/env bash
set -euo pipefail

# Builds a production Android App Bundle (.aab) for Google Play.
#
# Why this is simpler than the iOS release (scripts/release-ios.sh): Google
# Play does NOT reject a reused marketing version (versionName) the way Apple
# rejects a reused CFBundleShortVersionString. It only requires a unique
# integer versionCode per upload — and eas.json already auto-increments that
# remotely (autoIncrement + appVersionSource:remote). So there is no
# mandatory version bump to forget here; the versionName just rides along
# with app.json "version" (driven by the iOS release cadence). This script's
# whole job is: gate on the test suite, then build the bundle.
#
# Auto-submit to Play is intentionally NOT wired up: submit.production in
# eas.json has no "android" entry (no Google Play service-account key), so
# the final step is a manual upload via Play Console -> "Carica app bundle".
# To make it hands-off later, add a Google Play service-account key to
# eas.json's submit.production.android, then append --auto-submit to the
# build command below.
#
# Usage: scripts/release-android.sh

cd "$(dirname "$0")/.."

echo "==> Pre-flight checks (typecheck, lint, tests)…"
echo "    A 20-minute build shouldn't be spent on code that fails these."
npm run typecheck
npm run lint
npm test

echo "==> Building the production Android App Bundle on EAS…"
echo "    Runs on EAS (~15-20 min). versionCode auto-increments remotely;"
echo "    versionName stays app.json \"version\" (currently what iOS shipped)."
npx eas-cli build --platform android --profile production --non-interactive

echo ""
echo "Done. When the build finishes:"
echo "  1. Open the build URL it printed (or https://expo.dev) and download the .aab."
echo "  2. In Play Console, use \"Carica app bundle\" to upload it to your track"
echo "     (closed testing until you're granted production access)."
