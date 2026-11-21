'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeWhisperJson, formatTimestamp, exportTranscript } = require('../src/transcription/formats');
const { validatePayload, MAX_BYTES, resolveExecutable } = require('../src/transcription/engine');

test('parses multilingual whisper.cpp JSON without destroying original script', () => {
  const raw = {
    params: { language: 'auto' }, result: { language: 'hi' },
    transcription: [
      { offsets: { from: 0, to: 1520 }, text: ' नमस्ते' },
      { offsets: { from: 1520, to: 2530 }, text: ' दुनिया' }
    ]
  };
  const result = normalizeWhisperJson(raw);
  assert.equal(result.language, 'hi');
  assert.equal(result.text, 'नमस्ते दुनिया');
  assert.equal(result.durationMs, 2530);
  assert.deepEqual(result.segments[0], { startMs: 0, endMs: 1520, text: 'नमस्ते' });
});

test('does not insert spaces into CJK transcription', () => {
  const result = normalizeWhisperJson({ result: { language: 'ja' }, transcription: [{ offsets: { from: 0, to: 1000 }, text: 'こんにちは' }, { offsets: { from: 1000, to: 2000 }, text: '世界' }] });
  assert.equal(result.text, 'こんにちは世界');
});

test('exports accurate SRT, WebVTT, TXT and JSON', () => {
  const result = { text: 'Hello world', language: 'en', segments: [{ startMs: 1001, endMs: 64012, text: 'Hello world' }] };
  assert.match(exportTranscript(result, 'srt'), /00:00:01,001 --> 00:01:04,012/);
  assert.match(exportTranscript(result, 'vtt'), /WEBVTT\n\n00:00:01\.001 --> 00:01:04\.012/);
  assert.equal(exportTranscript(result, 'txt'), 'Hello world');
  assert.equal(JSON.parse(exportTranscript(result, 'json')).language, 'en');
});

test('rejects invalid timestamp and unsupported exports', () => {
  assert.throws(() => formatTimestamp(-1));
  assert.throws(() => normalizeWhisperJson({ transcription: [{}] }));
  assert.throws(() => exportTranscript({ segments: [] }, 'pdf'));
});

test('validates empty, oversized audio, language and translation', () => {
  assert.throws(() => validatePayload({ bytes: new Uint8Array() }));
  assert.throws(() => validatePayload({ bytes: new Uint8Array(MAX_BYTES + 1) }));
  assert.throws(() => validatePayload({ bytes: [1], language: '&&' }));
  const item = validatePayload({ bytes: [1, 2, 3], language: 'MR', translate: true });
  assert.equal(item.language, 'mr');
  assert.equal(item.translate, true);
  assert.equal(item.bytes.length, 3);
});

test('finds the current Node executable through an explicit path', () => {
  assert.equal(resolveExecutable('node', process.execPath), process.execPath);
});
