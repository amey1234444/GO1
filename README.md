# GO1 0.6.0 — Private multilingual transcription and measured latency for macOS

GO1 is a **local-first Electron application for consent-based recording and transcription**. It has two recording sources—microphone and macOS system playback audio—plus file import and exports. No model API key, cloud account, or subscription is required for local speech recognition.

> **Status:** This repository has automated JavaScript tests and a macOS build workflow. Recording permissions, real multilingual accuracy, model downloads, the signed app, and hardware performance still require real-device testing. No Mac device test or notarized build is claimed here.

## Presentation privacy (new in 0.4.0)

The **Enable presentation privacy** button immediately stops active local microphone/system-audio capture, cancels transcription, clears the workspace transcript and displays a full-window privacy screen. **Return to workspace** does not restart recording. This is for authorized presentation hygiene, not stealth or invisibility. Platform share modes vary; see `docs/MEETING_PRESENTATION_PRIVACY.md`. Previously exported files remain unchanged.

## Implemented

- Microphone recording, imported audio decoding with FFmpeg, and on-demand speech-to-text (Whisper CLI).
- Near-real-time captions using **energy-based speech activity detection** to batch utterances and a **persistent `whisper-server` subprocess**; no repeated model load between utterances.
- Optional Silero VAD model invoked by `whisper-server`, if downloaded; energy VAD still gates recording locally to avoid sending silence windows.
- Transcription for languages supported by multilingual Whisper models with automatic detection, optional English translation and selected language override.
- Voice timestamps, transcript exports to TXT / SRT / VTT / JSON.
- Explicit user-selected system playback capture on macOS 14.2+ via Electron's `desktopCapturer` CoreAudio tap loopback path. System video frames are not saved or sent to the speech engine.
- In-app model manager for base, small, medium, large-v3-turbo and optional Silero VAD, with progress, cancellation, downloaded file-size/magic verification, atomic files and validated presets.
- Electron security: context isolation, sandbox, limited IPC, CSP, local-only model server bound to `127.0.0.1`.
- macOS unsigned build workflow and **optional** code signing/notarization configuration.

## Quick start (Apple Silicon Mac)

Prerequisites: macOS 14.2+ for the system playback capture feature, Node.js 22, npm, Homebrew, free space for a downloaded model. The microphone and imported file functions may work on older macOS versions, subject to Electron compatibility.

```bash
brew install ffmpeg whisper.cpp
# Confirm both binaries (Homebrew's current formula provides them):
command -v ffmpeg
command -v whisper-cli
command -v whisper-server

npm install
npm start
```

In the UI, choose **Small** and click **Install / select**. You can switch to Base on slower machines or Medium on capable machines. Use **Install Silero VAD (optional)** for additional speech/silence processing by whisper.cpp. Local model downloads can be hundreds of MB or several GB and require an internet connection initially.

Alternatively run the existing setup script `bash scripts/setup-macos.sh small` to install tools and download the default small model from Hugging Face. After that, all transcription requests run locally.

If you have an alternate `whisper-server` executable:

```bash
GO1_WHISPER_SERVER_PATH="/absolute/path/to/whisper-server" npm start
```

## System audio permission and privacy

1. Tell the other meeting participants before recording. Obtain legally required consent; some meeting hosts or jurisdictions prohibit recording.
2. Select **Mac system playback audio** under Recording source, then start recording.
3. macOS may request **System Audio Recording** and/or **Screen & System Audio Recording** access. Grant access to the signed GO1 app (when running from Terminal, the responsible process can be Terminal/IDE). Restart the app if macOS requires it.
4. If the selected system-audio track is `ended` or missing, GO1 displays a permission-related error instead of silently creating an empty transcript.
5. In live mode only the audio track enters the AudioWorklet; any accompanying display-video track is disabled and never written to a recording file.

Electron uses CoreAudio Tap for system audio on macOS 14.2+, with `NSAudioCaptureUsageDescription` in Info.plist. This requires a recent Electron runtime. System capture has **not yet been verified on a physical Mac**, and behaves differently across OS versions and privacy setups.

## How live transcription works

`AudioWorklet` produces 16 kHz PCM chunks. `SpeechSegmenter` examines 20 ms audio frames, keeps 250 ms of pre-roll, requires roughly 180 ms of activity, and closes an utterance after 550 ms of silence or 11 seconds of continuous speech. `VadLiveSession` enqueues a bounded number of utterances (maximum 3 pending), sends them sequentially to a private `whisper-server` (launched only as needed), maps relative segment timestamps back to recording time, and updates the UI. The worker is reused for subsequent utterances and stopped when GO1 quits or the model changes.

The energy detector is intentionally lightweight but not perfect: wind, background noise, quiet whispering, music, and different microphone gain may cause false triggers or lost words. The optional Silero VAD model improves the Whisper inference stage, but latency and accuracy depend on hardware/model/audio and should be benchmarked.

**Not sample-by-sample realtime:** captions appear after phrase segmentation plus model inference. Expect variable delay, especially with larger models. `whisper-server` currently accepts utterance audio as HTTP multipart WAV; it is not a raw streaming-WebSocket STT model.

## Model sources and limitations

Whisper model source: `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-<MODEL>.bin`.

Silero VAD source: `https://huggingface.co/ggml-org/whisper-vad/resolve/main/ggml-silero-v6.2.0.bin`.

The app validates allowlisted names, HTTPS URL presets, expected file sizes and Whisper file magic, but **full cryptographic SHA-256 verification is not yet included**. Production software should pin an audited manifest of checksums for each selected model version. Model support does not guarantee identical accuracy in all languages; mixed-language code-switching can still make language detection difficult.

## Commands

```bash
npm run check    # Syntax checks
npm test         # Unit and orchestrator tests, no actual model needed
npm run make     # macOS zip + unsigned DMG in out/make/
```

### Signing and notarization

On a properly configured Mac, install your Apple-issued Developer ID Application certificate in the login keychain and provide these environment variables outside Git:

```bash
export APPLE_ID='your-apple-developer-id'
export APPLE_APP_SPECIFIC_PASSWORD='your-notarytool-app-password'
export APPLE_TEAM_ID='your-apple-team-id'
bash scripts/release-macos.sh
```

`GO1_SIGNED_RELEASE=1` enables Electron Forge's `osxSign` and `osxNotarize`. **Never commit signing credentials.** Successful signed/notarized output requires a paid Apple Developer membership, matching certificate, valid Apple credentials, and a macOS build environment; nothing in the repository alone performs Apple's service on your behalf. Verify with:

```bash
codesign --verify --deep --strict --verbose=2 'out/GO1-darwin-arm64/GO1.app'
spctl --assess --type execute --verbose 'out/GO1-darwin-arm64/GO1.app'
```

The distribution currently depends on user-installed FFmpeg and whisper.cpp. A truly turnkey commercial DMG must bundle, sign, and test compatible binaries for all supported macOS CPU architectures and verify third-party license notices.

## Tests & manual verification

Run `npm test`; then see [MACOS_QA.md](docs/MACOS_QA.md) for the physical-device acceptance matrix. The GitHub Actions macOS workflow builds a **non-notarized preview**. A successful CI build does not prove microphone permissions or actual audio capture. There is currently no hidden/silent recording or monitoring-feature implementation.


### Sharing guide and recording visibility (v0.5.0)

- GO1 shows an explicit **Capture off / Requesting audio permission / Recording microphone / Recording system audio** indicator.
- Live microphone recordings expose an in-app audio level meter so you can tell whether audio is actually being received.
- The meeting guide explains selected-window sharing in Meet, Teams, and Zoom and includes **Stop capture & mask transcript**.
- No covert audio recording, proctoring evasion, process hiding, or guarantees that an overlay is invisible to screen sharing are provided.
- Test live input and screen-sharing from a second participant on macOS before release.

## GO1 v0.6.0 — measured latency and local mock-interview review

- **Fast captions:** Choose Fast (260 ms silence holdback) or Balanced (550 ms). Faster chunk dispatch trades away sentence continuity; no device-specific speed guarantee.
- **Latency Lab:** Displays measured post-VAD queue + Whisper inference p50/p95 and the last 20 completed real utterance samples. The chart is empty until live speech has actually been recognized. This is NOT a <500 ms AI-answer benchmark.
- **Practice Review:** At the end of a consented recording or imported practice audio file, the app reports local word count, overall pace and a conservative list of possible filler expressions. These heuristic observations are not AI grading and do not establish answer quality.
- **Real benchmarking:** `node scripts/benchmark-whisper.js /path/to/consented-speech.wav 8`, for repeatable, local, real-model inference numbers. Details and limitations: [docs/LATENCY_RESEARCH_AND_TESTING.md](docs/LATENCY_RESEARCH_AND_TESTING.md).
- For an intended end-to-end sub-500 ms first-caption target, a *genuine streaming ASR provider* requires future integration and physical Mac measurements. The current persistent Whisper worker is utterance-based.
