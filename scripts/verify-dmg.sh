#!/usr/bin/env bash
set -euo pipefail
[[ "$(uname -s)" == Darwin ]] || { echo 'Requires macOS' >&2; exit 1; }
file="$(find out/make -type f -name '*.dmg' -print -quit)"
[[ -n "$file" ]] || { echo 'No DMG found' >&2; exit 1; }
hdiutil verify "$file"
hdiutil imageinfo "$file" >/dev/null
MOUNT="$(mktemp -d "${TMPDIR:-/tmp}/go1-mount.XXXXXXXX")"
cleanup() { hdiutil detach "$MOUNT" -quiet >/dev/null 2>&1 || true; rmdir "$MOUNT" >/dev/null 2>&1 || true; }
trap cleanup EXIT
hdiutil attach -readonly -nobrowse -mountpoint "$MOUNT" "$file" >/dev/null
APP="$(find "$MOUNT" -maxdepth 1 -name '*.app' -type d -print -quit)"
[[ -d "$APP" ]] || { echo 'DMG contains no app bundle' >&2; exit 1; }
plutil -extract NSMicrophoneUsageDescription raw "$APP/Contents/Info.plist" >/dev/null
plutil -extract NSAudioCaptureUsageDescription raw "$APP/Contents/Info.plist" >/dev/null
if [[ "${GO1_BUNDLE_NATIVE:-0}" == 1 ]]; then
  BIN="$APP/Contents/Resources/native/bin"
  for name in ffmpeg ffprobe whisper-cli whisper-server; do
    [[ -x "$BIN/$name" ]] || { echo "Missing executable: $name" >&2; exit 1; }
    file "$BIN/$name" | grep -q arm64 || { echo "Wrong architecture: $name" >&2; exit 1; }
    if otool -L "$BIN/$name" | grep -E '^[[:space:]]+(/opt/homebrew/|/usr/local/)'; then
      echo "Executable depends on local Homebrew: $name" >&2
      exit 1
    fi
  done
  "$BIN/ffmpeg" -version >/dev/null
  "$BIN/ffprobe" -version >/dev/null
  echo 'All four embedded ARM64 transcription tools present.'
fi
printf 'Verified DMG: %s\n' "$file"
# Disk-image checks alone cannot detect an invalid app code signature.
codesign --verify --deep --strict --verbose=2 "$APP"
for binary in "$APP"/Contents/Resources/native/bin/*; do
  [[ ! -f "$binary" ]] || codesign --verify --strict "$binary"
done
SIGNING_LOG="out/release-evidence/signature.txt"
mkdir -p out/release-evidence
codesign -dvvv "$APP" > "$SIGNING_LOG" 2>&1
set +e
spctl --assess --type execute --verbose=4 "$APP" > out/release-evidence/gatekeeper.txt 2>&1
assessment=$?
set -e
notarized=false
if [[ "${GO1_SIGNED_RELEASE:-0}" == 1 ]]; then
  grep -q 'Authority=Developer ID Application:' "$SIGNING_LOG"
  xcrun stapler validate "$APP"
  [[ "$assessment" == 0 ]] || { cat out/release-evidence/gatekeeper.txt; exit 1; }
  notarized=true
else
  grep -q 'Signature=adhoc' "$SIGNING_LOG"
  echo 'Ad-hoc signature integrity passed. This preview is NOT Apple-notarized.'
fi
printf '{"signatureVerified":true,"developerIdNotarized":%s,"gatekeeperExitCode":%s}\n' "$notarized" "$assessment" > out/release-evidence/signing.json
node scripts/macos/package-report.js "$APP" "$file" out/release-evidence/signing.json

python3 scripts/macos/assess-download.py "$APP"
