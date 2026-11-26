#!/usr/bin/env bash
set -euo pipefail
[[ "$(uname -s)" == Darwin && "$(uname -m)" == arm64 ]] || { echo 'Requires Apple Silicon Mac' >&2; exit 1; }
for tool in git cmake npm otool file strip; do command -v "$tool" >/dev/null || { echo "Missing $tool" >&2; exit 1; }; done
cd "$(dirname "$0")/.."
ROOT="$(pwd)"
OUT="$ROOT/build/native"
mkdir -p "$OUT/bin" "$OUT/licenses"
# Build local-file decoding tools instead of shipping general-purpose media
# encoders, network protocols, capture devices and unused output formats.
# Keep all built-in decoders/demuxers for the app's imported audio formats.
REF="${GO1_WHISPER_REF:-v1.9.5}"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
FFMPEG_REF=3a0867c2bfda4a4d4309ca1a8cbdc6175e67f587 # FFmpeg n7.1.5
curl --fail --location --retry 3 --silent --show-error "https://codeload.github.com/FFmpeg/FFmpeg/tar.gz/$FFMPEG_REF" -o "$WORK/ffmpeg.tar.gz"
mkdir -p "$WORK/ffmpeg"
tar -xzf "$WORK/ffmpeg.tar.gz" --strip-components=1 -C "$WORK/ffmpeg"
(
  cd "$WORK/ffmpeg"
  ./configure --arch=arm64 --target-os=darwin --cc=clang \
    --disable-autodetect --disable-debug --disable-doc --enable-small \
    --enable-static --disable-shared --disable-ffplay --disable-network \
    --disable-avdevice --disable-postproc --disable-encoders --enable-encoder=pcm_s16le \
    --disable-muxers --enable-muxer=wav,pcm_s16le \
    --disable-filters --enable-filter=aresample,aformat,anull,atrim \
    --disable-protocols --enable-protocol=file,pipe \
    --extra-cflags=-mmacosx-version-min=14.2 --extra-ldflags="-mmacosx-version-min=14.2 -Wl,-dead_strip"
  make -j3 ffmpeg ffprobe
)
install -m 755 "$WORK/ffmpeg/ffmpeg" "$OUT/bin/ffmpeg"
install -m 755 "$WORK/ffmpeg/ffprobe" "$OUT/bin/ffprobe"
cp "$WORK/ffmpeg/COPYING.LGPLv2.1" "$OUT/licenses/FFmpeg-LGPLv2.1.txt"
cp "$WORK/ffmpeg/LICENSE.md" "$OUT/licenses/FFmpeg-LICENSE.md"
printf 'FFmpeg source: https://github.com/FFmpeg/FFmpeg/tree/%s\nBuild options: scripts/build-macos-native.sh in the GO1 source release.\n' "$FFMPEG_REF" > "$OUT/licenses/FFmpeg-SOURCE.txt"
curl --fail --location --retry 3 --silent --show-error "https://codeload.github.com/ggml-org/whisper.cpp/tar.gz/refs/tags/$REF" -o "$WORK/whisper.tar.gz"
mkdir -p "$WORK/whisper.cpp"
tar -xzf "$WORK/whisper.tar.gz" --strip-components=1 -C "$WORK/whisper.cpp"
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
curl --fail --location --retry 3 --silent --show-error https://raw.githubusercontent.com/openai/whisper/main/LICENSE -o "$OUT/licenses/whisper-model-MIT.txt"
cp "$WORK/whisper.cpp/LICENSE" "$OUT/licenses/whisper-cpp-LICENSE.txt"
printf 'whisper.cpp release: %s\nFFmpeg: LGPL v2.1 or later; source and build flags are recorded in FFmpeg-SOURCE.txt.\n' "$REF" > "$OUT/licenses/THIRD_PARTY_NOTICES.txt"
for name in ffmpeg ffprobe whisper-cli whisper-server; do
  BIN="$OUT/bin/$name"
  # Remove debug/local symbols only; keep architecture and exported symbols.
  strip -S -x "$BIN"
  file "$BIN" | grep -q arm64 || { echo "Non-arm64 executable: $name" >&2; exit 1; }
  if otool -L "$BIN" | grep -E '^[[:space:]]+(/opt/homebrew/|/usr/local/)'; then
    echo "Non-relocatable dynamic dependency: $name" >&2
    exit 1
  fi
done
"$OUT/bin/ffmpeg" -version | head -n 1
"$OUT/bin/ffprobe" -version | head -n 1
echo 'Bundled transcription tools ready: npm run make:mac'
