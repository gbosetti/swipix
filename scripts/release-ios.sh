#!/usr/bin/env bash
set -euo pipefail

# One-command iOS release: bumps the marketing version, commits it, then
# builds and submits to App Store Connect.
#
# Why this exists: the build number auto-increments on EAS (autoIncrement +
# appVersionSource:remote in eas.json), but the marketing version
# (CFBundleShortVersionString / app.json "version") does NOT — and once a
# version is approved, Apple permanently closes that "train" and rejects any
# new build reusing it (ITMS-90186 / ITMS-90062). Forgetting to bump it is
# the one manual step that keeps causing rejections, so this script never
# lets it be skipped.
#
# Usage:
#   scripts/release-ios.sh            # bump patch  (1.0.2 -> 1.0.3, the default)
#   scripts/release-ios.sh minor      # bump minor  (1.0.2 -> 1.1.0)
#   scripts/release-ios.sh major      # bump major  (1.0.2 -> 2.0.0)
#   scripts/release-ios.sh 1.4.0      # set an exact version
#
# The build takes ~15-20 min on EAS; --auto-submit sends it to App Store
# Connect automatically once it finishes, using the "production" submit
# profile (ascAppId) in eas.json.

cd "$(dirname "$0")/.."

BUMP="${1:-patch}"

echo "==> Pre-flight checks (typecheck, lint, tests)…"
echo "    A 20-minute build shouldn't be spent on code that fails these."
npm run typecheck
npm run lint
npm test

echo "==> Bumping marketing version in app.json…"
NEW_VERSION="$(BUMP="$BUMP" node -e '
  const fs = require("fs");
  const file = "app.json";
  const raw = fs.readFileSync(file, "utf8");
  const cur = JSON.parse(raw).version;
  const semver = /^\d+\.\d+\.\d+$/;
  if (!semver.test(cur)) {
    console.error(`app.json version is not X.Y.Z: ${cur}`);
    process.exit(1);
  }
  const bump = process.env.BUMP;
  let next;
  if (semver.test(bump)) {
    next = bump;
  } else {
    let [maj, min, pat] = cur.split(".").map(Number);
    if (bump === "major") { maj += 1; min = 0; pat = 0; }
    else if (bump === "minor") { min += 1; pat = 0; }
    else if (bump === "patch") { pat += 1; }
    else { console.error(`Unknown bump "${bump}" — use patch|minor|major or an X.Y.Z version`); process.exit(1); }
    next = `${maj}.${min}.${pat}`;
  }
  if (next === cur) {
    console.error(`Version is already ${cur} — nothing to bump`);
    process.exit(1);
  }
  // Surgical replace of just the top-level version value, so the rest of
  // app.json keeps its exact formatting and key order.
  const updated = raw.replace(/("version":\s*")\d+\.\d+\.\d+(")/, `$1${next}$2`);
  if (updated === raw) {
    console.error("Could not find the version field to update in app.json");
    process.exit(1);
  }
  fs.writeFileSync(file, updated);
  console.log(next);
')"

echo "==> Marketing version is now $NEW_VERSION (build number auto-increments on EAS)."

# Commit only app.json, so the release commit is clean and the repo always
# records exactly which version was submitted. EAS builds from the committed
# state, so this must happen before the build.
git add app.json
git commit -m "chore: bump ios version to $NEW_VERSION"

echo "==> Building and submitting to App Store Connect…"
echo "    This runs on EAS (~15-20 min) and auto-submits when the build finishes."
npx eas-cli build --platform ios --profile production --auto-submit --non-interactive

echo ""
echo "Done. Version $NEW_VERSION is building on EAS and will be submitted to"
echo "App Store Connect automatically. Track it at https://expo.dev and, once"
echo "processing finishes, at https://appstoreconnect.apple.com."
