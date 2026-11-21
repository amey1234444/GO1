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
