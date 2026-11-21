'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { cancelPrivateProcessing } = require('../src/privacy/presentation');

test('presentation pause aborts transcription and active live capture', () => {
  const batch = new AbortController();
  const live = new AbortController();
  let calls = 0;
  const result = cancelPrivateProcessing({
    activeController: batch,
    liveController: live,
    liveSession: { cancel() { calls++; } }
  });
  assert.deepEqual(result, { batch: true, live: true });
  assert.equal(batch.signal.aborted, true);
  assert.equal(live.signal.aborted, true);
  assert.equal(calls, 1);
});

test('presentation pause is safe without active work', () => {
  assert.deepEqual(cancelPrivateProcessing({}), { batch: false, live: false });
});

test('presentation pause does not start a new capture', () => {
  let startCalls = 0;
  const result = cancelPrivateProcessing({
    liveSession: { cancel() {} },
    activeController: { abort() {} }
  });
  assert.equal(startCalls, 0);
  assert.deepEqual(result, { batch: true, live: true });
});
