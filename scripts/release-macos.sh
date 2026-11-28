#!/usr/bin/env bash
set -euo pipefail
[[ "$(uname -s)" == Darwin ]] || { echo 'Must run on macOS' >&2; exit 1; }
: "${APPLE_ID:?APPLE_ID is required}"
: "${APPLE_APP_SPECIFIC_PASSWORD:?APPLE_APP_SPECIFIC_PASSWORD is required}"
: "${APPLE_TEAM_ID:?APPLE_TEAM_ID is required}"
# Must be an Apple Developer ID Application certificate in the active keychain.
if ! security find-identity -v -p codesigning | grep -q 'Developer ID Application'; then
  echo 'Missing Developer ID Application signing identity' >&2; exit 1
fi
export GO1_SIGNED_RELEASE=1
export GO1_BUNDLE_NATIVE=1
npm install --no-audit --no-fund
npm run check
npm test
bash scripts/build-macos-native.sh
node scripts/bundle-speech-model.js
npm run make:mac
python3 scripts/macos/optimize-dmg.py
bash scripts/verify-dmg.sh
printf '\nInspect out/make/ before distributing. Verify signature and notarization with codesign and spctl.\n'
