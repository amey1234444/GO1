#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
mkdir -p out/capture-probe
xcrun swiftc -swift-version 5 -parse-as-library -target "$(uname -m)-apple-macos14.0" \
  scripts/macos/capture-probe.swift -o out/capture-probe/go1-capture-probe \
  -framework AppKit -framework CoreGraphics -framework CoreMedia -framework CoreImage -framework ScreenCaptureKit
