# GO1 v0.15: capture protection, implementation and evidence

Study date: 22 November 2026. Baseline: `472d45e78587bce24458c61cf1ec6c08190171f0` (GO1 v0.14.0).

## Result and its limits

GO1 now requests OS screen-capture exclusion for its workspace, live companion and completed-practice review. The request defaults to on, is requested before content loads/first display, is reapplied on show/restore, can be changed in the presentation controls, and is saved across restarts. This is an independent implementation of the Electron capture-protection mechanism found in GO Client 2.0.11.

**It is not a guarantee that GO1 stays visible locally but invisible in every Zoom, Google Meet or Microsoft Teams share.** Electron documents that macOS ScreenCaptureKit can capture protected windows. Apple calls `NSWindow.SharingType.none` a legacy constant that macOS no longer uses. Setting and reading an OS flag cannot establish what a remote participant receives.

No receiver-side meeting test has been performed in this environment. This report is a technical evidence record, not third-party certification or a cryptographically signed attestation. The original app was statically inspected, not executed or authenticated. Its server implementation and full native machine-code behavior are outside this study.

## Evidence identity and reproduction

| Input | SHA-256 |
| --- | --- |
| User-supplied GO_Client-2.0.11-arm64(2).dmg | `059ff75f28b7604966a800493c3c05c52aeebdf28ee1ccafed28a39e5c7a3b54` |
| Extracted Resources/app.asar | `d7f833bba2e53ceebd284ddc4660ad9f1645542b611e235471ce1227759b4b4b` |
| ASAR out/main/index.js | `4520046dcc683d45f41df7689017605412c1c7ca4ed6d4be4b3337d38c52d66d` |

The DMG is 143,490,518 bytes; the application reports 2.0.11. The bundled Electron Framework Info.plist reports 43.3.0. GO1 declares Electron `^39.0.0`; these are different runtimes, so matching the API does not establish identical runtime behavior.

Extraction used 7-Zip 25.01 on Linux. The ASAR contains 9,496 packed file entries. The analysis indexed the main bundle, preloads, package metadata, and both unpacked native modules. See [machine-readable evidence](evidence/go-client-2.0.11-static.json) for hashes, line numbers, byte offsets and native symbol-string matches. Proprietary bundles, native binaries, audio, credentials and account data are not included in GO1.

Reproduce with a legally obtained local copy, keeping extracted files outside the repository:

```sh
7zz x '/path/GO_Client-2.0.11-arm64.dmg' -o/tmp/go-client-study
python3 scripts/inspect-go-client.py \
  --dmg '/path/GO_Client-2.0.11-arm64.dmg' \
  --asar '/tmp/go-client-study/GO Client 2.0.11-arm64/GO Client.app/Contents/Resources/app.asar' \
  --output /tmp/go-client-evidence.json
```

The script only reads bytes. It never loads the app or its native modules. On macOS, mounting the image with `hdiutil attach -readonly` provides another route to the same ASAR. Line numbers below refer to the original extracted bundle, not a reformatted/decompiled copy.

## What GreatOffer actually does

| Observed mechanism | Original main-bundle location | Interpretation |
| --- | --- | --- |
| Assistant content-protection default is true | line 17836 | A local window preference, not meeting detection |
| Assistant calls `setContentProtection` | line 18718; setter at 18808–18813 | Electron is the verified capture-exclusion boundary |
| Assistant uses an always-on-top screen-saver level and all workspaces | lines 18712–18716 | Places the panel above other content locally; does not itself exclude capture |
| Screenshot selection overlay is content-protected | line 19469 | Protection is also applied to a temporary overlay |
| Dashboard receives its own capture preference | lines 26062, 27531–27535 | Protection is window-specific, not a global process property |
| Dashboard capture preference defaults to false | line 27498 | Even this app does not protect every surface by default |
| Support window follows capture preference | line 26973 | Additional windows require explicit handling |
| Accessory activation policy plus Dock hide | lines 27503–27506 | Controls Dock/app-switcher presentation, separate from screen capture |
| Windows taskbar hiding and repeated enforcement | lines 17845 onward | Controls shell visibility; native helper is loaded on Windows for that path |
| Mouse passthrough toggles | lines 19083–19096 | Changes input handling; does not remove pixels from a capture |
| Preferences are queued and stored | lines 27537 onward | Changes have a persistence/lifecycle component |

The native `@greatofferai/window-control` bridge exports `beginPointerDrag`, `hideFromTaskbar`, `listCaptureWindows`, `pointerDragActive` and `primaryButtonDown`. The ARM64 binary contains Core Graphics window-enumeration strings including `CGWindowListCopyWindowInfo`, window owner PID, bounds and layer. This supports a window-enumeration role. A symbol-string scan did not find the selected sharing-type/private capture-exclusion tokens listed in the evidence JSON. **A negative string search cannot prove that no other mechanism exists**, particularly in optimized native code. No stronger macOS capture-exclusion mechanism was established by the inspected call paths.

The audio module is separate. `NativeAudioCapture` in the main bundle obtains native microphone/system PCM, normalizes sample arrays and forwards channel, sample rate, timestamps and optional voice probabilities. Its native binary references ScreenCaptureKit. That reference is evidence about its capture input pipeline; it does not establish that it can control another application's screen-sharing output.

The package contains React 19.1.0 renderer dependencies, Electron preloads, a separately bootstrapped agent and authenticated business/API integration. GO1's local Whisper/Ollama pipeline is architecturally different. Matching the desktop capture flag does not reproduce GreatOffer's transcription, models, server orchestration or end-to-end latency.

## GO1 repository architecture and relevant boundaries

| Area | Files | Behavior and implications |
| --- | --- | --- |
| Process/window ownership | `src/main.js` | Creates three window roles, authorizes IPC by owning WebContents, controls permissions and session lifetimes. The right location for a shared protection policy. |
| Renderer bridge | `src/preload.js`, renderer-specific preloads | Explicit IPC methods under context isolation and sandboxing. Protection mutations are only exposed to the workspace. |
| Workspace UI | `src/renderer/app.js`, `index.html`, `styles.css` | Recording/import, local settings, presentation controls, status and exports. New controls report requested/readback state and platform limitations. |
| Live panel | `src/companion/state.js`, `src/renderer/companion.*` | Bounded transcript/question/guidance state and adjustable opacity. Opacity is cosmetic, not capture security. |
| File transcription | `src/transcription/engine.js`, `formats.js` | Local ffmpeg/ffprobe conversion, Whisper CLI, size/duration bounds, temporary-file cleanup, export normalization. |
| Live transcription | `pcm-worklet.js`, `vad.js`, `vad-live.js`, `live.js`, `worker.js` | PCM16 transport, segmentation, bounded pending utterances, persistent localhost Whisper server. No meeting-app output filtering. |
| Audio diagnostics | `src/audio/diagnostics.js`, `transcription/latency.js` | Input levels, clipping, arrival gaps and latency; these metrics cannot prove screenshot exclusion. |
| Local guidance/practice | `src/practice/*` | Profile validation, manual question guidance, localhost Ollama streaming, completed-result review. |
| Existing presentation privacy | `src/privacy/gate.js`, `presentation.js`, `shortcut.js` | Main-process stop gate with epochs, cancellation and renderer redaction. Remains separate from the new OS flag. |
| Models and packaging | `models.js`, `forge.config.js`, `scripts/*`, workflows | Model installation, native-tool bundling, unsigned installer builds; macOS signing remains opt-in. |

The baseline had 74 passing tests and no call to `setContentProtection`. The companion regression test explicitly prohibited that call. That historical expectation was updated to require the shared controller while preserving restricted preload checks.

## Implementation

`src/privacy/content-protection.js` owns one policy and tracks each live BrowserWindow:

1. On registration, request protection immediately and read back the Electron flag.
2. On show/restore, reapply the current policy. This is lifecycle defense, not a guarantee against compositor timing gaps.
3. On close, remove the window from the registry.
4. On a user toggle, update every existing window; future windows inherit the preference.
5. On errors, retain per-window diagnostics and avoid marking the whole set successful.
6. On Linux, report unsupported without invoking the macOS/Windows-only API.

The main workspace now starts with `show: false`, like the other windows, so the first protection request precedes loading/display. Preference writes are serialized and use temporary-file rename; changing the model and protection preference cannot race on the same temporary settings file. A failed save is shown in the UI; a runtime change may still be applied even if persistence fails.

The status explicitly separates `enabled`, per-window `applied`, `allApplied`, platform support and errors. `receiverVerified` and `guaranteedCaptureExclusion` remain false. A true readback means the window flag was set, not that a receiver test passed. No app icon hiding, click-through, third-party process modification, API hooking or capture-backend patching was needed for this implementation.

Existing **Stop capture & mask transcript** and **Cmd/Ctrl+Shift+9** still stop recording, cancel processing, close secondary windows and mask the workspace. Capture protection alone does not stop recording. Native save dialogs, OS permission prompts, desktop notifications, other apps, exported files and process lists are outside the three-window policy.

## Platform behavior

| Platform/share path | Expected scope | Release claim |
| --- | --- | --- |
| Windows supported desktop capture | Electron requests `WDA_EXCLUDEFROMCAPTURE`; older Windows can show a black rectangle | Best effort; test the actual app, OS and capture mode |
| macOS legacy capture | Electron requests `NSWindowSharingNone` | Some legacy paths may honor it; no universal claim |
| macOS ScreenCaptureKit | May capture protected GO1 windows | Do not rely on this flag for confidentiality |
| Google Meet browser tab | Share-source selection determines content | Choose the intended tab; verify receiver output |
| Selected other application window | Capture source can avoid GO1 | Check receiver output, dialogs, overlap and OS behavior |
| Full display | All locally visible content is potentially exposed | Use stop/mask if exclusion is unverified |
| Linux | No supported Electron exclusion implementation here | UI reports unsupported |

The feature does not identify Zoom/Meet/Teams or detect that a presentation started. Enable/verify it before sharing; changing it during a share cannot retract frames already transmitted.

## Validation and proof boundaries

- [Automated output](evidence/automated-tests.txt): baseline plus controller and main-process integration regressions. The integration tests execute the real main module using an Electron boundary double; they verify registration before load/show, all three roles, IPC authorization, persistence ordering and compatibility with the stop gate.
- [Validation manifest](evidence/validation.json): exact test counts, baseline SHA, environment, command results, modified-source hashes and explicitly unrun checks.
- `npm run check`: JavaScript syntax checks, including the new controller and native smoke script.
- `npm run smoke:protection`: real Electron BrowserWindow flag/readback checks for macOS and Windows. Added to both existing installer workflows. Passing this check still does not validate meeting receiver pixels.
- Linux native Electron GUI attempts failed in the execution environment (headless runtime/IPC/graphics failure). No GUI screenshot or operating-system capture success is fabricated from those attempts.
- Automated test output is evidence about code behavior under tests. The native smoke result, when available in Actions, is evidence about API state. Neither is a Zoom/Meet/Teams certificate.

## CI follow-up

The first Windows CI run on implementation commit `bd3a1f4d1856dbc0b8b4f3f4aa3b9b44b7721737` exposed an existing portability bug in the transcription integration fixture: Windows cannot directly spawn Unix shebang scripts. The test now invokes its synthetic executables through Node using an injected command runner; production execution still defaults to the existing shell-free `execute` function. The test continues to use real subprocesses and does not skip Windows. On that same commit, the macOS native capture API smoke step passed. These are API/test results, not receiver capture results.

The next Windows run passed all 86 automated tests but exposed a smoke-fixture lifecycle mistake: the fixture never displayed its windows. In [Chromium 142's Windows implementation](https://github.com/chromium/chromium/blob/142.0.7444.265/ui/views/widget/desktop_aura/desktop_window_tree_host_win.cc), setting protection while hidden stores the request and defers native display affinity until Show; readback queries the native flag. The smoke fixture now shows its synthetic windows, exercising the same show lifecycle as GO1. A regression checks that hidden/deferred state is not falsely certified and that first show refreshes the result. This also reinforces why “requested before show” cannot guarantee exclusion of every composed frame. The updated suite contains 87 tests.

## Receiver acceptance procedure

Use synthetic test text and two consenting devices/accounts. Record OS version, Electron version, GO1 commit/build, meeting/browser version, share source, hardware/display arrangement and a timestamp.

For **each** of Zoom, Meet and Teams:

1. Put unique markers in workspace, companion and review (the review is tested in a completed session). Check all three separately.
2. Share an unrelated specific window, then a full display. For Meet, also test a tab. Save the receiving device's screenshots/video, not just the sender's preview.
3. Toggle capture protection off/on between separate shares and compare. Wait for the desktop to compose after changing a flag.
4. Repeat after closing/reopening panels, minimizing/restoring, entering fullscreen, moving displays and restarting GO1. Restart the meeting share too.
5. Test stop/mask while capture/inference is pending. Verify the receiver sees no private transcript after redaction, and recording does not restart on resume.
6. Mark exclusion PASS only for the exact configuration where none of the private markers appears. Record a black rectangle as distinct from complete window removal. If any marker appears, record FAIL and use selected-source sharing or stop/mask.

| Receiver | Other window | Full display | Browser tab | Current evidence |
| --- | --- | --- | --- | --- |
| Zoom | Not run | Not run | N/A | No receiver certification |
| Google Meet | Not run | Not run | Not run | No receiver certification |
| Microsoft Teams | Not run | Not run | As supported | No receiver certification |

## Primary platform references

- [Electron BrowserWindow content protection](https://www.electronjs.org/docs/latest/api/browser-window#winsetcontentprotectionenable-macos-windows)
- [Apple NSWindow.SharingType](https://developer.apple.com/documentation/appkit/nswindow/sharingtype-swift.enum)
- [Apple ScreenCaptureKit](https://developer.apple.com/documentation/ScreenCaptureKit)

These support the API/platform limitations. The binary findings above come from the user-provided DMG and the reproducible local evidence index.
