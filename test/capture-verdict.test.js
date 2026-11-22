'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { captureVerdict } = require('../src/privacy/capture-verdict');
function capture(magenta = 5000, cyan = 20000, frames = 5) {
  return { status: 'captured', markerOnScreen: true, screenshot: { magenta, cyan }, stream: {
    streamInitial: { maxMagenta: magenta, minCyan: cyan, frames },
    streamRefreshed: { maxMagenta: magenta, minCyan: cyan, frames }
  } };
}
test('a blank image or missing control cannot be called capture exclusion', () => {
  assert.equal(captureVerdict(capture(0, 0), capture(0, 0)).result, 'inconclusive');
  assert.equal(captureVerdict(undefined, capture(0)).result, 'inconclusive');
  assert.equal(captureVerdict(capture(), capture(0, 20000, 0)).result, 'inconclusive');
});
test('visible private markers in any tested capture phase fail exclusion', () => {
  const result = capture(0); result.stream.streamRefreshed.maxMagenta = 5000;
  assert.equal(captureVerdict(capture(), result).result, 'exposed');
});
test('absent markers with valid background/control are scoped to tested paths, never receiver certification', () => {
  const result = captureVerdict(capture(), capture(0));
  assert.equal(result.result, 'excluded-in-tested-paths'); assert.equal(result.receiverVerified, false);
});
test('missing capture permission is blocked rather than successful', () => {
  assert.equal(captureVerdict({ status: 'blocked' }, capture(0)).result, 'blocked');
});

test('an offscreen/hidden marker cannot produce a false exclusion result', () => {
  const result = capture(0); result.markerOnScreen = false;
  assert.equal(captureVerdict(capture(), result).result, 'inconclusive');
});
