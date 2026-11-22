'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { PrivacyGate } = require('../src/privacy/gate');
const { registerEmergencyPrivacy, PRIVACY_SHORTCUT } = require('../src/privacy/shortcut');

test('privacy gate blocks recording and transcription while enabled', () => {
  const gate = new PrivacyGate();
  const ticket = gate.ticket();
  assert.equal(ticket, 0);
  gate.enter();
  assert.equal(gate.snapshot().paused, true);
  assert.throws(() => gate.ticket(), /Presentation privacy/);
  assert.throws(() => gate.assertAllowed(), /Presentation privacy/);
});

test('old microphone or model-loading requests cannot resume after privacy ends', () => {
  const gate = new PrivacyGate();
  const pendingPermission = gate.ticket();
  gate.enter();
  gate.exit();
  assert.equal(gate.snapshot().paused, false);
  assert.throws(() => gate.validate(pendingPermission), /invalidated/);
  const freshPermission = gate.ticket();
  assert.doesNotThrow(() => gate.validate(freshPermission));
});

test('repeated activation keeps the main-process gate paused', () => {
  const gate = new PrivacyGate();
  gate.enter(); gate.enter(); gate.enter();
  assert.equal(gate.snapshot().paused, true);
  assert.throws(() => gate.ticket());
  gate.exit();
  assert.equal(gate.snapshot().paused, false);
});

test('emergency shortcut only enters privacy; never resumes capture', () => {
  const seen = [];
  let receiver;
  const registered = registerEmergencyPrivacy({
    register(accelerator, handler) { seen.push(accelerator); receiver = handler; return true; }
  }, source => seen.push(source));
  assert.equal(registered, true);
  assert.equal(seen[0], PRIVACY_SHORTCUT);
  receiver(); receiver();
  assert.deepEqual(seen, [PRIVACY_SHORTCUT, 'hotkey', 'hotkey']);
});

test('unavailable global shortcut gracefully falls back to GUI', () => {
  assert.equal(registerEmergencyPrivacy({ register: () => false }, () => {}), false);
  assert.equal(registerEmergencyPrivacy({ register: () => { throw new Error('claimed'); } }, () => {}), false);
  assert.equal(registerEmergencyPrivacy(null, () => {}), false);
});
