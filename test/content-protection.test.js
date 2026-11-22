'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { ContentProtection } = require('../src/privacy/content-protection');
class Window extends EventEmitter {
  constructor() { super(); this.applied = false; this.destroyed = false; this.calls = []; }
  isDestroyed() { return this.destroyed; }
  setContentProtection(value) { this.calls.push(value); this.applied = value; }
  isContentProtected() { return this.applied; }
  close() { this.destroyed = true; this.emit('closed'); }
}
for (const platform of ['darwin', 'win32']) {
  test(`${platform}: protects all window roles immediately and never certifies receiver view`, () => {
    const protection = new ContentProtection({ platform });
    for (const role of ['workspace', 'companion', 'review']) {
      const w = new Window(); protection.register(w, role);
      assert.deepEqual(w.calls, [true]);
    }
    const info = protection.snapshot();
    assert.equal(info.allApplied, true);
    assert.equal(info.windows.length, 3);
    assert.equal(info.receiverVerified, false);
    assert.equal(info.guaranteedCaptureExclusion, false);
  });
}
test('show/restore reapplies current preference; duplicate registration does not add listeners', () => {
  const p = new ContentProtection({ platform: 'darwin' }), w = new Window();
  p.register(w, 'workspace'); p.register(w, 'workspace');
  w.applied = false; w.emit('show'); assert.equal(w.applied, true);
  w.applied = false; w.emit('restore'); assert.equal(w.applied, true);
  assert.equal(w.listenerCount('show'), 1);
  p.setEnabled(false); w.emit('restore'); assert.equal(w.applied, false);
});
test('toggle changes existing windows and newly opened windows inherit it', () => {
  const p = new ContentProtection({ platform: 'win32' }), a = new Window(), b = new Window();
  p.register(a, 'workspace'); p.setEnabled(false); p.register(b, 'review');
  assert.equal(a.applied, false); assert.deepEqual(b.calls, [false]);
  p.setEnabled(true); assert.equal(a.applied, true); assert.equal(b.applied, true);
});
test('unsupported platforms never invoke unsupported OS APIs', () => {
  const p = new ContentProtection({ platform: 'linux' }), w = new Window();
  w.setContentProtection = () => { throw new Error('must not call'); };
  p.register(w, 'workspace'); p.setEnabled(false); p.setEnabled(true); w.emit('show');
  assert.equal(p.snapshot().supported, false); assert.equal(p.snapshot().allApplied, false);
});
test('an API exception is reported and does not stop protection of other windows', () => {
  const p = new ContentProtection({ platform: 'win32' }), broken = new Window(), good = new Window();
  broken.setContentProtection = () => { throw new Error('OS rejected request'); };
  p.register(broken, 'workspace'); p.register(good, 'companion'); p.setEnabled(true);
  assert.equal(good.applied, true);
  assert.match(p.snapshot().windows[0].error, /rejected/);
  assert.equal(p.snapshot().allApplied, false);
});
test('silent setter failure and changed readback are not reported as success', () => {
  const p = new ContentProtection({ platform: 'darwin' }), w = new Window();
  w.setContentProtection = () => {};
  p.register(w, 'workspace'); assert.equal(p.snapshot().allApplied, false);
  assert.match(p.snapshot().windows[0].error, /does not match/);
  w.setContentProtection = Window.prototype.setContentProtection;
  w.emit('restore'); assert.equal(p.snapshot().allApplied, true);
  w.applied = false; assert.equal(p.snapshot().allApplied, false);
});
test('readback exception is visible; closed windows are dropped and empty registry is not success', () => {
  const p = new ContentProtection({ platform: 'darwin' }), w = new Window();
  p.register(w, 'workspace'); w.isContentProtected = () => { throw new Error('unavailable'); };
  assert.match(p.snapshot().windows[0].error, /unavailable/);
  w.close(); assert.deepEqual(p.snapshot().windows, []); assert.equal(p.snapshot().allApplied, false);
  assert.doesNotThrow(() => p.setEnabled(false));
});
test('invalid IPC preference is rejected without changing the policy', () => {
  const p = new ContentProtection();
  for (const v of [null, 'false', 0, {}, undefined]) assert.throws(() => p.setEnabled(v), /boolean/);
  assert.equal(p.enabled, true);
});
test('macOS limitation explicitly identifies ScreenCaptureKit', () => {
  assert.match(new ContentProtection({ platform: 'darwin' }).snapshot().limitation, /ScreenCaptureKit/);
});
