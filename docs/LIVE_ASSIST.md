# GO1 Live Assist engineering notes

> Historical release notes. v0.15 adds best-effort OS capture protection; see [current behavior and evidence](CAPTURE_PROTECTION_STUDY.md). Stop-and-mask remains available. No universal invisibility is claimed.

This is a visible, expressly authorized, local interview/meeting copilot. It does not implement stealth overlays or anti-capture measures.

## Workflow

- The existing recorder captures only with user action and macOS permissions.
- AudioWorklet converts to PCM; the existing VAD pipeline sends utterances to the persistent `whisper-server` worker.
- The renderer updates the transcript and identifies possible questions using a heuristic (`suggestQuestion`). Users may correct the question manually.
- The user explicitly clicks **Suggest talking points**, which starts a local Ollama request for role-specific guidance. Job descriptions and transcripts are treated as untrusted data.
- A narrow Electron preload exposes `generateLiveGuidance`, `cancelLiveGuidance`, and `onAssistChunk`. Provider credentials never enter the renderer. No external network is required beyond the locally running Ollama process.
- The main process refuses requests unless a live session exists, permission was confirmed when starting it, and the privacy gate is not paused.
- Pressing the privacy shortcut aborts active AI requests, cancels inference, stops audio capture and masks content. Stopping the live session aborts guidance.

## Validation

Run `npm run check && npm test`. Tests cover question extraction, prompt separation, NDJSON response streaming, failure handling and cancellation. A real-device test is required to measure actual speech-to-caption and caption-to-guidance latencies and verify recording permissions.

## Deliberate limitations

- No concealed window, invisible assistant, anti-proctoring capability or automatic answering.
- Question detection is heuristic. It can confuse commands, dialogue, or multilingual text; manual correction is supported.
- Recording starts with microphone; authorized system audio is a separate user-controlled source.
- Ollama model must be installed and running locally. Output accuracy is not guaranteed.
