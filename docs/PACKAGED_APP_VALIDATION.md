# v0.19 packaged Mac app validation

The requested comparison has two separate questions: whether the application functions, and whether a particular meeting capture path excludes it. Passing one does not prove the other. GO1 implements local speech recognition and optional local AI; it is not a complete replica of GO Client's cloud services, account system or all features.

## Changes

- Reserve live startup before waiting for the model, preventing overlapping starts and concurrent batch transcription/model changes.
- Invalidate pending startup on Stop & mask or workspace close. A failed startup releases the reservation and resets its worker so retry is possible.
- Bind transcript/status callbacks to the session that created them. Discard inference results after cancellation, even if a provider completes late.
- Validate stop/cancel session IDs before touching the companion, AI permission or audio diagnostics.
- Close the native speech worker and cancel speech, live AI and practice feedback when the workspace closes or the app quits.
- Keep all these lifecycle controls independent of capture protection. Switching protection still leaves an active session running.

## Build gate

`.github/workflows/macos-build.yml` builds the ARM64 transcription tools, packages the DMG, mounts it, then runs `scripts/macos/smoke-packaged.js`. The DMG upload only runs after every required check succeeds. JSON and process logs are uploaded even if the new validation fails.

The script launches the executable inside the mounted DMG. On the disposable CI runner only, Electron's documented remote debugging switch lets the test invoke the existing restricted preload APIs. There is no added production test IPC or microphone-permission bypass. The debug port is not enabled during normal app launch.

| Check | What is actually exercised |
|---|---|
| First launch | Packaged Electron, real preload and main-process IPC, four bundled executable paths |
| Model setup | Actual in-app download and selection of multilingual Whisper Base |
| Live transcription | macOS `say` speech converted by bundled FFmpeg, PCM IPC, actual VAD, persistent bundled Whisper server and transcript aggregation |
| Live AI | Actual local Ollama model, production streaming parser, companion Ask API and rendered answer |
| Protected activity | Protection API readback on workspace/companion, live session retained through off/on toggles |
| Companion | Compact layout, surface alpha, close/reopen with retained transcript and guidance |
| File import | Actual bundled FFprobe, FFmpeg and Whisper CLI |
| Review and privacy | Protected completed review; Stop & mask closes it and rejects new sessions until resume |
| Shutdown | Closing the workspace terminates the real persistent speech worker |

The CI AI model is `qwen2.5:0.5b` to keep the test modest in memory and time. User defaults remain `qwen3:4b`; a passing smoke test is not an accuracy or speed benchmark for every model. Generated speech is injected at the existing PCM IPC boundary. Hardware microphone/system playback capture, TCC prompts, AudioWorklet/device integration and receiving-device meeting output are **not** covered by this test. The separate unit suite covers AudioWorklet resampling/transport and lifecycle failure cases with controlled fixtures.

## Screen-sharing evidence

[GO Client static study and actual translucent UI screenshots](FLOATING_COMPANION.md) document the observed DMG mechanisms: transparent panel, screen-saver window level, all Spaces/fullscreen support, inactive show and `setContentProtection`. Window appearance, taskbar/Dock visibility and capture exclusion are separate mechanisms.

[Native ScreenCaptureKit experiments](MACOS_CAPTURE_VALIDATION.md) and [live companion evidence](LIVE_PROTECTION_AND_MEET.md) preserve actual screenshots and stream samples, with unprotected controls and capture-filter refreshes. They do not show a remote Google Meet participant. The protected-window APIs are best effort; changes in OS, meeting client or capture method can expose the app. A working Mac experiment does not establish Windows behavior.

## Install on your MacBook

1. Download the latest successful **GO1-macOS-arm64-v0.19.0-validated-runtime-unsigned-DMG** artifact from the [Mac build workflow](https://github.com/amey1234444/GO1/actions/workflows/macos-build.yml), unzip it, open the DMG and copy GO1 to Applications. This build is for Apple Silicon Macs (M1/M2/M3/M4 family and compatible ARM64 Macs), not Intel Macs.
2. The preview is unsigned/not notarized. macOS may block first launch; use the system's explicit Open Anyway flow for this downloaded app after reviewing its source. Do not disable Gatekeeper globally.
3. In GO1, install/select a multilingual Whisper model. Base uses less memory; Small is the default. The four executable tools are already bundled; the speech model requires an initial download.
4. For optional AI, install [Ollama](https://ollama.com/download/mac), keep it running, and run `ollama pull qwen3:4b`. Select that installed model and save context in GO1. Ollama and AI weights are separate from the DMG. Transcription does not require AI setup.
5. Grant the microphone or system-audio permission for the source you choose, enable AI if wanted, and launch the live session. Capture protection is enabled by default. The floating panel supports transcription, direct questions, compact view and surface transparency.
6. Before relying on capture exclusion, present to a second device in the exact meeting application/share mode you intend to use. Check startup, reopening, moving the panel, Space/fullscreen changes, and stopping/restarting screen share while new transcript and AI text arrive. Use the receiver checklist in [LIVE_PROTECTION_AND_MEET.md](LIVE_PROTECTION_AND_MEET.md).

## Recorded execution

Pending the new v0.19 workflow execution. This section is updated only after actual results are retrieved; configuring the workflow alone is not a successful native validation.

## Primary references

- [Electron supported command-line switches](https://www.electronjs.org/docs/latest/api/command-line-switches)
- [Ollama Qwen2.5 model catalog](https://ollama.com/library/qwen2.5)
- [Homebrew Ollama formula](https://formulae.brew.sh/formula/ollama)
