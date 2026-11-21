# GO1 latency measurements and the <500 ms target

Research checked 22 November 2026. This project is an independently developed, consent-based mock-interview transcription app; it does not hide AI assistance from assessors.

## What the competitor documentation establishes

GreatOffer AI documents separate microphone/system audio sources, transcripts, live answers, manual/automatic answer controls, and practice reports. Its publicly accessible Help Center does **not** supply the benchmark methodology for a displayed “<500 ms median in voice mode” claim. Do not assume the claim measures the entire path from finished speech to a complete AI-generated answer.

Primary sources:
- https://docs.greatoffer.ai/en/assistant/audio
- https://docs.greatoffer.ai/en/assistant/overview
- https://docs.greatoffer.ai/en/assistant/auto-and-manual
- https://docs.greatoffer.ai/en/practice/rehearse
- https://github.com/ggml-org/whisper.cpp/blob/master/examples/stream/README.md
- https://github.com/k2-fsa/sherpa-onnx
- https://aclanthology.org/2023.ijcnlp-demo.3.pdf

## GO1's exact measurement boundary

GO1 v0.6 captures **real** local timings (using `node:perf_hooks`, monotonic milliseconds) when a VAD utterance is emitted:

- `queueMs`: from VAD dispatch to start of inference (backlog).
- `inferenceMs`: from start of Whisper request to receipt of its complete result.
- `postVadMs`: from VAD dispatch to result receipt, i.e. queue + inference.
- `vadHoldbackMs`: configured speech-end silence holdback, **not part of postVadMs**.

The GUI displays measured p50/p95/count and up to 20 real post-VAD samples. No fake defaults and no chart before the first utterance.

This is **not** end-to-end first-caption latency. It excludes input capture buffering, speech-end silence detection, renderer scheduling, and any future AI model generation. `postVadMs` is also not a word-by-word streaming measurement because upstream `whisper-server` runs HTTP inference over a voiced chunk.

## Low-latency modes

- Fast: ~260 ms silence holdback; speech may be segmented across natural pauses.
- Balanced: ~550 ms silence holdback; better phrase continuity, slower turns.

Both keep the model process loaded between utterances; neither guarantees 500 ms. Long utterances may be split at 7.5 / 11 seconds respectively. Larger Whisper models tend to consume more compute. `small`, `base`, and a capable Apple Silicon chip should be benchmarked separately.

## Physical-Mac benchmark

```bash
brew install ffmpeg whisper.cpp
npm install
node scripts/benchmark-whisper.js ./fixtures/consented-speech.wav 8
```

For user-installed models the script reads `~/Library/Application Support/GO1/models/ggml-small.bin` unless `GO1_WHISPER_MODEL` overrides it. The script runs real inference on a 0.5–15 second audio clip, reports cold model startup and p50/p95 of inference calls, and never reports synthetic data as a measured performance value.

Measure at least 30 utterances for a meaningful UI p95, with English/Hindi/Marathi speakers, short and long pauses, quiet/loud microphones, changing devices, and active CPU load. Record the Mac model, RAM, macOS version, Whisper version, model, language, sample size and methodology. Check word-error rate against hand-verified ground truth, not just speed.

## Next major research direction

A truly incremental ASR recognizer (e.g. sherpa-onnx streaming models) can emit provisional text before the speaker stops. Its language coverage, license, macOS packaging and accuracy must be verified per model; no streaming engine universally handles every language equally. Keep Whisper for multilingual finalization, benchmark streaming partial captions separately, and do not silently substitute fast but inaccurate transcriptions for final text.
