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
