# v0.23: smaller DMG and downloaded-app policy evidence

The reported screenshot says **“GO1 is damaged and can’t be opened. You should move it to the Bin.”** The user confirmed it occurred when opening an **earlier download**, not the v0.22 installer. The specific installed app/version has not been inspected on that Mac. This confirms the launch failure but does not establish its exact underlying cause.

## What changed

The v0.22 release already added explicit final-bundle signing and strict signature verification, removed development files and duplicate native tools, and reduced the DMG from approximately 170 MiB to 130 MiB. Its signature passed, while Gatekeeper rejected its ad-hoc identity. That is documented in [the v0.22 evidence](MAC_INSTALLER_V022.md).

v0.23 adds two improvements:

1. **Measured lossless compression:** build the UDBZ image, convert a candidate to ULMO/LZMA, verify both, and retain the smaller image. The following mounted-image checks verify the contained app signature and bundled tools. No runtime feature, speech language, Electron component or audio tool is removed. Model weights remain separate downloads.
2. **Quarantined-copy policy assessment:** copy the app from the mounted DMG, apply a synthetic browser-style quarantine attribute, verify the signature and run both `spctl --assess` and `syspolicy_check distribution`. Save the complete result. A Developer ID release must pass both before publication. An ad-hoc preview is explicitly labelled and its rejection remains visible.

The assessment does not remove quarantine, create a security exception, disable Gatekeeper, launch a browser or operate Finder. It is evidence of policy checks on a quarantined app copy, not proof of the user's actual first-launch experience.

## What cannot be promised

Apple Developer ID signing and notarization require the repository owner's Apple credentials. Compression and ad-hoc signing cannot provide those credentials or Apple's approval. Follow the [signing setup](MAC_INSTALLER_V022.md#apple-signed-distribution-setup) to produce a normally trusted release.

Capture protection remains an OS request independent from transcription and enabled AI. Neither smaller packaging nor signing establishes universal invisibility. The native capture experiments do not certify actual Zoom, Meet or Teams receiver output. No feature was added to evade proctoring.

## Validation and download

[Direct GO1-0.23.0-arm64.dmg download](https://github.com/amey1234444/GO1/releases/download/v0.23.0-mac.33/GO1-0.23.0-arm64.dmg) · [Release and checksum](https://github.com/amey1234444/GO1/releases/tag/v0.23.0-mac.33)

**Ad-hoc preview, not Apple-notarized. Its distribution policy checks failed; this is not a normally trusted release.** The tests do not establish that the latest app opens on the user's Mac.

| Check | Result |
|---|---|
| Code commit | `40ac7ecea777b0834d238953825c0ff4030f08c9` |
| Mac build / direct publication | [Run 45086154725](https://github.com/amey1234444/GO1/actions/runs/45086154725), successful |
| Automated tests | 115 passed |
| Copied-app speech/AI/lifecycle | All 15 packaged stages passed |
| Image and nested app signatures | Passed |
| UDBZ candidate | 136,368,154 bytes |
| Selected ULMO candidate | **109,093,557 bytes = 104.0 MiB** |
| Compression saving in this build | 27,274,597 bytes, approximately 20% |
| Compared with original v0.20 DMG | Approximately **39% smaller** than 178,326,053 bytes |
| Quarantined-copy Gatekeeper assessment | Rejected, exit 3 |
| `syspolicy_check distribution` | Exit 70; `Notary Ticket Missing` and `Internal Xprotect Error` |
| Separate native capture jobs | [Run 45086154722](https://github.com/amey1234444/GO1/actions/runs/45086154722), macOS 15 and 26 passed |
| Browser/Finder user journey, physical audio hardware, remote meeting receiver | Not verified |

DMG SHA-256: `7e8ee85a0a4b1a93ba3f97dcc7a3a04c6aa9efdbe810aa0fe02ded93071af158`. The published asset's size and digest match the retrieved build report. The installed app payload remains 360,276,501 bytes; the compression improvement reduces download size, not RAM requirements or installed payload. Speech models and optional Ollama are separate.

Raw evidence: [compression comparison](evidence/mac-installer-v023/compression.json), [signature/size report](evidence/mac-installer-v023/package-integrity.json), [quarantine policy output](evidence/mac-installer-v023/download-policy.json), [15-stage runtime report](evidence/mac-installer-v023/packaged-smoke.json).

### Independent scanner control

[Control run 45086876645](https://github.com/amey1234444/GO1/actions/runs/45086876645) completed on both systems. It downloaded the exact v0.23 DMG, verified its SHA-256, compiled a separate C program containing only `int main(void) { return 0; }`, packaged/ad-hoc signed that program, and assessed both app copies with identical quarantine flags. No application was launched and no security setting was changed.

| Environment | GO1 | Independent minimal app |
|---|---|---|
| macOS 15.8.2 | Signature valid; missing ticket; internal XProtect error | Signature valid; missing ticket; same internal XProtect error |
| macOS 26.7.2 | Signature valid; ad-hoc warning; missing ticket; internal XProtect error | Signature valid; same three policy diagnostics |

[macOS 15 raw control report](evidence/mac-installer-v023/policy-control-macos-15.json) · [macOS 26 raw control report](evidence/mac-installer-v023/policy-control-macos-26.json) · [Provenance and hashes](evidence/mac-installer-v023/provenance.json).

The shared error supports an environment/tool explanation; it does **not** certify GO1 as malware-free, prove that every user will get the same result or count as a passed distribution check. The original user-machine damaged alert is not conclusively diagnosed by this CI experiment. Developer ID signing/notarization and a successful end-user first launch still need to be completed. Signed-release publication remains blocked if either policy assessment fails.

Release-gate fixtures verified that rejected quarantine policy prevents publication as an Apple-notarized release and that modified images are rejected.

## Replacing the old copy

Quit GO1, replace only `/Applications/GO1.app` with the new release, eject the mounted DMG, and open the Applications copy. Avoid accidentally opening a stale copy from Downloads, an old mounted disk or a Dock shortcut pointing to it. Application settings and downloaded models are separate from the `.app` bundle; do not delete them for this update.

For a latest-build failure, these read-only commands identify the version, integrity and trust result:

```sh
/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' /Applications/GO1.app/Contents/Info.plist
codesign --verify --deep --strict --verbose=2 /Applications/GO1.app
spctl --assess --type execute --verbose=4 /Applications/GO1.app
```

If the signature is valid and macOS reports only an unidentified/unverified developer, Apple's [Open Anyway instructions](https://support.apple.com/en-us/102445) describe a per-app exception when the user trusts its source. That is a local user decision, not a repaired signature or notarization. A repeated **damaged** warning needs the exact latest-build results above; do not treat all warnings as interchangeable.

Primary references: [Apple Developer ID distribution](https://developer.apple.com/developer-id/), [Apple testing a Developer ID-signed app](https://help.apple.com/xcode/mac/current/en.lproj/dev1cc22a95c.html), [Apple app-opening guidance](https://support.apple.com/en-us/102445). Disk image support is checked by invoking the installed Apple `hdiutil` tool in the Mac workflow.
