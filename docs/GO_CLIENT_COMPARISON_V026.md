# GO Client comparison and GO1 workspace changes

Reviewed 28 November 2026 against the supplied GO Client 2.0.11 ARM64 installer, SHA-256 `059ff75f28b7604966a800493c3c05c52aeebdf28ee1ccafed28a39e5c7a3b54`. It matches the previously extracted package; existing inventories remain applicable. This is static inspection, not a logged-in test of the original cloud product. No recovered code, private credential, or branding asset is included in GO1.

## What happens to audio and AI requests

The original native audio bridge exposes microphone and system channels, selected devices, PCM frames and voice activity information. Its agent opens an authenticated streaming transcription session and sends binary PCM. The bundled agent maintains conversation/context state and separate draft, final and screenshot answer flows. The client package does not establish the current server-side provider, model routing, prompts, latency or account entitlements. A working copy of those private services cannot be obtained from the DMG alone.

GO1 intentionally keeps speech offline, as requested: microphone or Mac playback → AudioWorklet/16 kHz PCM → bounded voice segmentation → bundled persistent Whisper server → transcript. The app includes the checksum-pinned Base Compact multilingual speech model. The new combined-input option independently acquires microphone and system playback, mixes them at half gain, and passes one stream to the same speech pipeline. It is **not** speaker diarization or GO Client's separate-channel native implementation. Headphones reduce the chance of recording playback twice through the microphone.

For an explicitly requested AI answer, GO1 sends a role profile, recent transcript, question, answer preferences and bounded excerpts from selected preparation materials to local Ollama `/api/chat`. Only selected materials are eligible for the local lexical retrieval (6,000-character excerpt budget); this is not an embedding-based document index. Reviewed images use `/api/generate` with an installed vision model. Text/vision models remain separate from the bundled speech model. The stream reader distinguishes completed, empty, truncated, cancelled and stalled output. Practice feedback now also accepts a final JSON record without a newline and cancels blocked reads.

## Implemented additions

| Area | GO1 behavior |
|---|---|
| Preparation | Local resume/knowledge text library; create, edit, delete; TXT/Markdown import or pasted text; select up to eight materials per role |
| Target roles | Save, load, update and delete multiple role setups; preserve language, model, job context and answer preferences |
| Session records | Explicitly save completed transcripts with segments, date, duration, profile and feedback; search, open, export JSON and delete |
| Answer controls | Brief/balanced/detailed, talking points/structured/direct answer, conversational/formal/technical tone, additional preferences |
| Rich answers | Safe headings, lists, bold, inline code and fenced code in workspace and companion; no raw HTML execution or automatic external resources |
| Audio | Microphone device picker, bounded local sound check, combined microphone + Mac playback, cleanup on permission failure/end/privacy/reconnect |
| Privacy | New screens clear immediately on Stop & mask; IPC checks privacy epochs; saved records remain on disk unless deleted explicitly |
| Persistence | Serialized, bounded, atomic local workspace writes; malformed storage is preserved and reported; restart does not start recording |
| Validation | Real Electron UI workflow in CI, repeated inside the macOS packaged smoke; saved data also checked after actual app restart |

The UI uses GO1's independent components and names, with preparation and history navigation aligned to the observed product workflow. It is not a pixel-identical reproduction of proprietary assets.

## Remaining differences

PDF/DOCX parsing, semantic document indexing, cloud account/billing/support services, the original model gateway, staged/automatic answers, separate-channel speaker recognition, full localization, editable global shortcuts, automatic app updates and restart-resume of a live recording are not implemented by this change. Saved sessions are reviewable; recording always needs an explicit new start. No universal capture exclusion or Apple notarization is claimed.

## Evidence and build status

The previous PR head `e7690d1eec36d9cc7772d4229bc18af95d783fd6` passed all 22 packaged checks, Windows and source CI. Older failed Actions runs remain historical evidence, not current failures. This extension adds source tests and an Electron workspace CI job; its fresh run must pass before this broader change is release-ready. UI integration uses a transcript fixture; native speech/vision inference stays covered by the existing macOS smoke. Physical microphone/TCC and meeting receiver behavior require hardware testing.
