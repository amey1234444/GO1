# Install GO1 on an Apple Silicon Mac

## Download the DMG directly

Sign in to [GO1 Release Desk](https://go1-release-desk.velvetywoodpecker16.chatgpt.site/) and choose an available version in **Downloads**. New versions appear only after packaged validation passes. The portal shows size, SHA-256, bundled-model status and build history. Historical v0.24 and earlier downloads remain available; those versions require a separate speech-model download.

From v0.26 onward, new DMGs contain the speech runtime and multilingual model. They are not automatically Apple-notarized: check the release label. Developer ID signing credentials are required for normal Gatekeeper trust. See [Apple signing setup](MAC_INSTALLER_V022.md#apple-signed-distribution-setup).

Download the `.dmg` itself. Never rename a ZIP archive to DMG.

## Install and open

1. Quit any older running GO1 copy.
2. Open the downloaded DMG and drag **GO1.app** into **Applications**. Replace an older copy only if desired.
3. Eject the mounted image and open **Applications → GO1**. Avoid an old Downloads copy or Dock shortcut pointing at a stale app.
4. Grant microphone/system-audio permissions only for the audio source you choose.

This installer targets **Apple Silicon (ARM64)**. It is not an Intel build. Check **Apple menu → About This Mac** for the chip type. From v0.26 onward, the Mac DMG includes multilingual Base Compact speech weights; optional local AI still requires Ollama. Earlier releases require a separate speech-model download.

## If macOS reports “damaged”

Do not keep using the old app or disable Gatekeeper. Download a fresh copy from the portal. Compare `shasum -a 256` output with the checksum shown for that exact version. For example, substituting your downloaded filename:

```sh
shasum -a 256 GO1-0.26.0-arm64.dmg
hdiutil verify GO1-0.26.0-arm64.dmg
codesign --verify --deep --strict --verbose=2 /Applications/GO1.app
spctl --assess --type execute --verbose=4 /Applications/GO1.app
```

- Failed checksum or disk-image verification: the local download does not match the published image; redownload it.
- Failed code-signature verification: do not bypass the error. Preserve the exact output and report the release/version.
- Valid signature but rejected Gatekeeper on an **ad-hoc preview**: this is not an Apple-notarized distribution. The project needs the [Developer ID setup](MAC_INSTALLER_V022.md#apple-signed-distribution-setup) for normal first-launch trust.
- An unidentified-developer or “Apple could not verify” prompt differs from a damaged/malware warning. Apple's [Open Anyway instructions](https://support.apple.com/en-us/102445) apply only when appropriate and when you trust the specific app. They do not repair a corrupted signature. Do not globally disable security checks.

The reported screenshot was confirmed to come from opening an earlier download. If the latest copy still fails, obtain its version with `/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' /Applications/GO1.app/Contents/Info.plist` and preserve the exact verification output above. Do not assume every alert has the same cause.

## First session

1. In v0.26+, Base Compact is bundled and selected automatically on a fresh install. Begin recording immediately after granting microphone permission. In **Settings → Speech engine**, larger models can be downloaded optionally. FFmpeg, FFprobe, Whisper CLI and Whisper server are included.
2. For optional AI, install [Ollama for Mac](https://ollama.com/download/mac), keep it running, and install a model, for example `ollama pull qwen3:4b`. Enter the installed model name in GO1, save context and use **Check local AI**. Transcription works without Ollama.
3. Select your audio source and grant the microphone/system-audio permissions requested for that source. Choose **Launch live companion** and enable AI guidance if wanted.
4. Keep **Live capture protection (stealth)** enabled. **Hide Dock icon with live companion** is a separate Mac presentation preference. Both leave transcription and enabled AI running.
5. The main workspace minimizes after the audio pipeline is ready. Silence keeps the live session open. If the companion reports **Input lost**, use its workspace arrow and **Reconnect audio**; your current session and recognized text are retained. Try **Quiet voices** for soft speech or **Balanced** responsiveness with a slow model.
6. The companion's workspace arrow restores the Dock and workspace. Closing the companion or stopping the session restores the Dock too. **Stop & mask** deliberately stops processing and clears private text; it is not the live-protection toggle.

## Verify your meeting setup

The [native test evidence](GO_CLIENT_STEALTH_AUDIT_V020.md) records specific ScreenCaptureKit results, not a guarantee for Zoom, Google Meet or Teams. On a second receiving device, check your exact meeting app and share mode while fresh transcript and AI text arrive locally. Test moving/reopening the panel, switching Spaces/fullscreen, and restarting sharing. Sharing a selected other window/tab limits the shared surface. If GO1 appears on the receiving device, whole-screen exclusion has failed for that configuration.

## Why the framework comparison previously failed

Electron 43 installs its runtime lazily when its Node entry point is resolved. The earlier workflow inspected `node_modules/electron/dist` immediately after `npm install`, before the executable had been downloaded. The corrected workflow resolves `require('electron')` first, then discovers the framework binary under the installed distribution instead of assuming a `Versions/A` layout. No capture or inference checks are skipped to make the installer pass.

References: [Electron 43.3.0 runtime resolver](https://github.com/electron/electron/blob/v43.3.0/npm/index.js), [GitHub artifact downloads](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/download-workflow-artifacts), [Apple first-launch guidance](https://support.apple.com/en-us/102445).
