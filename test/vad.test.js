'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { SpeechSegmenter, rmsPcm16 } = require('../src/transcription/vad');
const { VadLiveSession } = require('../src/transcription/vad-live');
function samples(seconds, amplitude = 0) {
  const b = Buffer.alloc(Math.round(seconds * 16000) * 2);
  for (let i = 0; i < b.length / 2; i++) b.writeInt16LE(Math.round(amplitude * 32767 * Math.sin(i * 0.1)), i * 2);
  return b;
}
test('PCM RMS tracks energy without NaN', () => {
  assert.equal(rmsPcm16(samples(0.02)), 0);
  assert.ok(rmsPcm16(samples(0.02, 0.8)) > 0.4);
});
test('speech gate ignores long silence and emits one timestamped utterance', () => {
  const utterances = [];
  const detector = new SpeechSegmenter({ onSegment: x => utterances.push(x) });
  detector.append(samples(0.6));
  detector.append(samples(1.0, 0.4));
  detector.append(samples(0.8));
  detector.finish();
  assert.equal(utterances.length, 1);
  assert.ok(utterances[0].startMs >= 350 && utterances[0].startMs < 650);
  assert.ok(utterances[0].endMs > 1500);
});
test('speech gate ignores clicks shorter than its minimum speech duration', () => {
  const utterances = [];
  const detector = new SpeechSegmenter({ onSegment: x => utterances.push(x) });
  detector.append(samples(0.04, 0.8));
  detector.append(samples(1));
  detector.finish();
  assert.equal(utterances.length, 0);
});
test('VadLiveSession sends only voiced audio, retains original language, and flushes on stop', async () => {
  const calls = [];
  const session = new VadLiveSession({
    language: 'auto',
    transcribeWindow: async (pcm, opts) => {
      calls.push({ len: pcm.length, language: opts.language });
      return { language: 'mr', text: 'नमस्कार', segments: [{ startMs: 100, endMs: 400, text: 'नमस्कार' }] };
    }
  });
  session.append(samples(0.7));
  session.append(samples(0.9, 0.5));
  session.append(samples(0.9));
  const result = await session.stop();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].language, 'auto');
  assert.equal(result.language, 'mr');
  assert.match(result.text, /नमस्कार/);
  assert.equal(result.isLive, false);
  assert.equal(result.durationMs, 2500);
});
test('VadLiveSession sends no model request for silence', async () => {
  let invoked = 0;
  const session = new VadLiveSession({ transcribeWindow: async () => { invoked++; return { segments: [] }; } });
  session.append(samples(1.2));
  const result = await session.stop();
  assert.equal(invoked, 0);
  assert.deepEqual(result.segments, []);
});

test('a cancelled VAD session discards inference that ignores abort', async () => {
  let release, started;
  const ready = new Promise(resolve => { started = resolve; });
  const pending = new Promise(resolve => { release = resolve; });
  const updates = [];
  const session = new VadLiveSession({
    transcribeWindow: async () => { started(); await pending; return { text: 'Obsolete text', language: 'en' }; },
    onUpdate: result => updates.push(result)
  });
  session.append(samples(.5, .5)); session.append(samples(.8));
  await ready;
  session.cancel(); release(); await session.queue;
  assert.equal(updates.length, 0);
  assert.equal(session.snapshot().text, '');
});

test('a quiet live session stays open and accepts speech after a minute without inference', async () => {
  let calls = 0;
  const session = new VadLiveSession({ transcribeWindow: async () => { calls++; return { text: 'Still here', language: 'en' }; } });
  for (let i = 0; i < 60; i++) session.append(samples(1));
  assert.equal(calls, 0); assert.equal(session.snapshot().isLive, true);
  session.append(samples(.6, .4)); session.append(samples(.8)); await session.queue;
  assert.equal(calls, 1); assert.match(session.snapshot().text, /Still here/);
  await session.stop();
});
test('failed recognition preserves the session and earlier transcript, then accepts the next utterance', async () => {
  let calls = 0; const statuses = [];
  const session = new VadLiveSession({ onStatus: s => statuses.push(s), transcribeWindow: async () => {
    calls++; if (calls === 2) throw new TypeError('fetch failed');
    return { text: calls === 1 ? 'Before' : 'After', language: 'en' };
  } });
  for (let i = 0; i < 3; i++) { session.append(samples(.6,.5)); session.append(samples(.8)); await session.queue; }
  assert.equal(session.snapshot().isLive, true); assert.match(session.snapshot().text, /Before.*After/);
  assert.equal(session.snapshot().gaps.length, 1); assert.ok(session.snapshot().droppedAudioMs > 0);
  assert.ok(statuses.some(s => s.type === 'warning' && s.recoverable));
  assert.ok(!statuses.some(s => s.type === 'error'));
  await session.stop();
});
test('backpressure keeps bounded queued audio without permanently failing the session', async () => {
  let release; const blocked = new Promise(resolve => { release = resolve; });
  const session = new VadLiveSession({ transcribeWindow: async () => { await blocked; return { text: 'Kept', language:'en' }; } });
  for (let i=0;i<5;i++) { session.append(samples(.4,.5)); session.append(samples(.8)); }
  assert.equal(session.pendingJobs,3); assert.equal(session.gaps.length,2); assert.equal(session.failed,null);
  release(); await session.queue;
  session.append(samples(.4,.5)); session.append(samples(.8)); await session.queue;
  assert.equal(session.pendingJobs,0); assert.equal(session.snapshot().isLive,true);
  await session.stop();
});
test('quiet sensitivity admits a soft voiced fixture that balanced rejects', async () => {
  const calls = {};
  for (const sensitivity of ['balanced','quiet']) {
    calls[sensitivity]=0;
    const session = new VadLiveSession({ sensitivity, transcribeWindow:async()=>{calls[sensitivity]++;return {text:'Soft',language:'en'};} });
    session.append(samples(.8,.007)); session.append(samples(.8)); await session.stop();
  }
  assert.equal(calls.balanced,0); assert.equal(calls.quiet,1);
});
