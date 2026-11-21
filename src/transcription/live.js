'use strict';

const SAMPLE_RATE = 16000;
const BYTES_PER_SAMPLE = 2;
const WINDOW_SAMPLES = 6 * SAMPLE_RATE;
const OVERLAP_SAMPLES = Math.round(1.5 * SAMPLE_RATE);
const HOLDBACK_MS = 650;
const MAX_SECONDS = 30 * 60;

function appendText(existing, addition, language = '') {
  const right = String(addition || '').trim();
  if (!right) return String(existing || '');
  const left = String(existing || '');
  if (!left) return right;
  let duplicate = 0;
  const max = Math.min(120, left.length, right.length);
  for (let n = max; n >= 2; n--) {
    if (left.slice(-n).toLocaleLowerCase() === right.slice(0, n).toLocaleLowerCase()) {
      duplicate = n;
      break;
    }
  }
  const tail = right.slice(duplicate);
  if (!tail) return left;
  if (/^(zh|ja|ko)/.test(language)) return left + tail;
  return left.trimEnd() + (/^[.,!?;:]/.test(tail.trimStart()) ? '' : ' ') + tail.trimStart();
}

class LiveSession {
  constructor({ transcribeWindow, onUpdate = () => {}, onStatus = () => {}, language = 'auto', translate = false, signal, windowSamples = WINDOW_SAMPLES, overlapSamples = OVERLAP_SAMPLES }) {
    if (typeof transcribeWindow !== 'function') throw new Error('Transcriber is required.');
    if (!(windowSamples > overlapSamples && overlapSamples > 0)) throw new Error('Invalid live window sizes.');
    this.transcribeWindow = transcribeWindow;
    this.onUpdate = onUpdate;
    this.onStatus = onStatus;
    this.settings = { language, translate };
    this.signal = signal;
    this.windowSamples = windowSamples;
    this.overlapSamples = overlapSamples;
    this.buffer = Buffer.alloc(0);
    this.bufferStart = 0;
    this.totalSamples = 0;
    this.nextWindowStart = 0;
    this.lastWindowEnd = 0;
    this.finalSegments = [];
    this.provisional = [];
    this.detectedLanguage = language === 'auto' ? 'unknown' : language;
    this.running = false;
    this.stopping = false;
    this.closed = false;
    this.failure = null;
    this.waiters = [];
    this.abortHandler = () => this._fail(new Error('Live transcription cancelled.'));
    signal?.addEventListener('abort', this.abortHandler, { once: true });
  }
  append(bytes) {
    if (this.closed || this.stopping || this.failure) throw new Error('Live session is not accepting audio.');
    if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0 || bytes.byteLength % 2 !== 0 || bytes.byteLength > 256 * 1024) throw new Error('Invalid PCM audio frame.');
    const newSamples = bytes.byteLength / 2;
    if (this.totalSamples + newSamples > MAX_SECONDS * SAMPLE_RATE) throw new Error('Maximum live recording is 30 minutes.');
    this.buffer = Buffer.concat([this.buffer, Buffer.from(bytes)]);
    this.totalSamples += newSamples;
    this._run();
  }
  snapshot() {
    const committedText = this.finalSegments.reduce((s, item) => appendText(s, item.text, this.detectedLanguage), '');
    const partialText = this.provisional.reduce((s, item) => appendText(s, item.text, this.detectedLanguage), '');
    return {
      text: appendText(committedText, partialText, this.detectedLanguage),
      language: this.detectedLanguage,
      segments: this.finalSegments.map(s => ({ ...s })),
      provisional: this.provisional.map(s => ({ ...s })),
      durationMs: Math.round(this.totalSamples * 1000 / SAMPLE_RATE),
      translatedToEnglish: this.settings.translate,
      isLive: !this.closed
    };
  }
  async stop() {
    if (this.failure) throw this.failure;
    if (this.closed) return this.snapshot();
    this.stopping = true;
    return await new Promise((resolve, reject) => {
      this.waiters.push({ resolve, reject });
      this._run();
    });
  }
  cancel() {
    this._fail(new Error('Live transcription cancelled.'));
  }
  _fail(error) {
    if (this.failure || this.closed) return;
    this.failure = error;
    this.closed = true;
    this.signal?.removeEventListener('abort', this.abortHandler);
    this.waiters.splice(0).forEach(w => w.reject(error));
    this.onStatus({ type: 'error', message: error.message });
  }
  _finish() {
    this.provisional = [];
    this.closed = true;
    this.signal?.removeEventListener('abort', this.abortHandler);
    const final = this.snapshot();
    final.isLive = false;
    this.onUpdate(final);
    this.waiters.splice(0).forEach(w => w.resolve(final));
  }
  _prune() {
    const newStart = this.nextWindowStart;
    const dropped = Math.max(0, newStart - this.bufferStart);
    if (dropped) {
      this.buffer = this.buffer.subarray(dropped * BYTES_PER_SAMPLE);
      this.bufferStart = newStart;
    }
  }
  async _process(start, end, final) {
    if (this.failure || this.signal?.aborted) throw new Error('Live transcription cancelled.');
    const startIndex = (start - this.bufferStart) * BYTES_PER_SAMPLE;
    const endIndex = (end - this.bufferStart) * BYTES_PER_SAMPLE;
    if (startIndex < 0 || endIndex > this.buffer.length) throw new Error('Live audio buffer is incomplete.');
    const pcm = Buffer.from(this.buffer.subarray(startIndex, endIndex));
    this.onStatus({ type: 'transcribing', throughMs: Math.round(end * 1000 / SAMPLE_RATE), behindMs: Math.round((this.totalSamples - end) * 1000 / SAMPLE_RATE) });
    const recognized = await this.transcribeWindow(pcm, { ...this.settings, signal: this.signal });
    if (this.failure || this.signal?.aborted) throw new Error('Live transcription cancelled.');
    if (recognized.language && recognized.language !== 'unknown' && recognized.language !== 'auto') this.detectedLanguage = recognized.language;
    const startMs = Math.round(start * 1000 / SAMPLE_RATE);
    const endMs = Math.round(end * 1000 / SAMPLE_RATE);
    const absolute = (recognized.segments || []).map(s => ({ startMs: startMs + s.startMs, endMs: startMs + s.endMs, text: String(s.text || '').trim() }))
      .filter(s => s.text && s.endMs > s.startMs && s.startMs <= endMs + 250)
      .sort((a, b) => a.startMs - b.startMs);
    const committedUntil = this.finalSegments.at(-1)?.endMs || 0;
    const safeBoundary = final ? Number.POSITIVE_INFINITY : endMs - HOLDBACK_MS;
    this.provisional = [];
    for (const segment of absolute) {
      if (segment.endMs <= committedUntil + 100) continue;
      if (segment.endMs > safeBoundary) { this.provisional.push(segment); continue; }
      const previous = this.finalSegments.at(-1);
      if (previous && segment.endMs <= previous.endMs + 100) continue;
      const adjusted = { ...segment, startMs: Math.max(segment.startMs, previous?.endMs || 0) };
      if (adjusted.endMs <= adjusted.startMs) continue;
      if (previous) {
        const overlapText = previous.text;
        const max = Math.min(120, overlapText.length, adjusted.text.length);
        for (let n = max; n >= 2; n--) {
          if (overlapText.slice(-n).toLocaleLowerCase() === adjusted.text.slice(0, n).toLocaleLowerCase()) {
            adjusted.text = adjusted.text.slice(n).trim(); break;
          }
        }
      }
      if (adjusted.text) this.finalSegments.push(adjusted);
    }
    this.lastWindowEnd = end;
    this.onUpdate(this.snapshot());
  }
  _run() {
    if (this.running || this.failure || this.closed) return;
    this.running = true;
    (async () => {
      try {
        while (!this.failure && this.totalSamples - this.nextWindowStart >= this.windowSamples) {
          const end = this.nextWindowStart + this.windowSamples;
          await this._process(this.nextWindowStart, end, false);
          this.nextWindowStart = end - this.overlapSamples;
          this._prune();
        }
        if (this.stopping && !this.failure) {
          if (this.totalSamples > this.lastWindowEnd) {
            await this._process(this.nextWindowStart, this.totalSamples, true);
          } else {
            this.finalSegments.push(...this.provisional.filter(s => s.endMs > (this.finalSegments.at(-1)?.endMs || 0) + 100));
          }
          this._finish();
        }
      } catch (error) { this._fail(error); }
      finally { this.running = false; }
    })();
  }
}

module.exports = { LiveSession, SAMPLE_RATE, WINDOW_SAMPLES, OVERLAP_SAMPLES, appendText };
