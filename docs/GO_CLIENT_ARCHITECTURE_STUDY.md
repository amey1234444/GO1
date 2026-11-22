# GO Client 2.0.11 → GO1 independent architecture study

Scope: static inspection of the user-provided GO_Client-2.0.11-arm64(1).dmg, SHA-256 059ff75f28b7604966a800493c3c05c52aeebdf28ee1ccafed28a39e5c7a3b54. The program was not run, authenticated, or tested in Meet, Teams, Zoom or a proctored interview. No proprietary code or binaries are included here.

## Verified observations from the original binary

- Electron desktop package with main/renderer/preload and separately bundled Node agent.
- The native audio-capture module exposes microphone/system audio frames, timestamps, voice probability and bounded batches. Its JS bridge drains frames every 20 ms, up to 64 per tick.
- A custom native window-control module provides window enumeration/input support.
- The assistant has multiple Electron windows, including floating panels, and screen-capture protection preferences.
- Transcription and answers call an authenticated AI gateway; the app is not simply a local model running on the user's computer.

## What the binary cannot prove

It does not establish invisibility in Teams, Zoom or Meet, nor any bypass of proctoring. Electron explicitly says content protection does not reliably prevent capture by macOS applications using ScreenCaptureKit: https://www.electronjs.org/docs/latest/api/browser-window.

## GO1 independent design

GO1 retains local Whisper and explicit stop/mask Presentation Privacy. Its optional separate practice-review window is intentionally limited to completed practice. It is a standard visible window (not capture-excluded or always-on-top) with restricted preload, IPC data validation and no recording operations. It closes when Presentation Privacy starts and cannot open during active inference or live sessions.

## Further authorized milestones

1. Measure real multilingual accuracy, latency, and native audio performance on Apple Silicon.
2. Test capture safety during full-display and selected-window sharing with consenting participants.
3. Sign and notarize the DMG for general distribution.

The objective is a reliable practice tool, not hidden interview assistance.
