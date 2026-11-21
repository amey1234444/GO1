'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { analysePractice, tokenize } = require('../src/practice/feedback');
test('no fabricated results on empty transcript', () => {
  const x = analysePractice({ text: '', durationMs: 10_000 });
  assert.equal(x.ready, false);
  assert.equal(x.wordsPerMinute, null);
});
test('practice review counts spoken words, time and possible English fillers', () => {
  const x = analysePractice({ text: 'Um I designed a queue and uh tested concurrency.', durationMs: 15_000 });
  assert.equal(x.ready, true);
  assert.equal(x.fillerCount, 2);
  assert.equal(x.wordsPerMinute, Math.round(x.wordCount / .25));
});
test('tokenizer recognizes Indian language Unicode words', () => {
  assert.ok(tokenize('नमस्कार माझे नाव अमेय आहे').length >= 4);
  const x = analysePractice({ text: 'मी म्हणजे चाचणी केली', durationMs: 10_000 });
  assert.equal(x.fillerCount, 1);
});
