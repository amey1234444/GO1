'use strict';
const { SpeechSegmenter } = require('./vad');
const { appendText } = require('./live');
const { LatencyTracker } = require('./latency');
const { performance } = require('node:perf_hooks');
class VadLiveSession {
  constructor({ transcribeWindow, language = 'auto', translate = false, signal, onUpdate = () => {}, onStatus = () => {}, latencyMode = 'balanced', clock = () => performance.now() }) {
    this.language = language; this.detectedLanguage = language; this.translate = translate; this.signal = signal;
    this.transcribeWindow = transcribeWindow;
    this.onUpdate = onUpdate; this.onStatus = onStatus;
    if (!['fast', 'balanced'].includes(latencyMode)) throw new Error('Invalid latency mode.');
    this.latencyMode = latencyMode; this.clock = clock; this.latency = new LatencyTracker();
    this.vadHoldbackMs = latencyMode === 'fast' ? 260 : 550;
    this.segments = []; this.queue = Promise.resolve(); this.stopped = false;
    this.failed = null; this.durationMs = 0; this.pendingJobs = 0;
    this.detector = new SpeechSegmenter({
      onSegment: segment => this._submit(segment),
      onState: status => this.onStatus(status),
      minSilenceMs: this.vadHoldbackMs,
      maxSpeechMs: latencyMode === 'fast' ? 7500 : 11000
    });
  }
  append(bytes) {
    if (this.stopped || this.failed) throw this.failed || new Error('Session already stopped.');
    this.detector.append(bytes);
    this.durationMs = Math.round(this.detector.totalSamples / 16);
  }
  _submit({ pcm, startMs, endMs }) {
    const queuedAt = this.clock();
    this.pendingJobs++;
    this.onStatus({ type: 'transcribing', throughMs: endMs, backlog: this.pendingJobs });
    // Queue is limited to 3 utterances; fail fast rather than accumulating unbounded RAM.
    if (this.pendingJobs > 3) { this.failed = new Error('The model is falling behind. Choose a faster model.'); this.onStatus({ type: 'error', message: this.failed.message }); this.pendingJobs--; return; }
    this.queue = this.queue.then(async () => {
      if (this.failed || this.signal?.aborted) throw this.failed || new Error('Transcription cancelled.');
      const inferenceAt = this.clock();
      const output = await this.transcribeWindow(pcm, { language: this.language, translate: this.translate, signal: this.signal });
      if (this.failed || this.signal?.aborted) throw this.failed || new Error('Transcription cancelled.');
      const completedAt = this.clock();
      if (output.language && output.language !== 'auto' && output.language !== 'unknown') this.detectedLanguage = output.language;
      const segments = output.segments?.length ? output.segments : (output.text ? [{ startMs: 0, endMs: endMs - startMs, text: output.text }] : []);
      for (const s of segments) {
        const item = { startMs: startMs + s.startMs, endMs: Math.min(endMs, startMs + s.endMs), text: s.text.trim() };
        if (!item.text) continue;
        const previous = this.segments.at(-1);
        if (previous && item.endMs <= previous.endMs) continue;
        item.startMs = Math.max(item.startMs, previous?.endMs || 0);
        if (item.endMs <= item.startMs) continue;
        this.segments.push(item);
      }
      const stats = this.latency.record({
        queueMs: inferenceAt - queuedAt, inferenceMs: completedAt - inferenceAt,
        postVadMs: completedAt - queuedAt, vadHoldbackMs: this.vadHoldbackMs
      });
      this.onUpdate(this.snapshot());
      this.onStatus({ type: 'latency', measurement: stats.samples.at(-1), stats, definition: 'post-VAD queue and inference only' });
    }).catch(error => { this.failed = error; this.onStatus({ type: 'error', message: error.message }); })
      .finally(() => { this.pendingJobs--; });
  }
  snapshot() {
    const text = this.segments.reduce((output, s) => appendText(output, s.text, this.detectedLanguage), '');
    return { text, segments: this.segments.map(s => ({ ...s })), language: this.detectedLanguage, durationMs: this.durationMs, translatedToEnglish: this.translate, latency: this.latency.snapshot(), isLive: !this.stopped };
  }
  async stop() {
    if (this.stopped) return this.snapshot();
    this.stopped = true;
    this.detector.finish();
    await this.queue;
    if (this.failed) throw this.failed;
    if (this.signal?.aborted) throw new Error('Transcription cancelled.');
    const result = this.snapshot();
    this.onUpdate(result);
    return result;
  }
  cancel() { this.stopped = true; this.failed ||= new Error('Cancelled.'); }
}
module.exports = { VadLiveSession };
