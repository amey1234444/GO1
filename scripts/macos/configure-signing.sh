#!/usr/bin/env bash
set -euo pipefail
# CI only. Never echo secret values or run with shell tracing enabled.
names=(APPLE_CERTIFICATE_P12_BASE64 APPLE_CERTIFICATE_PASSWORD APPLE_SIGNING_IDENTITY APPLE_ID APPLE_APP_SPECIFIC_PASSWORD APPLE_TEAM_ID)
present=0
for name in "${names[@]}"; do [[ -z "${!name:-}" ]] || present=$((present + 1)); done
if [[ "$present" == 0 ]]; then
  [[ "${GO1_REQUIRE_NOTARIZATION:-false}" != true ]] || { echo 'Notarized build requested but Apple signing secrets are missing.' >&2; exit 1; }
  echo 'GO1_SIGNED_RELEASE=0' >> "$GITHUB_ENV"
  echo 'No Apple credentials configured: building an ad-hoc preview, not a notarized release.'
  exit 0
fi
[[ "$present" == "${#names[@]}" ]] || { echo 'Incomplete Apple signing configuration. Configure all six documented secrets.' >&2; exit 1; }
[[ "$APPLE_SIGNING_IDENTITY" == 'Developer ID Application:'* ]] || { echo 'APPLE_SIGNING_IDENTITY must be a Developer ID Application identity.' >&2; exit 1; }
keychain="$RUNNER_TEMP/go1-signing.keychain-db"
certificate="$RUNNER_TEMP/go1-certificate.p12"
password="$(openssl rand -hex 32)"
trap 'rm -f "$certificate"' EXIT
printf '%s' "$APPLE_CERTIFICATE_P12_BASE64" | base64 --decode > "$certificate"
chmod 600 "$certificate"
security create-keychain -p "$password" "$keychain"
security set-keychain-settings -lut 21600 "$keychain"
security unlock-keychain -p "$password" "$keychain"
security import "$certificate" -P "$APPLE_CERTIFICATE_PASSWORD" -A -t cert -f pkcs12 -k "$keychain" >/dev/null
security set-key-partition-list -S apple-tool:,apple:,codesign: -k "$password" "$keychain" >/dev/null
security list-keychains -d user -s "$keychain" "$HOME/Library/Keychains/login.keychain-db"
security find-identity -v -p codesigning "$keychain" | grep -Fq "$APPLE_SIGNING_IDENTITY" || { echo 'Requested signing identity not found in imported certificate.' >&2; exit 1; }
echo 'GO1_SIGNED_RELEASE=1' >> "$GITHUB_ENV"
echo "GO1_SIGNING_KEYCHAIN=$keychain" >> "$GITHUB_ENV"
