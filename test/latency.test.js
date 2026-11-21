'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { LatencyTracker, percentile } = require('../src/transcription/latency');
const { VadLiveSession } = require('../src/transcription/vad-live');
function samples(seconds, amplitude = 0) {
  const b = Buffer.alloc(Math.round(seconds * 16000) * 2);
  for (let i = 0; i < b.length / 2; i++) b.writeInt16LE(Math.round(amplitude * 32767 * Math.sin(i * 0.1)), i * 2);
  return b;
}
test('percentiles are empirical and reject fake initial values', () => {
  assert.equal(percentile([], .5), null);
  assert.equal(percentile([410, 120, 390, 240], .5), 240);
  assert.equal(percentile([410, 120, 390, 240], .95), 410);
});
test('latency meter caps its samples and reports p50/p95', () => {
  const t = new LatencyTracker(3);
  for (const postVadMs of [10, 20, 30, 40]) t.record({ queueMs: 0, inferenceMs: postVadMs, postVadMs, vadHoldbackMs: 260 });
  const s = t.snapshot();
  assert.equal(s.count, 3);
  assert.deepEqual(s.samples.map(x => x.postVadMs), [20, 30, 40]);
  assert.equal(s.postVad.p50Ms, 30);
  assert.equal(s.postVad.p95Ms, 40);
  t.reset();
  assert.equal(t.snapshot().postVad.p50Ms, null);
});
test('VAD fast mode measures actual queue plus inference and emits status', async () => {
  const updates = [], statuses = [];
  let elapsed = 1000;
  const session = new VadLiveSession({
    latencyMode: 'fast', clock: () => elapsed,
    onStatus: s => statuses.push(s), onUpdate: s => updates.push(s),
    transcribeWindow: async () => {
      elapsed += 73;
      return { language: 'en', segments: [{ startMs: 80, endMs: 500, text: 'I built a reliable system.' }] };
    }
  });
  session.append(samples(.4));
  session.append(samples(.8, .45));
  session.append(samples(.3));
  const result = await session.stop();
  assert.match(result.text, /reliable system/);
  assert.equal(result.latency.count, 1);
  assert.equal(result.latency.postVad.p50Ms, 73);
  assert.equal(result.latency.samples[0].vadHoldbackMs, 260);
  assert.ok(statuses.some(s => s.type === 'latency'));
  assert.ok(updates.length > 0);
});
test('fast mode recognizes shorter pauses than balanced mode', async () => {
  const make = async mode => {
    let count = 0;
    const session = new VadLiveSession({ latencyMode: mode, transcribeWindow: async () => { count++; return { segments: [] }; } });
    session.append(samples(.5));
    session.append(samples(.7, .4));
    session.append(samples(.30));
    await new Promise(resolve => setImmediate(resolve));
    const beforeStop = count;
    await session.stop();
    return beforeStop;
  };
  assert.equal(await make('fast'), 1);
  assert.equal(await make('balanced'), 0);
});
test('latency tracker rejects negative values', () => {
  const t = new LatencyTracker();
  assert.throws(() => t.record({queueMs: -1, inferenceMs: 10, postVadMs: 10, vadHoldbackMs: 260}));
});
