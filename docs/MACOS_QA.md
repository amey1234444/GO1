# macOS QA checklist — run on physical hardware before release

Record date, model/CPU, macOS version, Electron version, whether running from Terminal or signed `.app`, and each test's pass/fail with logs and short audio fixture.

## Preparation
- [ ] Apple Silicon Mac running macOS 14.2 or later
- [ ] `brew install ffmpeg whisper.cpp`, with `whisper-server`, `whisper-cli`, `ffprobe` on PATH
- [ ] `npm install`, `npm run check`, `npm test`, `npm start`
- [ ] Download Base from UI, cancel a model download, restart, then finish Small download
- [ ] Install optional Silero model and restart model worker
- [ ] Choose Base/Small/Medium, switch back and verify persisted setting

## Microphone
- [ ] Microphone permission request appears only after clicking Record
- [ ] Deny microphone permission: actionable error and no recording
- [ ] Approve permission, speak sample English, Hindi, Marathi, Japanese and Spanish phrases
- [ ] Capture loud, quiet, silence, background noise, music and stop while speaking
- [ ] Check timestamps remain monotonic; copy + export all four formats
- [ ] Confirm no audio remains recorded after Stop/Cancel or application exit
- [ ] Keep speaking for 30 minutes, verify bounded memory and user-visible backlog errors

## System audio
- [ ] With permission absent, select System audio and confirm actionable error
- [ ] Grant macOS System Audio Recording permission and restart if needed
- [ ] Play consented audio from browser app; transcribe in both live and batch mode
- [ ] Confirm there is **no captured video** in recording data, files or exports
- [ ] Revoke permission mid-session; confirm stream stops/reports error
- [ ] Verify app launched from Terminal and signed `.app` separately (different responsible process)
- [ ] Confirm system-audio and microphone sources cannot be inadvertently captured together

## Robustness
- [ ] Kill whisper-server mid-session and observe recovery or actionable failure
- [ ] Corrupt model file; verify failure and reinstall instructions
- [ ] Disconnect network after model install; verify offline transcription still works
- [ ] Check heavy-load CPU/RAM, inference queue, cancellation, long utterances, script changes
- [ ] Verify `127.0.0.1` binding, no listening on network interfaces
- [ ] Test CI unsigned DMG and signed/notarized DMG separately

## Release gate
Do not claim a signed, notarized, standalone, production-ready app until all blocking tests pass on representative hardware. `spctl`, `codesign`, `stapler`, certificate validity, and macOS Gatekeeper behavior need real testing.
