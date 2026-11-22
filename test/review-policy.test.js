'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { prepareReview, reviewAllowed } = require('../src/practice/review-policy');
test('allows completed local practice review', () => {
  const r = prepareReview({ text: 'A practice answer', language: 'en', durationMs: 5000, segments: [{ startMs: 0, endMs: 5000, text: 'A practice answer' }] });
  assert.equal(r.language, 'en'); assert.equal(r.segments[0].text, 'A practice answer');
});
test('rejects uncompleted or empty results', () => {
  assert.throws(() => prepareReview({ text: 'Live words', isLive: true }), /Finish practice/);
  assert.throws(() => prepareReview({ text: '  ' }), /No completed/);
});
test('rejects malformed timestamps and excessive payload', () => {
  assert.throws(() => prepareReview({ text: 'hello', segments: [{ text: 'a', startMs: -1, endMs: 2 }] }), /timestamps/);
  assert.throws(() => prepareReview({ text: 'x'.repeat(200001) }), /length/);
});
test('blocks review while privacy, inference or live recording is active', () => {
  assert.equal(reviewAllowed({}), true);
  assert.equal(reviewAllowed({ paused: true }), false);
  assert.equal(reviewAllowed({ activeTranscription: true }), false);
  assert.equal(reviewAllowed({ liveSession: true }), false);
});
