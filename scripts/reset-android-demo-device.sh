#!/usr/bin/env bash
set -euo pipefail

# Builds and installs a standalone RELEASE app on a connected Android device —
# the Android twin of `npm run ios:reset-demo`.
#
# Release, not debug, on purpose: a debug build bundles no JS, so it needs a
# running Metro dev server and (with expo-dev-client installed) opens the
# "Development servers" launcher instead of the app. A release build bundles
# the JS inside the APK, so it installs as a real standalone app that opens
# straight into Swipix — no dev server, no launcher, nothing Expo-facing. It's
# signed with the debug keystore (see android/app/build.gradle release
# buildType), which is fine for on-device testing.
#
# It always uninstalls first, like ios:reset-demo — a guaranteed-clean install
# every time: fresh onboarding/permissions, and no versionCode-downgrade block
# from an existing store build (a local build is always versionCode 1, and
# Android won't install that over a higher store versionCode). Photos live in
# the gallery (MediaStore), not app data, so they survive; only Swipix's own
# state (Trash/Kept/onboarding) is cleared.
#
# Usage: scripts/reset-android-demo-device.sh [device-id]
#   device-id defaults to the single connected device (from `adb devices`).

cd "$(dirname "$0")/.."

# Gradle needs a JDK. If neither is on PATH nor JAVA_HOME is set, fall back to
# the JDK that Android Studio bundles (the usual macOS setup) so this works
# from a plain shell that never exported JAVA_HOME.
if ! command -v java >/dev/null 2>&1 && [ -z "${JAVA_HOME:-}" ]; then
  ANDROID_STUDIO_JBR="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
  if [ -x "$ANDROID_STUDIO_JBR/bin/java" ]; then
    export JAVA_HOME="$ANDROID_STUDIO_JBR"
    echo "==> Using Android Studio's bundled JDK (JAVA_HOME was not set)."
  fi
fi

# Gradle needs the Android SDK location. If ANDROID_HOME isn't set, fall back
# to the default macOS SDK path so gradle can find it from a plain shell.
if [ -z "${ANDROID_HOME:-}" ] && [ -d "$HOME/Library/Android/sdk" ]; then
  export ANDROID_HOME="$HOME/Library/Android/sdk"
  echo "==> Using Android SDK at $ANDROID_HOME (ANDROID_HOME was not set)."
fi

PACKAGE="dev.bosetti.swipix"
ADB="${ANDROID_HOME:-$HOME/Library/Android/sdk}/platform-tools/adb"
if ! [ -x "$ADB" ]; then
  ADB="adb"
fi

DEVICE="${1:-}"
if [ -z "$DEVICE" ]; then
  DEVICE="$("$ADB" devices | awk '$2 == "device" { print $1 }' | head -1)"
  if [ -z "$DEVICE" ]; then
    echo "No Android device connected. Run 'adb devices' to check." >&2
    exit 1
  fi
fi
echo "==> Target device: $DEVICE"

# Block until the device is genuinely ready. Without this, a device that's
# mid-reconnect over USB can still show up in `adb devices` yet be gone by the
# time expo does its own lookup a moment later.
"$ADB" -s "$DEVICE" wait-for-device

# $DEVICE is the adb serial — correct for the `adb -s` calls below, but NOT for
# `expo run:android --device`. Expo matches that flag against the device NAME,
# which it derives from the `model:` field of `adb devices -l` (e.g.
# model:SM_A165F -> "SM_A165F"), never the serial — confirmed in @expo/cli's
# adb.js. Passing the serial fails as "Could not find device with name: <serial>".
EXPO_NAME="$("$ADB" devices -l | awk -v s="$DEVICE" '$1 == s { for (i = 1; i <= NF; i++) if ($i ~ /^model:/) { sub(/^model:/, "", $i); print $i } }')"

# Always uninstall first for a guaranteed-clean install (like ios:reset-demo):
# fresh onboarding/permissions, and no versionCode-downgrade block from an
# existing store build. `|| true` so a first-ever install (nothing to remove)
# isn't treated as an error. Gallery photos are untouched (MediaStore, not app
# data); only Swipix's own state clears.
echo "==> Uninstalling any existing install for a clean slate…"
"$ADB" -s "$DEVICE" uninstall "$PACKAGE" || true

echo "==> Building and installing the standalone release app…"
if [ -n "$EXPO_NAME" ]; then
  npx expo run:android --device "$EXPO_NAME" --variant release
else
  # Couldn't derive the model name — fall back to letting expo auto-pick the
  # single connected device (no --device flag).
  npx expo run:android --variant release
fi
