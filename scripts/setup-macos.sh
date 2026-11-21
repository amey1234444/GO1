#!/usr/bin/env bash
set -euo pipefail

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "This setup script is for macOS. Install whisper.cpp and ffmpeg manually on other platforms." >&2
  exit 1
fi
if ! command -v brew >/dev/null; then
  echo "Install Homebrew first: https://brew.sh" >&2
  exit 1
fi

MODEL="${1:-small}"
case "$MODEL" in
  base|small|medium|large-v3-turbo) ;;
  *) echo "Choose a multilingual model: base, small, medium, large-v3-turbo" >&2; exit 1;;
esac

brew install ffmpeg whisper.cpp
MODEL_DIR="$HOME/Library/Application Support/GO1/models"
mkdir -p "$MODEL_DIR"
DEST="$MODEL_DIR/ggml-${MODEL}.bin"
if [[ -s "$DEST" ]]; then
  echo "Model already exists: $DEST"
  exit 0
fi
URL="https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-${MODEL}.bin"
echo "Downloading multilingual model '$MODEL' (can be several gigabytes) ..."
curl --fail --location --retry 3 --progress-bar "$URL" -o "${DEST}.part"
mv "${DEST}.part" "$DEST"
echo "Model installed: $DEST"
echo "Run npm install && npm start in the GO1 repository."
