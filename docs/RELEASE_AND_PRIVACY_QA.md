# GO1 release and presentation privacy QA — v0.7.0

## Scope and limits

GO1 is a consent-based transcription application. It does **not** promise to bypass assessment monitoring or disappear from capture feeds. Zoom, Meet, and Teams control their own sharing pipelines. OS-level exclusion techniques are not reliable across versions and providers; Electron explicitly warns that some macOS ScreenCaptureKit paths can capture content-protected windows.

This document separates (1) automated build validation, (2) installation smoke tests, (3) actual audio quality tests and (4) receiver-view privacy tests. Passing (1) does not imply passing any of the others.

## Automated release jobs

- `npm run check && npm test`: executes JavaScript syntax and unit tests, including Windows `.exe` discovery and platform-specific capture availability.
- Windows GitHub runner (`windows-2025`): runs `electron-forge make --platform win32 --arch x64`, checks MSI exists and reads its `ProductName`, `ProductVersion`, and `UpgradeCode` properties using Windows Installer COM.
- macOS GitHub runner (`macos-15`): runs `electron-forge make --platform darwin --arch arm64`, then checks the DMG with `hdiutil verify` and `imageinfo`.
- Both workflows upload unsigned artifacts for 14 days. No code-signing credentials are added to CI.

## Windows device tests (Windows 10/11 x64)

- [ ] Install MSI interactively. Confirm Start Menu launcher, app starts and uninstalls cleanly.
- [ ] Run `scripts/setup-windows.ps1` and install approved FFmpeg and official whisper.cpp binaries; open GO1's setup pane and verify they are found.
- [ ] Download Small multilingual model in UI; verify model header and model selection.
- [ ] Confirm recording permission shows correctly. Record at least 30 seconds in each of English, Hindi and Marathi; compare actual transcript with manually prepared reference (word-error rate).
- [ ] Import an MP3 and WAV; verify JSON/SRT exports and timestamps.
- [ ] Ensure Mac-only system playback recording option is disabled, not silently attempted.
- [ ] Reboot, reinstall a later MSI and verify it upgrades (stable `upgradeCode`).
- [ ] Check Defender/SmartScreen warnings on unsigned builds. Obtain code-signing certificate before release.

## macOS device tests (macOS 14.2+ Apple Silicon)

- [ ] Mount DMG and launch app; test Gatekeeper warnings expected for unsigned preview.
- [ ] Install FFmpeg and whisper.cpp; install a model in GO1.
- [ ] Record microphone and permitted system playback; verify macOS indicators and that *only audio* is processed.
- [ ] Deny microphone and screen/system-audio permissions, then grant them and retry. Verify error messages and restart guidance.
- [ ] Check English, Hindi, Marathi, mixed-language samples and VAD false positives. Measure p50/p95 inference and end-to-caption delay with the benchmark script.
- [ ] Sign with Developer ID, notarize, staple, verify `codesign`, `spctl`, and Gatekeeper on a second Mac before public distribution.

## Meet / Teams / Zoom receiver-view privacy verification

Perform on both operating systems with a second participant and **with permission from everyone recorded**:

1. Start local GO1 recording and verify it is visibly marked Recording.
2. Click **Stop capture & mask transcript**. Confirm tracks stop, transcript is cleared, no inference is pending and recording does not restart.
3. Share a **single tab or application window** in the chosen meeting service. On the receiving participant's device verify only the intentionally shared content appears.
4. Share the **entire desktop** and verify the privacy curtain is visible if GO1 is on that desktop. This is expected, not a failure of the privacy feature.
5. Return to GO1, exit presentation privacy and confirm recording remains off until restarted manually.
6. Repeat with microphone permission pending and imported-audio transcription in progress; confirm no late results appear while privacy curtain is active.
7. Record versions of OS, browser/app, share mode and actual recipient-view screenshots. Avoid claiming universal behavior from one test.

**No fully automated multi-platform meeting receiver test is implemented.** Such a test requires actual logged-in second-party sessions, graphics devices, and real meeting app versions. A build runner cannot certify “undetectability”.

## Shipping gates not yet passed

- Bundled, license-audited native speech engine binaries and FFmpeg for each target CPU/OS
- Signed Windows MSI and Developer ID–signed, notarized, stapled macOS DMG
- Physical hardware audio-capture acceptance, multi-language accuracy, cancellation and long-session endurance
- Actual Meet, Teams, Zoom recipient-view tests
