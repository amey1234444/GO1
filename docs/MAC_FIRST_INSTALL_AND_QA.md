# GO1 v0.8.0 — macOS Apple Silicon installer test guide

**Audience:** the app owner or testers using consented audio. Presentation Privacy stops capture and masks transcripts; it does not conceal active interview assistance from meeting platforms or proctoring.

## Build from source
```bash
npm install
npm test
bash scripts/build-macos-native.sh
npm run make:mac
GO1_BUNDLE_NATIVE=1 bash scripts/verify-dmg.sh
```
The DMG is generated under `out/make/`. Build needs Node 22+, CMake, Git and internet access. `whisper.cpp v1.9.5` is compiled to static ARM64 native executables and FFmpeg/ffprobe are copied from Mac ARM64 binary packages.

## Install
1. Download the **unsigned DMG** from the successful GitHub Actions macOS workflow's *Artifacts* section, or compile it locally.
2. Mount the DMG; drag GO1.app into Applications.
3. Because this developer preview is **unsigned and not notarized**, Gatekeeper may warn or block launch. Do not turn off system-wide Gatekeeper; use Finder's Open action only after verifying your own trusted build.
4. Open GO1, select Base or Small multilingual model and download it in the app (hundreds of MB); then recording runs entirely locally with no per-minute API bill.
5. Grant macOS microphone permission on request. System playback recording requires macOS 14.2+, separate system-audio permission and the participants' consent.

## Device validation checklist
- Launch the installed `.app` from Applications without Homebrew installed. Check that microphone/file transcription setup reports the four bundled tools.
- Transcribe English, Hindi, and Marathi samples; check real spoken content rather than fabricated test transcripts.
- Import both MP3 and WAV; check text, timestamps, TXT/SRT export.
- Start/stop live captions, verify audio meter and transcript, measure actual p50/p95 with the Latency Lab.
- Deny microphone permission; confirm safe error and no active recording.
- Explicitly start a system-playback session with consent; then revoke permission and check safe failure.
- Activate Presentation Privacy mid-recording. Audio tracks must stop, inference must cancel, transcript display must be masked, and returning must NOT automatically resume recording.
- Test selected-window sharing normally. GO1 does not promise invisibility on full-desktop sharing, Meet, Teams, Zoom, or proctoring.

## Limits before commercial distribution
The GitHub runner can verify the mounted DMG, binary architecture, and bundled executables, but cannot validate your physical microphone or meeting app. The preview has no Apple Developer ID signature or notarization. Review FFmpeg LGPL/GPL licensing and supply applicable notices/source before commercial release. No sub-500ms inference SLA is claimed; use actual benchmarks on your Mac.

## v0.9 privacy acceptance

- Verify Command+Shift+9 from a different foreground application; it must stop transcription in GO1 and mask the UI.
- Verify the emergency shortcut cannot resume recording.
- Verify entering privacy during the macOS microphone permission prompt does not start late capture.
- Verify selecting Return to workspace does not restore previous transcript text or automatically resume a stream.
- Follow `docs/SHARE_SAFE_ACCEPTANCE.md` with two participating devices for each meeting product.
