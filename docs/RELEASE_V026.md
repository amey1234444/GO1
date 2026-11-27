# GO1 v0.26

## Changes

- Image analysis uses Ollama's image-capable `/api/generate` endpoint with the selected image and plain question. Text guidance retains `/api/chat`. Cold vision startup has a separate four-minute first-token deadline, followed by a 45-second stream idle deadline and a six-minute total cap. The NDJSON reader processes a final record without a newline and split UTF-8, requires a completion marker and nonempty text, and reports truncated/empty responses accurately. The real LLaVA red-square packaged test remains mandatory. Moondream with Ollama 0.40.16 also produced empty/invalid replies in a direct API reproduction, so it is not the release-validation model. This is an external model/runtime compatibility limit, not a reason to accept empty answers.
- The Mac installer contains the multilingual `ggml-base-q5_1.bin` (59,707,625 bytes). Build-time and packaged-file SHA-256 verification are enforced. Runtime reads the model directly from `Resources/models`; it is not duplicated in user data and no first-run download is needed. Existing installed model preferences remain when valid; missing models fall back to the bundle.
- Overview, Transcription, Live guidance, Image studio, Review & insights and Settings organize the existing features. Navigation preserves the active session. System typography, readable controls, quiet dark surfaces and green accents replace the overloaded long workspace.
- Native FFmpeg is built from pinned n7.1.5 source with all built-in decoders/demuxers, but only local-file/pipe input and the PCM output used by GO1. Unused encoders, network protocols, capture devices and output formats are excluded. Native local/debug symbols are stripped before signing; runtime-only ASAR and lossless DMG compression remain enforced.
- Protected download portal: https://go1-release-desk.velvetywoodpecker16.chatgpt.site/ . Username/password are runtime secrets. Login uses PBKDF2 and signed expiring HttpOnly cookies. Download, version, build and diagnostic APIs require authentication. New DMGs stream from private object storage. Releases include byte size and SHA-256; successful and failed builds show real CI status and diagnostics.
- CI publishing verifies GitHub OIDC signatures, issuer, audience, repository ID, main-branch subject, event and workflow. Large DMGs upload in 8 MiB parts. Builds that fail the packaged smoke test cannot publish. No long-lived upload token is needed. Existing public GitHub releases are not deleted or made private.

## What this does not change

The DMG is a disk image, not an inference service: transcription executes on the user's Mac using the bundled runtime/model. AI guidance/vision still needs a separately installed Ollama/model. Larger Whisper models remain optional for accuracy. The compact model trades some accuracy for size; actual quality depends on language/audio/hardware. No billing or subscriptions were added.

A download password gates downloads from the portal; a copied DMG can still be installed. Historical public GitHub release URLs remain public. This is not DRM or a licensing/activation service.

Apple notarization requires the existing configured Developer ID credentials. Without them the workflow labels the build as an ad-hoc preview; this update does not make it Apple-notarized. The final DMG size must come from package-integrity.json, not a predicted savings claim. Adding bundled weights may outweigh executable savings compared with a model-free installer.

## Verification

`npm run check` and `npm test` cover source syntax, model selection and streaming regressions. Portal tests cover protected endpoints, valid/invalid credentials, tampered/expired cookies, cross-origin requests, throttling, verified publisher identity and streamed downloads. The macOS workflow mounts the actual DMG, checks signatures and checksums, launches a fresh app profile, proves the bundled speech path is ready without a download, transcribes real synthesized speech and runs real Ollama text/vision inference.

Linux checks cannot establish a passing Mac packaged run. Consult the exact build in the portal / GitHub Actions for release outcome. Hardware microphone permissions, physical meeting receivers and browser-downloaded Finder first launch are outside the synthetic packaged test's coverage.
