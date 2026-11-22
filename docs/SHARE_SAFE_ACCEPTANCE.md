# GO1 v0.9 — Presentation privacy acceptance protocol

> Historical release notes. v0.15 adds best-effort OS capture protection; see [current behavior and evidence](CAPTURE_PROTECTION_STUDY.md). Stop-and-mask remains available. No universal invisibility is claimed.

**Goal:** avoid disclosing private transcript data in ordinary, authorized meetings.
**Not a test of hidden interview assistance or proctoring evasion.**

## Requirements

- Two test accounts and two devices, or a consenting colleague to observe the receiver's view.
- Explicit recording and participation consent. Do not record private meetings unexpectedly.
- GO1 running on macOS 14.2+ with a multilingual model installed.
- Record the exact macOS version, Google Meet/Teams/Zoom app version, browser if used, screen-sharing method, and test result.

## Test matrix (run separately for each platform)

| ID | Scenario | Expected behavior | Evidence |
|---|---|---|---|
| P1 | GO1 actively recording; press Command+Shift+9 while GO1 is unfocused | GO1 records no more audio; privacy curtain displayed; main process refuses new capture | local mic indicator, second participant image |
| P2 | Present one selected browser tab or app window | Receiver sees intended tab/window; user confirms GO1 not in the *selected* content | receiver screenshot |
| P3 | Present entire desktop *after activating privacy* | Receiver may see GO1's privacy curtain, but **never private transcript text** | receiver screenshot |
| P4 | Permission prompt still pending; press emergency shortcut | Later permission cannot restart recording; microphone remains off | screen recording of the consenting local test |
| P5 | Whisper transcription still running; activate privacy | Pending result cannot show, even after returning to workspace | UI and event log |
| P6 | Exit privacy after sharing | Recording does not restart automatically; user must opt in | local audio status |
| P7 | Shortcut is reserved/unavailable | Visible button still works; no claim shortcut succeeded | UI status text |

## Platform-specific receiver-view actions

**Google Meet**: Join on two separate devices. Use Present now > A tab or A window. Verify recipient. Then enable privacy and test Your entire screen. See https://support.google.com/meet/answer/9308856

**Microsoft Teams**: Use Share > Window. Validate what the second participant sees. Then enable privacy and test Screen/Desktop sharing. See https://support.microsoft.com/en-us/teams/meetings/present-content-in-microsoft-teams-meetings

**Zoom**: Use Share Screen > application window, then enable privacy before desktop sharing and verify it from the receiver. See https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0060596

## Pass criteria and limitations

Each meeting platform requires a **real receiver-view test**. Automated unit tests cannot certify Meet, Teams or Zoom sharing results. GO1 intentionally does not manipulate these applications' capture methods. If sharing a full desktop, expect even the privacy curtain to be visible. The goal is content redaction and audio shutdown, not application invisibility.

## Results (not yet executed)

| Platform | Window/tab | Full desktop | Mic/system-audio shutdown | Notes |
|---|---|---|---|---|
| Meet | Pending physical test | Pending | Pending | |
| Teams | Pending physical test | Pending | Pending | |
| Zoom | Pending physical test | Pending | Pending | |
