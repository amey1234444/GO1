# GO1

## v0.18 — floating translucent companion

Launch a frameless companion with readable opaque text, adjustable translucent surfaces, transcript and AI notes side by side, a compact toolbar and direct local AI questions. [Design, GO Client findings and verification](docs/FLOATING_COMPANION.md). Capture protection remains independent from appearance and from Stop & mask.

## v0.17 — live protection keeps processing active

**Live capture protection (stealth)** leaves transcription and enabled AI running. **Stop & mask** deliberately stops both. Workspace and companion windows disable background throttling, and the UI reports live session/AI status separately from capture protection. [Live mode behavior and Google Meet verification](docs/LIVE_PROTECTION_AND_MEET.md).

[Download unsigned Apple Silicon v0.17.0 DMG](https://github.com/amey1234444/GO1/actions/runs/44982275234/artifacts/14738054082). [Actual companion/capture screenshots and provenance](docs/LIVE_PROTECTION_AND_MEET.md#recorded-app-and-capture-screenshots--22-november-2026) are embedded in the documentation. Both Mac renderer experiments and 96 automated tests passed. Actual Google Meet receiver verification remains outstanding.

## v0.16 — macOS panel and pixel capture validation

The Mac companion now uses a frameless nonactivating panel, the screen-saver window level, all Spaces/fullscreen visibility and inactive initial display. Capture protection remains a separate best-effort request.

The [macOS validation guide](docs/MACOS_CAPTURE_VALIDATION.md) explains the ScreenCaptureKit pixel experiment. It tests an ordinary window, the actual GO1 panel policy, an accessory-app variant and selected-window capture, including a running stream after its filter is refreshed. Reports include captured PNGs, pixel counts and explicit blocked/exposed/inconclusive results. This does not certify any meeting application's receiver output.

**Measured on 22 November 2026:** the protected panel had zero detected marker pixels in a screenshot and all sampled initial/refreshed stream frames on macOS 15.8.2 and 26.7.2 with Electron 39.8.10. Both unprotected controls remained visible. [Read the results and inspect the preserved images](docs/MACOS_CAPTURE_VALIDATION.md#recorded-results-22-november-2026). [Download the unsigned Apple Silicon v0.16.0 DMG](https://github.com/amey1234444/GO1/actions/runs/44979826090/artifacts/14737715553) (GitHub artifact expires 6 December 2026).


## v0.15 — best-effort screen-capture protection

GO1 now requests OS capture protection for the workspace, live companion and review windows **before they appear**. It reapplies the policy on show/restore and saves the setting across restarts. Use **Request screen-capture protection** under **Control what you present** to inspect or change it.

**macOS ScreenCaptureKit can still capture protected windows.** This is not guaranteed invisibility in Zoom, Google Meet or Teams. Check the receiving device; use selected-window/tab sharing or the existing stop-and-mask action when exclusion is unverified. Capture protection does not stop recording.

See the [DMG/repository study, implementation and receiver test plan](docs/CAPTURE_PROTECTION_STUDY.md), [static evidence](docs/evidence/go-client-2.0.11-static.json) and [validation record](docs/evidence/validation.json). Older release notes below describe their original behavior; v0.15 supersedes statements that capture exclusion is absent.


## v0.14 — Audio transport health (historical)

This version repairs a live PCM16 sample/byte mismatch between AudioWorklet and VAD; adds source-labelled audio diagnostics (RMS, clipping, received duration, possible arrival stalls); retains emergency privacy shutdown; and adds independent comparison documentation at `docs/GO_CLIENT_AUDIO_COMPARISON_V014.md`. It does **not** copy the proprietary GO Client native module or add covert capture evasion. The diagnostics panel is in the normal workspace's Latency Lab. Real Apple Silicon microphone/system-audio validation is still required.

## GO1 v0.13 — Visible Live Companion

Launching a consent-based live session opens a compact 94%-opacity **ordinary macOS/Windows app window** with latest live transcript, selected role/language and manually requested local Ollama talking points. The panel can be reopened from **Show companion**, adjusted to 82–100% opacity, closed, or used to trigger **Stop & mask**. Stopping a session or engaging Presentation Privacy closes the companion and clears in-memory text. It does **not** evade screen-sharing or proctoring: the panel may be visible to other participants when sharing a desktop. No capture exclusion, click-through, process hiding, automatic AI answers, or stealth behavior is implemented.

## macOS first: testable ARM64 DMG (v0.10.0)

The **macOS Apple Silicon DMG workflow** now builds and bundles `ffmpeg`, `ffprobe`, `whisper-cli`, and a persistent `whisper-server` in `GO1.app/Contents/Resources/native/bin`. The model is downloaded on the first launch from inside GO1; no per-minute API charges. For local builds, run `bash scripts/build-macos-native.sh && npm run make:mac`, then `GO1_BUNDLE_NATIVE=1 bash scripts/verify-dmg.sh`. Full Mac installation and recording checklist: [docs/MAC_FIRST_INSTALL_AND_QA.md](docs/MAC_FIRST_INSTALL_AND_QA.md).

**Privacy boundary:** presentation privacy stops recording and masks transcripts. The app does not offer anti-capture or invisible interview assistance. The preview DMG is unsigned and must be tested on your Mac; macOS will require user permission for microphone or system playback capture.

# GO1 0.6.0 — Private multilingual transcription and measured latency for macOS

## Interview Studio (v0.11.0)

GO1 now has a **visible, consent-based mock-interview studio** with independently designed dark desktop UI.

1. Enter a target role, short role description, job description, practice focus, and spoken language (or automatic recognition).
2. Click **Save context** to store settings only on this computer in GO1's user-data directory (`practice-profile.json`, mode `0600`). The profile is never submitted to a cloud service by GO1.
3. Install a multilingual Whisper model in the Model Manager, then choose **Launch consented live session**. GO1 starts explicit microphone recording with local VAD and captioning; Mac permissions still apply.
4. Stop the recording. The completed transcript appears in the normal GO1 transcript panel.
5. Optionally run a local AI coach: install [Ollama](https://ollama.com/), run `ollama pull qwen3:4b`, and keep Ollama running. Select your locally installed model in the studio and click **Generate practice feedback** after recording. Answers stream only into the normal visible window.

The app talks to Ollama only on `127.0.0.1:11434`. There is no embedded API key. If Ollama is unavailable, transcription and deterministic practice statistics continue working, and the coach shows a clear error. The coach uses the saved role/JD context and the completed transcript, but may produce incorrect information; review its suggestions. There is **no live hidden answer generation**, no anti-capture invisibility, and Presentation Privacy cancels active work.

On macOS, build the unsigned DMG with `bash scripts/build-macos-native.sh && npm run make:mac`; the existing GitHub macOS workflow performs installation verification of the bundled transcription binaries. Physical microphone tests, speech quality and notarization remain separate requirements.


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

## GO1 v0.10.0 — Windows MSI and macOS DMG release pipeline

GO1 now has two OS-native unsigned installer builds in `.github/workflows/installers.yml`:

| Runner | Architecture | Output | Build check |
| --- | --- | --- | --- |
| `windows-2025` | Windows x64 | `.msi` (WiX 3) | MSI database metadata validation |
| `macos-15` | macOS arm64 | `.dmg` | `hdiutil verify` and `imageinfo` |

**These installers do not yet bundle FFmpeg or whisper.cpp**, and they are not signed.
They package the Electron application, while first-run local transcription still requires the user to install the native tools and a multilingual model. A successful installer build does not establish fully working ASR on a fresh Windows PC or Mac.

Windows prerequisites: install FFmpeg, install/compile whisper.cpp's `whisper-cli.exe` and `whisper-server.exe`, then run `powershell -ExecutionPolicy Bypass -File scripts/setup-windows.ps1` to review any missing dependencies. To install FFmpeg explicitly with winget, use `-InstallFFmpeg`.

Windows currently supports microphone recording and file import; GO1 explicitly disables the macOS-only system playback option on Windows. The permission-based Windows capture pipeline is not yet implemented.

Release evidence and testing matrix: [docs/RELEASE_AND_PRIVACY_QA.md](docs/RELEASE_AND_PRIVACY_QA.md).
GitHub Actions artifacts are available under the corresponding **Cross-platform unsigned installer builds** workflow, if the jobs succeeded. Neither unsigned installer is a trusted commercial release until code signing, notarization where applicable, QA, and dependency packaging are complete.

**Presentation privacy is not concealment:** GO1 stops local capture and redacts its transcript when activated. The app remains visible in an entire-screen share; there is no universal or guaranteed undetectable mode.

## GO1 v0.6.0 — measured latency and local mock-interview review

- **Fast captions:** Choose Fast (260 ms silence holdback) or Balanced (550 ms). Faster chunk dispatch trades away sentence continuity; no device-specific speed guarantee.
- **Latency Lab:** Displays measured post-VAD queue + Whisper inference p50/p95 and the last 20 completed real utterance samples. The chart is empty until live speech has actually been recognized. This is NOT a <500 ms AI-answer benchmark.
- **Practice Review:** At the end of a consented recording or imported practice audio file, the app reports local word count, overall pace and a conservative list of possible filler expressions. These heuristic observations are not AI grading and do not establish answer quality.
- **Real benchmarking:** `node scripts/benchmark-whisper.js /path/to/consented-speech.wav 8`, for repeatable, local, real-model inference numbers. Details and limitations: [docs/LATENCY_RESEARCH_AND_TESTING.md](docs/LATENCY_RESEARCH_AND_TESTING.md).
- For an intended end-to-end sub-500 ms first-caption target, a *genuine streaming ASR provider* requires future integration and physical Mac measurements. The current persistent Whisper worker is utterance-based.


## Emergency presentation privacy shortcut (v0.9)

On macOS press **Command + Shift + 9**; on Windows use **Ctrl + Shift + 9**.
This shortcut stops active capture and inference and requests an immediate privacy curtain; it does **not** toggle recording back on. If another application reserves the system-wide shortcut, GO1 reports the failure and the **Stop capture & mask transcript** button remains available. The shortcut is implemented with Electron `globalShortcut` (the app must be running).

**Before presenting:** activate privacy, wait until GO1 confirms capture has stopped, then select the *specific window or tab* in the meeting app. GO1 does not detect when external applications start screen sharing and does not hide a live assistant from participants or proctoring software.

The main process now independently rejects new microphone, system-audio, and transcription requests while privacy is active. Requests that started before activation cannot restart capture after a later return to the workspace. Transcript results arriving late are ignored by the UI. Read `docs/SHARE_SAFE_ACCEPTANCE.md` for controlled two-device tests.

## Detachable review panel (v0.10.0)

After recording or importing a consented practice clip, use **Practice review** beside Copy/Export to open a separate read-only window containing your completed transcript and timeline. It is a visible standard window, has no microphone or inference controls, and immediately closes on Presentation Privacy activation. It is not designed to remain hidden during meetings. See `docs/GO_CLIENT_ARCHITECTURE_STUDY.md` for the independent architecture comparison.

## GO1 Live Assist (v0.12.0): permitted meetings only

GO1 now supports a visible, **user-triggered** guidance panel during a live recording, for interviews or technical discussions where recording and AI assistance are explicitly authorized. This is not an invisible meeting overlay and does not evade monitoring or proctoring. The core of the feature is in `src/practice/live-assist.js` and `src/main.js`.

1. Install/select a local Whisper model and run Ollama with the selected model (for example `ollama pull qwen3:4b`).
2. In Interview Studio, enter the target role, role description, job description, spoken language, and discussion focus.
3. Confirm the **I have permission** checkbox, then select **Launch consented live session**. This uses a visible microphone capture and local live captions. System audio is never intercepted automatically.
4. GO1 identifies *possible* questions from finalized live-caption text. Review/edit the question, then choose **Suggest talking points**. The Ollama response streams into the visible panel. This is not automatic answering.
5. Press **Cancel** to end an AI response or press the emergency Presentation Privacy shortcut to stop recording, AI generation and transcript display. Recording does not restart automatically.

The question detector is a heuristic, not a guarantee. It currently recognizes question marks and common English/Hindi/Marathi question cues. The Whisper speech model has much broader language support; you can type or edit a question in any language Ollama supports. Response quality and latency depend on hardware and the chosen Ollama model. **No sub-500 ms performance guarantee is made.**

The original Practice Review after completion remains available for self-study. No audio or transcript is uploaded to GreatOffer AI or to a hosted AI provider; the Ollama and Whisper services run locally. Avoid using this feature where AI assistance or recording is prohibited.
