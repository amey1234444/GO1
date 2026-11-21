'use strict';
// Frame-level adaptive-energy VAD with hangover and preroll. Unlike Silero this is
// an inexpensive acoustic gate; it can miss whispering and confuse loud noises.
const SAMPLE_RATE = 16000;
const FRAME_SAMPLES = 320; // 20ms
const MAX_SAMPLES = SAMPLE_RATE * 30 * 60;
function rmsPcm16(bytes) {
  const buf = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (buf.length % 2 !== 0) throw new Error('Expected PCM16');
  let power = 0;
  for (let i = 0; i < buf.length; i += 2) { const s = buf.readInt16LE(i) / 32768; power += s * s; }
  return Math.sqrt(power / Math.max(1, buf.length / 2));
}
class SpeechSegmenter {
  constructor({ onSegment = () => {}, onState = () => {}, floor = 0.008, minSpeechMs = 180, minSilenceMs = 550, maxSpeechMs = 11000, preRollMs = 250 } = {}) {
    this.onSegment = onSegment; this.onState = onState;
    this.floor = floor;
    this.minSpeechSamples = Math.round(minSpeechMs * SAMPLE_RATE / 1000);
    this.silenceSamples = Math.round(minSilenceMs * SAMPLE_RATE / 1000);
    this.maxSamples = Math.round(maxSpeechMs * SAMPLE_RATE / 1000);
    this.preRollSamples = Math.round(preRollMs * SAMPLE_RATE / 1000);
    this.totalSamples = 0;
    this.pending = Buffer.alloc(0);
    this.preroll = Buffer.alloc(0);
    this.current = [];
    this.currentStart = 0;
    this.active = false;
    this.voiceSamples = 0;
    this.silentSamples = 0;
    this.noiseFloor = 0.001;
    this.closed = false;
  }
  append(bytes) {
    if (this.closed) throw new Error('VAD has stopped.');
    if (!(bytes instanceof Uint8Array) || bytes.length % 2 || !bytes.length || bytes.length > 256 * 1024) throw new Error('Invalid PCM frame.');
    this.pending = Buffer.concat([this.pending, Buffer.from(bytes)]);
    const frameBytes = FRAME_SAMPLES * 2;
    while (this.pending.length >= frameBytes) {
      const frame = Buffer.from(this.pending.subarray(0, frameBytes));
      this.pending = this.pending.subarray(frameBytes);
      this._frame(frame);
    }
  }
  _frame(frame) {
    if (this.totalSamples + frame.length / 2 > MAX_SAMPLES) throw new Error('30-minute recording limit reached.');
    const start = this.totalSamples;
    const count = frame.length / 2;
    this.totalSamples += count;
    const rms = rmsPcm16(frame);
    const voice = rms >= Math.max(this.floor, Math.min(0.06, this.noiseFloor * 3.5));
    if (!voice) this.noiseFloor = this.noiseFloor * 0.98 + rms * 0.02;
    if (!this.active && voice) {
      this.active = true;
      this.currentStart = start - this.preroll.length / 2;
      this.current = [Buffer.from(this.preroll)];
      this.voiceSamples = 0;
      this.silentSamples = 0;
      this.onState({ type: 'speech-start', atMs: Math.round(start / 16) });
    }
    if (this.active) {
      this.current.push(frame);
      if (voice) { this.voiceSamples += count; this.silentSamples = 0; }
      else this.silentSamples += count;
      if (this.silentSamples >= this.silenceSamples || this.totalSamples - this.currentStart >= this.maxSamples) this._emit();
    } else {
      this.preroll = Buffer.concat([this.preroll, frame]).subarray(-this.preRollSamples * 2);
    }
  }
  _emit() {
    if (!this.active) return;
    const pcm = Buffer.concat(this.current);
    const startMs = Math.round(this.currentStart / 16);
    this.active = false;
    this.preroll = pcm.subarray(-this.preRollSamples * 2);
    this.current = [];
    if (this.voiceSamples >= this.minSpeechSamples) this.onSegment({ pcm, startMs, endMs: Math.round(this.totalSamples / 16) });
    this.voiceSamples = 0;
    this.silentSamples = 0;
    this.onState({ type: 'speech-end', atMs: Math.round(this.totalSamples / 16) });
  }
  finish() {
    if (this.closed) return;
    if (this.pending.length > 0) {
      const b = Buffer.alloc(FRAME_SAMPLES * 2);
      this.pending.copy(b);
      this.pending = Buffer.alloc(0);
      this._frame(b);
    }
    this._emit();
    this.closed = true;
  }
}
module.exports = { SpeechSegmenter, rmsPcm16, SAMPLE_RATE };
