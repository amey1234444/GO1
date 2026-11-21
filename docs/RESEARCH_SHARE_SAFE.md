# GO1 share-safe research (November 2026)

GO1 provides local consent-based transcription and a visible privacy mode. It does not promise covert, proctoring-resistant or universally capture-excluded behavior.

- [Google Meet Help](https://support.google.com/meet/answer/9308856): share a tab, window or entire screen.
- [Microsoft Support](https://support.microsoft.com/en-us/teams/meetings/present-content-in-microsoft-teams-meetings): share a window or screen, including native macOS sharing.
- [Zoom Support](https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0060596): share an app or whole desktop.
- [Electron BrowserWindow](https://www.electronjs.org/docs/latest/api/browser-window/): setContentProtection is not guaranteed against capture by modern macOS ScreenCaptureKit apps.

GO1 cannot certify exactly what another meeting participant sees. Select the intended window/tab, or trigger presentation privacy before sharing your whole screen. Privacy mode stops recording; it does not secretly continue processing audio.

## Physical-device checks

1. Test current Meet, Teams and Zoom versions on a physical Mac.
2. Inspect the remote view with a second device and account.
3. Confirm audio capture stops and the transcript is redacted in privacy mode.
4. Confirm delayed microphone permissions cannot restart recording.
5. Confirm the app needs an explicit new action to resume recording.
