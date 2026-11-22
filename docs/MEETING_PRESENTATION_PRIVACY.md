# GO1 Presentation Privacy Mode (0.4.0)

This mode is designed to prevent accidental disclosure of private transcripts during **authorized** presentations. It does not conceal ongoing interview assistance, bypass proctoring, or guarantee nondetection.

## User flow

1. Before sharing a screen, click **Enable presentation privacy** in GO1.
2. Recording streams are stopped; pending batch and live inference are canceled.
3. Audio chunks, selected file reference, displayed transcript and timestamp segments are cleared from the workspace. Previously exported files are not deleted.
4. A full-window privacy view replaces the main UI. The app remains visible as an application and does not record while privacy mode is enabled.
5. In Meet, Teams or Zoom, choose **one specific window or tab** rather than the entire screen when possible. Preview the share before showing sensitive content.
6. After sharing ends, click **Return to workspace**. Recording does not automatically restart.

## Screen sharing is platform-dependent

- Google Meet supports tab/window/entire-screen selection: https://support.google.com/meet/answer/9308856
- Microsoft Teams supports window or desktop sharing: https://support.microsoft.com/en-us/teams/meetings/present-content-in-microsoft-teams-meetings
- Zoom supports window or desktop sharing: https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0060596
- Electron explicitly warns that `setContentProtection(true)` cannot protect windows from newer macOS ScreenCaptureKit capture paths: https://www.electronjs.org/docs/latest/api/browser-window

## What is NOT implemented

No stealth overlay, anti-detection trick, hidden continued recording, meeting-app-specific capture bypass, concealment of process lists, or platform detection. This feature is a user-controlled recording stop and privacy curtain.

## Physical macOS verification checklist

- [ ] Microphone: enter privacy while live recording; verify macOS mic indicator stops and local audio tracks end
- [ ] System playback: enter privacy; verify audio track ends and no new transcript appears
- [ ] Batch file transcription: enter privacy mid-job; verify canceled job does not reveal text afterward
- [ ] Start recording and immediately enter privacy before permission returns; verify no late capture continues
- [ ] Exit privacy and verify recording remains off until user explicitly starts it
- [ ] In Google Meet, Teams and Zoom: preview shares for tab, window, desktop; ensure only intentionally shared content appears
- [ ] Confirm previously exported transcript files are unchanged and this is clearly communicated to users


## Meeting sharing guide (v0.5)

GO1 includes a visible capture-status indicator, input level meter and a sharing guide for Google Meet, Microsoft Teams and Zoom. Select a specific window or tab when presenting rather than an entire desktop. Do not rely on window masking APIs to guarantee confidentiality. The **Stop capture & mask transcript** action invokes the existing privacy process, stops recording, and requires the user to restart audio manually.

This does not conceal GO1 from monitoring, proctoring utilities, or full-desktop sharing. Verify the recipient view from a second participant account.

## v0.9 emergency global shortcut and fail-closed gate

- **macOS:** Command+Shift+9, **Windows:** Ctrl+Shift+9 (when operating system permits registration). This is **stop only**, never a visibility toggle.
- Main process enters privacy before it notifies the renderer. It aborts live and batch work and revokes pending system-playback requests.
- Renderer stops browser media tracks, discards unprocessed recording chunks and clears transcript elements before waiting for IPC.
- A monotonic privacy epoch invalidates permission, model-load and transcript responses that were pending during a privacy-mode transition.
- Exiting privacy requires explicit UI action and an acknowledgment from the main process; it never restarts recording.
- If the shortcut is reserved by another app, use the visible button.
- Meet, Teams, and Zoom receiver-view tests are **manual acceptance tests**, not automated guarantees. See `docs/SHARE_SAFE_ACCEPTANCE.md`.
