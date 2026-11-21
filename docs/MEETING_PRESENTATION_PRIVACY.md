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
