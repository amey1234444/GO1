'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizePcm16, CaptureDiagnostics } = require('../src/audio/diagnostics');
test('worklet Int16Array samples convert to byte view without losing sample values', () => {
  const samples = new Int16Array([-32768, -1234, 0, 1234, 32767]);
  const bytes = normalizePcm16(samples);
  assert.equal(bytes.length, samples.byteLength);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  assert.deepEqual(samples.map((_, i) => view.getInt16(i * 2, true)), samples);
});
test('PCM16 Uint8Array frame is preserved for existing VAD', () => {
  const original = new Uint8Array([0, 128, 0, 0, 255, 127]);
  assert.equal(normalizePcm16(original), original);
});
test('invalid PCM16 frame shapes are rejected', () => {
  for (const bad of [null, undefined, 'hello', new Float32Array(4), new Uint8Array(0), new Uint8Array(3), new Uint8Array(256 * 1024 + 2)])
    assert.throws(() => normalizePcm16(bad), /PCM16|frame/);
});
test('sample counts and signal levels reflect captured samples', () => {
  const stats = new CaptureDiagnostics({ source: 'system', clock: () => 1000 });
  const bytes = stats.ingest(new Int16Array([-32768, 0, 32767, 0]));
  assert.ok(bytes instanceof Uint8Array);
  assert.deepEqual({...stats.snapshot(), note: undefined}, {
    source: 'system', sampleRate: 16000, frames: 1, audioDurationMs: 0,
    rms: 0.7071, peak: 1, clippedPercent: 50, longArrivalGaps: 0, maxArrivalGapMs: 0, note: undefined
  });
});
test('ordinary 500 ms frame spacing does not report arrival gaps', () => {
  let t = 1000;
  const stats = new CaptureDiagnostics({ clock: () => t });
  const frame = new Int16Array(8000);
  stats.ingest(frame); t += 500; stats.ingest(frame);
  assert.equal(stats.snapshot().longArrivalGaps, 0);
  assert.equal(stats.snapshot().audioDurationMs, 1000);
});
test('sustained IPC stall is observed but never called proven sample loss', () => {
  let t = 0; const stats = new CaptureDiagnostics({ clock: () => t });
  stats.ingest(new Int16Array(8000)); t = 2400; stats.ingest(new Int16Array(8000));
  assert.equal(stats.snapshot().longArrivalGaps, 1);
  assert.equal(stats.snapshot().maxArrivalGapMs, 2400);
  assert.match(stats.snapshot().note, /not confirmed audio loss/);
});
test('health publication is throttled by the monotonic injected clock', () => {
  let t = 0; const stats = new CaptureDiagnostics({ clock: () => t });
  assert.equal(stats.shouldPublish(), true);
  t = 490; assert.equal(stats.shouldPublish(), false);
  t = 500; assert.equal(stats.shouldPublish(), true);
});
test('source validation rejects unexpected labels', () => {
  assert.throws(() => new CaptureDiagnostics({ source: 'secret' }), /Invalid audio source/);
});
