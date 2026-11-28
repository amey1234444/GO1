'use strict';
const { performance } = require('node:perf_hooks');
function normalizePcm16(frame) {
  let bytes;
  if (frame instanceof Int16Array) bytes = new Uint8Array(frame.buffer, frame.byteOffset, frame.byteLength);
  else if (frame instanceof Uint8Array) bytes = frame;
  else if (frame instanceof ArrayBuffer) bytes = new Uint8Array(frame);
  else throw new Error('Live capture requires PCM16 samples or bytes.');
  if (!bytes.byteLength || (bytes.byteLength % 2) !== 0 || bytes.byteLength > 256 * 1024) {
    throw new Error('Live capture frame must contain 1–131,072 PCM16 samples.');
  }
  return bytes;
}
// Arrival-gap metrics observe possible stalls, not proven packet loss.
class CaptureDiagnostics {
  constructor({ source = 'microphone', clock = () => performance.now() } = {}) {
    if (!['microphone', 'system', 'both'].includes(source)) throw new Error('Invalid audio source.');
    this.source = source; this.clock = clock;
    this.frames = 0; this.samples = 0; this.clipped = 0;
    this.lastArrival = null; this.lastFrameMs = 0;
    this.longArrivalGaps = 0; this.maxArrivalGapMs = 0;
    this.peak = 0; this.rms = 0; this.lastPublishedAt = null;
  }
  ingest(frame) {
    const bytes = normalizePcm16(frame);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let sumSq = 0, peak = 0, clipped = 0;
    const sampleCount = bytes.byteLength / 2;
    for (let i = 0; i < sampleCount; i++) {
      const value = view.getInt16(i * 2, true);
      const amplitude = Math.abs(value / 32768);
      sumSq += amplitude * amplitude;
      peak = Math.max(peak, amplitude);
      if (value <= -32760 || value >= 32759) clipped++;
    }
    const arrival = this.clock();
    const frameMs = sampleCount / 16;
    if (this.lastArrival !== null) {
      const gap = Math.max(0, arrival - this.lastArrival);
      this.maxArrivalGapMs = Math.max(gap, this.maxArrivalGapMs);
      if (gap > Math.max(1500, this.lastFrameMs * 2 + 500)) this.longArrivalGaps++;
    }
    this.frames++; this.samples += sampleCount; this.clipped += clipped;
    this.peak = peak; this.rms = Math.sqrt(sumSq / sampleCount);
    this.lastArrival = arrival; this.lastFrameMs = frameMs;
    return bytes;
  }
  snapshot() {
    return {
      source: this.source, sampleRate: 16000, frames: this.frames,
      audioDurationMs: Math.round(this.samples / 16),
      rms: Number(this.rms.toFixed(4)), peak: Number(this.peak.toFixed(4)),
      clippedPercent: this.samples ? Number((this.clipped * 100 / this.samples).toFixed(2)) : 0,
      longArrivalGaps: this.longArrivalGaps,
      maxArrivalGapMs: Math.round(this.maxArrivalGapMs),
      note: 'Arrival gaps indicate possible IPC or scheduler stalls, not confirmed audio loss.'
    };
  }
  shouldPublish(intervalMs = 500) {
    const now = this.clock();
    if (this.lastPublishedAt !== null && now - this.lastPublishedAt < intervalMs) return false;
    this.lastPublishedAt = now; return true;
  }
}
module.exports = { normalizePcm16, CaptureDiagnostics };
