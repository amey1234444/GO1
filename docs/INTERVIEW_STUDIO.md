# Interview Studio — acceptance and security

This is a **visible self-practice** workflow, not a hidden assistant for live interviews. Interface is independently designed from architectural research; no GO Client assets or proprietary runtime code are used.

## Session flow

- Configure role (2–120 chars), role description (max 1600), job description (max 10000), mock interview focus, and spoken language.
- Store a local JSON profile with user-only file permissions; never store model tokens.
- Launch microphone practice explicitly. Language and Fast VAD are passed into the existing persistent Whisper session.
- Finish/stop recording, inspect transcript and timestamps.
- Generate optional post-session role-aware coaching using the loopback Ollama API, with cancel, output-size limits, fixed endpoint and explicit error messages. No model is contacted during active recording.
- In presentation privacy: stop local capture, abort batch/stream/coach operations, clear the visible transcript and practice feedback, and require manual restart.

## QA checklist for a physical Mac

- [ ] Enter role, role description, JD and non-English language; restart the app; ensure values persist.
- [ ] Start and stop a 30-second self-recording; verify current Whisper model receives audio and creates transcript text.
- [ ] Repeat English, Hindi and Marathi; verify quality and detected language against spoken reference text.
- [ ] Choose language Auto for other supported languages; check recognition.
- [ ] With Ollama absent, check that AI-coach status reports unavailable without breaking recording.
- [ ] With Ollama running and a downloaded local model, request coaching after a recorded answer; check model receives configured JD and selected language.
- [ ] Interrupt coach generation and activate presentation privacy; confirm the transcript and feedback disappear and no delayed chunks reappear.
- [ ] Deny mic permission; verify no capture indicator remains active.
- [ ] Verify no outbound cloud connections (local Ollama and model downloads excepted).
- [ ] Test the installed unsigned DMG, then sign/notarize before public distribution.

## Known limits

AI response accuracy is not guaranteed. VAD endpoint latency and model inference depend on hardware. Global shortcut registration may fail if macOS reserves that combination. This release has no undetectable overlay or proctoring bypass.
