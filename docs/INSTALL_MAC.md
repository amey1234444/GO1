# Install GO1 on an Apple Silicon Mac

## Get the installer, not the source or test evidence

Open the [Mac DMG workflow](https://github.com/amey1234444/GO1/actions/workflows/macos-build.yml), select the latest successful v0.20 run, and download **GO1-macOS-arm64-v0.20.0-live-presentation-unsigned-DMG** from its Artifacts section while signed in to GitHub. The [v0.20 validation report](GO_CLIENT_STEALTH_AUDIT_V020.md#validation-and-download) records the verified run and exact download.

GitHub Actions downloads artifacts as ZIP archives. **The ZIP is the delivery wrapper; the file inside is GO1-0.20.0-arm64.dmg.** Do not rename `.zip` to `.dmg`.

| Download | What it contains | Installable? |
|---|---|---|
| Artifact ending in `unsigned-DMG` | The built `.dmg` disk image | Yes, after extracting the ZIP |
| `packaged-app-evidence` or `capture-evidence` | JSON, screenshots and execution logs | No |
| Repository **Code → Download ZIP** | Source files | No; this requires building |

## Install and open

1. Quit any running older GO1 copy.
2. Double-click the downloaded ZIP in Finder to extract it. Open the extracted folder if Finder creates one.
3. Double-click **GO1-0.20.0-arm64.dmg**. Copy **GO1.app** from the mounted disk to your **Applications** folder, replacing the older app if desired.
4. Eject the mounted disk and launch **Applications → GO1**. Run the installed copy, not the app on the mounted disk.
5. This preview is unsigned and not Apple-notarized. If macOS blocks it as an unidentified/unverified developer, first attempt to open it, then use **System Settings → Privacy & Security → Open Anyway** for this specific GO1 app only if you trust the source. Follow [Apple's instructions](https://support.apple.com/en-us/102445); do not disable Gatekeeper globally. A damaged/malware warning is a different issue: verify the download rather than bypassing it.

This build targets **Apple Silicon (ARM64)**, not Intel Macs. Check **Apple menu → About This Mac** for the chip type. The DMG workflow mounts the built image, verifies the app and its four bundled ARM64 speech tools, and launches the actual packaged app before publishing the installer.

## First session

1. Under **Speech recognition model**, choose a multilingual model and click **Install / select**. Base is a smaller initial download; Small is the app default. FFmpeg, FFprobe, Whisper CLI and Whisper server are bundled; model weights download separately.
2. For optional AI, install [Ollama for Mac](https://ollama.com/download/mac), keep it running, and install a model, for example `ollama pull qwen3:4b`. Enter the installed model name in GO1, save context and use **Check local AI**. Transcription works without Ollama.
3. Select your audio source and grant the microphone/system-audio permissions requested for that source. Choose **Launch live companion** and enable AI guidance if wanted.
4. Keep **Live capture protection (stealth)** enabled. **Hide Dock icon with live companion** is a separate Mac presentation preference. Both leave transcription and enabled AI running.
5. The companion's workspace arrow restores the Dock and workspace. Closing the companion or stopping the session restores the Dock too. **Stop & mask** deliberately stops processing and clears private text; it is not the live-protection toggle.

## Verify your meeting setup

The [native test evidence](GO_CLIENT_STEALTH_AUDIT_V020.md) records specific ScreenCaptureKit results, not a guarantee for Zoom, Google Meet or Teams. On a second receiving device, check your exact meeting app and share mode while fresh transcript and AI text arrive locally. Test moving/reopening the panel, switching Spaces/fullscreen, and restarting sharing. Sharing a selected other window/tab limits the shared surface. If GO1 appears on the receiving device, whole-screen exclusion has failed for that configuration.

## Why the framework comparison previously failed

Electron 43 installs its runtime lazily when its Node entry point is resolved. The earlier workflow inspected `node_modules/electron/dist` immediately after `npm install`, before the executable had been downloaded. The corrected workflow resolves `require('electron')` first, then discovers the framework binary under the installed distribution instead of assuming a `Versions/A` layout. No capture or inference checks are skipped to make the installer pass.

References: [Electron 43.3.0 runtime resolver](https://github.com/electron/electron/blob/v43.3.0/npm/index.js), [GitHub artifact downloads](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/download-workflow-artifacts), [Apple first-launch guidance](https://support.apple.com/en-us/102445).
