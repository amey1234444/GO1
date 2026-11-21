# GO1 — Offline multilingual audio transcription

A privacy-first **macOS desktop application** for recording your own microphone or importing an audio recording, identifying its spoken language, and generating searchable, timestamped transcripts. Built with Electron, Node.js and [whisper.cpp](https://github.com/ggml-org/whisper.cpp). No cloud API key or subscription is required for transcription.

> **Milestones 1–2 (implemented):** record → stop → transcribe, file upload → transcribe, auto language detection, manual language override, optional speech translation into English, timestamped segment display, TXT/SRT/VTT/JSON exports, cancellation, and input limits. The app also offers **experimental rolling live captions** during microphone recording, using 6-second overlapping windows. It is near-real-time chunked inference, **not token-by-token speech streaming**; latency depends on model size and hardware. It doesn't capture other applications' audio, monitor meetings, or attempt to evade screen sharing.

## 1. Install on Apple Silicon macOS

Prerequisites: macOS 14+, [Node.js 22 or newer](https://nodejs.org/), and [Homebrew](https://brew.sh/). The first model download requires Internet access; subsequent inference is on-device.

```bash
# Clone or unzip GO1, then enter the folder:
cd GO1

# Install ffmpeg + whisper.cpp and download the multilingual "small" model:
bash scripts/setup-macos.sh small

# Install desktop dependencies and start:
npm install
npm start
```

The setup script installs Homebrew's `whisper.cpp` (providing `whisper-cli`), `ffmpeg` and `ffprobe`, and downloads `ggml-small.bin` into `~/Library/Application Support/GO1/models/`.

**If you want greater accuracy** and have enough RAM/storage, choose `medium` or `large-v3-turbo` in the setup script. The default app looks for the small model unless you set `GO1_WHISPER_MODEL` to the alternative path.

```bash
bash scripts/setup-macos.sh medium
GO1_WHISPER_MODEL="$HOME/Library/Application Support/GO1/models/ggml-medium.bin" npm start
```

Or explicitly set the program paths if you installed them somewhere different:

```bash
GO1_WHISPER_PATH=/path/to/whisper-cli \
GO1_FFMPEG_PATH=/path/to/ffmpeg \
GO1_FFPROBE_PATH=/path/to/ffprobe \
GO1_WHISPER_MODEL=/path/to/ggml-medium.bin npm start
```

### Grant microphone permission

On first recording macOS prompts for microphone permission. If you denied it, open **System Settings → Privacy & Security → Microphone** and allow GO1 (or Electron during development), then restart the app. Recording starts **only** when you press Start recording and stops when you press Stop & transcribe.

### Usage

Choose **Live captions** before recording to show updates while speaking. Disable it for the original record-then-transcribe workflow. Live transcription uses a local 16 kHz PCM AudioWorklet, overlapping whisper.cpp inference windows, tentative captions at boundaries, and reconciliation before exports. Both modes require explicit microphone permission.

1. Choose **Record microphone** or **Upload file**.
2. Select **Auto detect** (recommended) or a language from the dropdown.
3. Optionally enable **Translate to English**. Otherwise GO1 transcribes into the *spoken language*.
4. Press **Stop & transcribe** or **Transcribe selected file**. Wait for the local model.
5. Copy text or export TXT, JSON, SRT or VTT, including segment timestamps.

## 2. Languages and models

Whisper multilingual models are trained for approximately **99 languages**. Supported examples include English, Hindi, Marathi, Gujarati, Bengali, Tamil, Telugu, Kannada, Malayalam, Punjabi, Urdu, Nepali, Chinese, Japanese, Korean, Arabic, French, German, Spanish, Russian, Portuguese, and many more. This does **not** mean every language worldwide is supported. Very low-resource languages, code-switching, overlapping speakers, loud background noise and short clips can be less accurate.

**Important:** Use `ggml-small.bin` or another *multilingual* model, **not** `ggml-small.en.bin` (English only). The UI's language picker includes common options; "Auto detect" supports all languages recognized by the underlying multilingual model.

Whisper's default detection is based on an early audio segment, so a long recording that changes language midstream may not be accurately labeled. For higher-quality multilingual transcription, compare `small`, `medium` and `large-v3` using audio samples in your target languages. The `large-v3-turbo` model is efficient for transcription but is not the recommended model for multilingual *speech translation*.

### Library comparison (why whisper.cpp)

| Engine | Advantages | Trade-offs |
| --- | --- | --- |
| `whisper.cpp` **chosen** | Local, free API usage, Apple Silicon Metal acceleration, multilingual models, JSON output | Needs native binary + downloaded model; batch inference in this milestone |
| `faster-whisper` | Python integration, CTranslate2, built-in VAD, segment timestamps | Requires a Python runtime/backend; macOS Apple GPU acceleration differs |
| Hosted speech API | Simple setup, scalable server-side inference | Usage costs, privacy considerations, account/credential management |

Sources: [whisper.cpp CLI](https://github.com/ggml-org/whisper.cpp/tree/master/examples/cli), [Whisper models](https://github.com/openai/whisper), [faster-whisper](https://github.com/SYSTRAN/faster-whisper), [Electron security](https://www.electronjs.org/docs/latest/tutorial/security).

## 3. Technical pipeline

```text
User consent → Electron MediaRecorder (or file picker)
    → IPC transport (preload bridge, typed byte array)
    → main process validates size/language; creates private temporary directory
    → ffprobe enforces maximum duration (30 min when metadata is available)
    → ffmpeg resamples audio to 16 kHz / 1 channel / 16-bit PCM WAV
    → whisper-cli with multilingual model, -l auto, JSON output
    → JSON parser: language, segments, timestamps, full Unicode text
    → Renderer: transcript and optional subtitle exports
    → finally: temporary audio and model-output files deleted
```

**No upload service exists in this project.** Local model file download from Hugging Face occurs in `scripts/setup-macos.sh`. The app does not transmit audio to an AI provider. Users should still obtain consent from everyone recorded and comply with privacy and interview policies.

### Project structure

```text
src/main.js                    Electron application, sandboxed window, IPC handlers
src/preload.js                 Narrow and explicit renderer-to-main bridge
src/transcription/engine.js   Binary discovery, size limits, conversion, inference, cancellation
src/transcription/live.js     Rolling-window live session, overlap reconciliation
src/renderer/pcm-worklet.js  16 kHz PCM resampler and half-second chunks
src/transcription/formats.js  Whisper JSON parser and subtitle/text formats
src/renderer/index.html       Desktop interface
src/renderer/styles.css       Interface styling
src/renderer/app.js           Recording, file uploads, progress, transcript display
scripts/setup-macos.sh        Homebrew and model bootstrap
forge.config.js               Packaging configuration
.github/workflows/checks.yml  JS syntax validation and unit/integration tests
```

## 4. Run tests and build a DMG

```bash
npm run check
npm test
npm run make
```

`npm run make` requires macOS to make a macOS DMG; packaging is not the same as signing/notarization. For commercial distribution, set up Apple code signing, notarization, update signing and automated compatibility testing. Homebrew executables and models are currently **external dependencies** and are **not embedded** in the packaged `.app`. A customer must install them separately, or a future production installer must bundle appropriately licensed artifacts.

## 5. Production TODO / limitations

- **Live mode is experimental:** it decodes rolling 6-second windows in serial. Each window invokes `whisper-cli` and reloads the model; substantial latency/backlog is possible on slower Macs. A persistent model worker and VAD-based segment scheduling are future optimizations.
- **No separate system audio capture:** only user-granted microphone audio or explicitly selected local files.
- **No language-perfect guarantee:** evaluate word error rate with multiple speakers, accents, scripts, and code switching.
- Model downloads are HTTPS but are not currently verified against a pinned checksum. Add checksums/signatures and software bill of materials for production.
- Concurrency is one transcription job at a time. The app cancels its active job, removes temporary recordings and shows a useful error if CLI tools are missing.
- Electron/Whisper must be installed before audio behavior can be tested on actual macOS hardware; CI mocks the native CLI pipeline, it does not validate speech accuracy.
- Improve packaging and onboarding (model downloading UI, progress and disk space checks) before commercial distribution.
- Upgrade to persistent whisper.cpp inference and silence/VAD-aware chunking for much lower latency.
- Add user-controlled system audio capture where macOS permits it and explicit recording consent exists.
- Test the new AudioWorklet PCM flow on real macOS devices and benchmark recognition/latency.

## 6. Testing with real languages

For an initial evaluation, record at least 20–30 short clips per target language at varying noise levels and accents. Create manually verified reference transcripts. Measure word error rate (WER) for space-separated languages and character error rate (CER) for languages where word boundaries differ. Include Marathi/Hindi/English code-switching, silence, background audio, and interruptions. Avoid asserting "100% accurate" recognition.

## License

The independently developed GO1 example code is MIT licensed (see `LICENSE`). Check upstream `whisper.cpp`, Whisper model, Electron and FFmpeg license notices for any bundled commercial release. This repository does not contain commercial third-party source code, model weights, or keys.
