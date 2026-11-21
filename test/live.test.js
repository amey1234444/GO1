'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { LiveSession, appendText } = require('../src/transcription/live');
const { wavFromPCM16 } = require('../src/transcription/engine');

const silence = seconds => new Uint8Array(seconds * 16000 * 2);

const later = () => new Promise(resolve => setImmediate(resolve));

test('PCM conversion creates valid 16k mono WAV header', () => {
  const data = wavFromPCM16(new Uint8Array([0, 0, 255, 127]));
  assert.equal(data.toString('ascii', 0, 4), 'RIFF');
  assert.equal(data.toString('ascii', 8, 12), 'WAVE');
  assert.equal(data.readUInt32LE(24), 16000);
  assert.equal(data.readUInt16LE(22), 1);
  assert.equal(data.readUInt16LE(34), 16);
  assert.equal(data.readUInt32LE(40), 4);
});

test('overlap merging handles Latin and CJK without false spaces', () => {
  assert.equal(appendText('Hello', 'lo world', 'en'), 'Hello world');
  assert.equal(appendText('こんにちは', 'ちは世界', 'ja'), 'こんにちは世界');
  assert.equal(appendText('', 'नमस्ते', 'hi'), 'नमस्ते');
});

test('live window batching avoids repeated segments and shifts timestamps', async () => {
  const calls = [];
  const updates = [];
  const session = new LiveSession({
    transcribeWindow: async (pcm, { language }) => {
      calls.push({ size: pcm.length, language });
      return calls.length === 1 ? {
        language: 'hi', segments: [
          { startMs: 0, endMs: 2000, text: 'नमस्ते' },
          { startMs: 3000, endMs: 5950, text: ' दुनिया' }
        ]
      } : {
        language: 'hi', segments: [
          { startMs: 0, endMs: 1450, text: ' दुनिया' },
          { startMs: 2000, endMs: 3500, text: ' स्वागत' }
        ]
      };
    },
    onUpdate: result => updates.push(result),
    language: 'auto'
  });
  session.append(silence(6));
  await later();
  assert.equal(calls.length, 1);
  assert.equal(updates.at(-1).language, 'hi');
  session.append(silence(4));
  const final = await session.stop();
  assert.equal(calls.length, 2);
  assert.equal(calls[1].size, 5.5 * 16000 * 2);
  assert.equal(final.durationMs, 10000);
  assert.equal(final.isLive, false);
  assert.match(final.text, /नमस्ते/);
  assert.ok(final.segments.every(s => s.startMs >= 0 && s.endMs <= 10000));
  assert.ok(final.segments.some(s => s.startMs >= 4500));
});

test('flushes short recording with no full window', async () => {
  let count = 0;
  const s = new LiveSession({ transcribeWindow: async pcm => {
    count++;
    assert.equal(pcm.length, 16000 * 2);
    return { language: 'mr', segments: [{ startMs: 0, endMs: 500, text: 'नमस्कार' }] };
  } });
  s.append(silence(1));
  const result = await s.stop();
  assert.equal(count, 1);
  assert.equal(result.text, 'नमस्कार');
});

test('rejects invalid frames and propagates transcription errors', async () => {
  const s = new LiveSession({ transcribeWindow: async () => { throw new Error('mock model unavailable'); } });
  assert.throws(() => s.append(new Uint8Array([1])), /PCM/);
  s.append(silence(6));
  await assert.rejects(s.stop(), /mock model unavailable/);
});

test('stop is idempotent after successful finalization', async () => {
  const s = new LiveSession({ transcribeWindow: async () => ({ language: 'en', segments: [] }) });
  s.append(silence(1));
  const a = await s.stop();
  const b = await s.stop();
  assert.deepEqual(a, b);
});
