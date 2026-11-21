#!/usr/bin/env bash
set -euo pipefail
[[ "$(uname -s)" == Darwin && "$(uname -m)" == arm64 ]] || { echo 'Requires Apple Silicon Mac' >&2; exit 1; }
for tool in git cmake npm otool file; do command -v "$tool" >/dev/null || { echo "Missing $tool" >&2; exit 1; }; done
cd "$(dirname "$0")/.."
ROOT="$(pwd)"
OUT="$ROOT/build/native"
mkdir -p "$OUT/bin" "$OUT/licenses"
# Native, platform-matched FFmpeg utilities; review redistribution licensing.
npm install --no-save --no-package-lock --no-audit --no-fund @ffmpeg-installer/ffmpeg @ffprobe-installer/ffprobe
FFMPEG="$(node -p "require('@ffmpeg-installer/ffmpeg').path")"
FFPROBE="$(node -p "require('@ffprobe-installer/ffprobe').path")"
[[ -f "$FFMPEG" && -f "$FFPROBE" ]] || { echo 'FFmpeg tools not installed' >&2; exit 1; }
install -m 755 "$FFMPEG" "$OUT/bin/ffmpeg"
install -m 755 "$FFPROBE" "$OUT/bin/ffprobe"
REF="${GO1_WHISPER_REF:-v1.9.5}"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
git clone --depth 1 --branch "$REF" https://github.com/ggml-org/whisper.cpp.git "$WORK/whisper.cpp"
cmake -S "$WORK/whisper.cpp" -B "$WORK/whisper.cpp/build" \
  -DCMAKE_BUILD_TYPE=Release \
  -DCMAKE_OSX_ARCHITECTURES=arm64 \
  -DCMAKE_OSX_DEPLOYMENT_TARGET=14.2 \
  -DBUILD_SHARED_LIBS=OFF \
  -DWHISPER_BUILD_TESTS=OFF \
  -DWHISPER_BUILD_EXAMPLES=ON \
  -DWHISPER_BUILD_SERVER=ON \
  -DGGML_METAL=ON \
  -DGGML_METAL_EMBED_LIBRARY=ON
cmake --build "$WORK/whisper.cpp/build" --config Release --parallel 3 --target whisper-cli whisper-server
for name in whisper-cli whisper-server; do install -m 755 "$WORK/whisper.cpp/build/bin/$name" "$OUT/bin/$name"; done
cp "$WORK/whisper.cpp/LICENSE" "$OUT/licenses/whisper-cpp-LICENSE.txt"
printf 'whisper.cpp release: %s\nReview FFmpeg binary licensing before any commercial redistribution.\n' "$REF" > "$OUT/licenses/THIRD_PARTY_NOTICES.txt"
for name in ffmpeg ffprobe whisper-cli whisper-server; do
  BIN="$OUT/bin/$name"
  file "$BIN" | grep -q arm64 || { echo "Non-arm64 executable: $name" >&2; exit 1; }
  if otool -L "$BIN" | grep -E '^[[:space:]]+(/opt/homebrew/|/usr/local/)'; then
    echo "Non-relocatable dynamic dependency: $name" >&2
    exit 1
  fi
done
"$OUT/bin/ffmpeg" -version | head -n 1
"$OUT/bin/ffprobe" -version | head -n 1
echo 'Bundled transcription tools ready: npm run make:mac'
