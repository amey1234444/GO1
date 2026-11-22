# GO1 v0.13 — Live Companion (ordinary visible window)

The companion opens after the persistent Whisper live session is initialized, and closes on stop, cancel, privacy activation, app shutdown and main-window close. It mirrors the live transcript (up to 1,800 characters), the detected/edited question (up to 2,000 characters), and the output of **user-triggered** Ollama talking points (up to 16,000 characters). Data stays in application memory and flows through restricted Electron IPC; the companion cannot access a microphone or AI provider.

The panel is a **regular focusable window**, with 94% opacity by default. Its slider allows 82–100% opacity. It is not capture-excluded and can appear in full-screen desktop sharing. Do not use it for unauthorized assistance. The companion displays a visible disclaimer and offers **Stop & mask**, which invokes the same main-process privacy gate as the emergency shortcut.

## Verification
1. Install a multilingual Whisper model and start Ollama with an available local model, if suggestions are desired.
2. Enable assistance only when authorized. Launch a live session and verify the companion opens.
3. Speak into the permitted input and check that the latest transcript appears in both windows.
4. Review/edit a detected question in GO1 and request talking points. Verify text streams into the companion.
5. Slide the opacity controller and verify the panel remains legible.
6. Close the panel and use **Show companion** to reopen it while the session remains active.
7. Trigger the global privacy shortcut. Verify audio capture stops and the companion closes immediately; no text or recording resumes on exit.
8. Join test Meet/Teams/Zoom calls with a second device; verify that the companion is *not* falsely considered invisible while full-desktop sharing.

Mac-specific window behavior and live audio performance require physical macOS acceptance testing; unit tests and GitHub packaging are not substitutes.
