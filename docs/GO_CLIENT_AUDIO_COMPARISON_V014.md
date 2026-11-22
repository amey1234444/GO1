# GO Client 2.0.11 vs GO1 0.14.0 — evidence-based comparison

> Historical release notes. v0.15 adds best-effort OS capture protection; see [current behavior and evidence](CAPTURE_PROTECTION_STUDY.md). Stop-and-mask remains available. No universal invisibility is claimed.

**Input:** supplied `GO_Client-2.0.11-arm64(1).dmg`, SHA-256 `059ff75f28b7604966a800493c3c05c52aeebdf28ee1ccafed28a39e5c7a3b54`. Static code review only; no original-app execution or live receiver test. Do not redistribute proprietary recovered code.

| Recovered original artifact | Direct observation | Not established |
| --- | --- | --- |
| `@greatofferai/audio-capture/index.cjs` | Separate microphone/system flags; Rust native capture; bounded queue; 20-ms polling, up to 64 frames; diagnostics | Exact performance on all macOS systems |
| ARM64 audio module | CoreAudio process-tap and ScreenCaptureKit references | Runtime backend for each device |
| `out/main/index.js` | Floating assistant, session manager, screenshot selection, window-content protection | Invisibility in Meet, Zoom or Teams |
| `@greatofferai/window-control` binary | CoreGraphics window-list APIs and dragging | Custom OS capture bypass |
| `out/agent/runtime.cjs` | Streaming speech and staged draft/final AI requests | Actual production model or latency |

## Clean-room GO1 implementation

GO1 uses an independent pipeline: `MediaStream` → AudioWorklet → IPC → VAD → Whisper. It does **not** include the proprietary Rust module, dual concurrent audio streams or remote gateway.

- **PCM16 data repair:** GO1 worklet sends `Int16Array` samples while its `SpeechSegmenter.append` expects `Uint8Array` bytes. At the Electron main-process boundary, `src/audio/diagnostics.js` converts and validates the frame.
- **Telemetry:** Per-session source, 16-kHz audio duration, RMS, peak, clipping, frame count and long arrival intervals.
- **UI:** A transcript-free `go1:audio-health` IPC event drives the visible Latency Lab panel.
- **Privacy:** Reset diagnostics on stop, cancel or privacy; discard UI events when privacy is active or a session ID differs.
- **Testing:** `npm run check && npm test` verifies PCM fidelity, error handling, signal metrics and arrival-gap accounting.

A long arrival interval is **not proof of lost audio**. The new stats do not measure total answer latency.

## Mac acceptance

On a physical Apple Silicon Mac (14.2+), grant audio permission, start a microphone session, and confirm captions and capture counters advance. Repeat using explicitly authorized system playback. Stop/restart to ensure counts reset; activate the emergency privacy shortcut and verify both recording and display stop. Inspect actual receiver view separately when screen sharing.

**Not implemented:** Native Rust/CoreAudio capture replacement, OS capture exclusions, screenshot-analysis answer automation, covert meeting operation or universal invisibility.
