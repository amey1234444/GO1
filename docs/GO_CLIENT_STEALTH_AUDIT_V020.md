# GO Client comparison and GO1 v0.20 live presentation

The supplied GO Client DMG does not establish universal invisibility. Its observed Mac implementation uses standard Electron/AppKit controls. GO1 now includes the missing live-session Dock presentation behavior and uses the same Electron version for controlled comparison. Capture protection remains best effort and independent of speech/AI processing.

## Input and deeper inspection

- GO Client 2.0.11, build 2.0.11.1448, bundle com.imf.greatofferai.
- DMG SHA-256: 059ff75f28b7604966a800493c3c05c52aeebdf28ee1ccafed28a39e5c7a3b54.
- Its Info.plist has LSUIElement=true; its bundled Electron Framework reports 43.3.0.
- [Machine-readable static audit](evidence/go-client-native-audit-v020.json) includes original module hashes, Mach-O imported symbols/libraries, call-site line locations and Electron executable-section fingerprints.
- [Reproducible read-only inspector](../scripts/research/inspect-go-client.py) works on an already extracted copy. It does not execute the original client or redistribute its source/native binaries.

| Observed mechanism | DMG evidence | GO1 behavior |
|---|---|---|
| Capture request | main JS lines 18718, 18812: Electron content protection | Applied before content loads; all workspace, companion and review windows covered |
| Floating panel | lines 18613–18629: transparent, frameless, shadowless panel, background throttling off | Same core presentation configuration; transcription and enabled AI continue |
| Fullscreen/Spaces | lines 18712–18716: screen-saver level, all workspaces, skipTransformProcessType | Same configuration; restored on show/restore |
| Dock appearance | lines 27503–27516: accessory policy and Dock hide/show | New saved Mac option hides the icon while the companion is open; workspace arrow, closing the panel, stopping or Stop & mask restores it |
| Native taskbar utility | loader at 17766 returns immediately unless platform is win32 | Not treated as a missing Mac capture feature |
| Mac window-control imports | CGWindowListCopyWindowInfo, CGRectMakeWithDictionaryRepresentation and window metadata constants | These are enumeration/geometry evidence, not an imported capture-exclusion function |
| Electron runtime | framework Info.plist: 43.3.0 | Pinned to 43.3.0 for this comparison; native and real-inference tests rerun |

The Darwin window-control binary contains explicit Windows-only error messages for taskbar control and native pointer dragging. Its import table has no Objective-C message dispatch, NSWindow sharing setter, or CGS/SLS capture-blocking import. This narrows the observed role of that module; it does not prove that dynamically resolved behavior or all framework behavior is absent. The audio-capture module has CoreAudio/ScreenCaptureKit/audio pipeline dependencies; framework class-name strings alone do not establish a hidden window-exclusion mechanism.

The [Electron 43.3.0 Mac implementation](https://github.com/electron/electron/blob/v43.3.0/shell/browser/native_window_mac.mm) sets the native window's sharing type to NSWindowSharingNone and reads that value back. It is not a stronger Mac capture API than the previous GO1 version used. The workflow additionally compares official Electron's executable, C-string and Objective-C method-name sections with hashes computed from the supplied DMG, to check whether the observed runtime contains different code. A version string alone would not prove binary equivalence.

## What changed in GO1

- Live Dock mode is enabled by default on Mac and can be disabled under the presentation controls. Its setting is saved independently of capture protection.
- GO1 remains a normal Dock app at startup. It switches to accessory presentation when the live companion opens. Unlike GO Client's global LSUIElement preference, GO1 deliberately preserves normal first-run navigation.
- The companion's workspace arrow restores the Dock before focusing the workspace. Closing the companion, stopping a session and Stop & mask restore it too. Reopening the application restores/focuses its existing workspace.
- Rapid show/hide changes are serialized so an old asynchronous Dock-show completion cannot leave the final state wrong.
- Capture protection is reapplied after activation-policy changes. Dock errors are reported separately and do not cancel transcription or AI.
- The four bundled speech tools and optional local AI path remain intact. No proprietary native module, private window-server patch, process hiding or recording-permission bypass is added.

Dock hiding changes local app presentation. It does **not** prevent a meeting application from capturing a window. GO1 does not claim to disappear from process monitors or other system inspection tools.

## Why complete invisibility cannot be promised

[Electron documents](https://www.electronjs.org/docs/latest/api/browser-window#winsetcontentprotectionenable-macos-windows) that ScreenCaptureKit-based applications can capture a window despite content protection. [Apple documents NSWindowSharingNone](https://developer.apple.com/documentation/appkit/nswindow/sharingtype-swift.enum/none?language=objc) as legacy and advises against relying on it to omit captured content. [An Apple Developer Forums report](https://developer.apple.com/forums/thread/808016) describes capture differences after filter changes; Apple's response requests a reproducible bug report. That is a reason to test multiple capture states, not evidence of guaranteed exclusion.

The current implementation can match the observed API configuration. Only testing the exact OS, meeting client and share mode on a second receiving device can establish the result for that setup. The supplied GO Client itself has not been run in such a meeting during this task.

## Validation and download

Execution pending for this v0.20 change. Results and the installer link are filled in only after retrieving the native workflow outcomes. Earlier verified v0.19 evidence remains in [the packaged-app report](PACKAGED_APP_VALIDATION.md).

The build gate exercises real Whisper recognition and local AI streaming through the packaged app. It now also checks Dock hide/show, workspace recovery, continued live processing and restoration after stop. Separate capture experiments run on macOS 15 and 26 with unprotected controls, screenshots, initial streams and refreshed filters. No screenshot is labelled as a Google Meet receiver view without an actual Google Meet receiving-device test.
