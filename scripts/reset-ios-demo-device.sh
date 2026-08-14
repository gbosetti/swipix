#!/usr/bin/env bash
set -euo pipefail

# Wipes Swipix off a connected iPhone and rebuilds+reinstalls it as a
# Release build — the flow that produces an App-Review-accurate state
# (no dev-client error screen, no local-network permission prompt, and
# every onboarding/permission prompt fires fresh). Useful before
# recording a demo video or re-testing first-run behavior.
#
# Usage: scripts/reset-ios-demo-device.sh ["Device Name"]
# Defaults to "iPhone di Gabriela" if no device name is given.

DEVICE_NAME="${1:-iPhone di Gabriela}"
BUNDLE_ID="dev.bosetti.swipix"

echo "==> Uninstalling $BUNDLE_ID from \"$DEVICE_NAME\"…"
if ! xcrun devicectl device uninstall app --device "$DEVICE_NAME" "$BUNDLE_ID"; then
  echo "==> (nothing installed, or device unreachable — continuing anyway)"
fi

echo "==> Rebuilding and reinstalling (Release configuration)…"
echo "    If the device is locked, unlock it now — the launch step fails silently otherwise."
npx expo run:ios --device "$DEVICE_NAME" --configuration Release
