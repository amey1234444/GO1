'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { LiveDock } = require('../src/privacy/live-dock');
function fixture() {
  let visible = true; const policies = [];
  const app = { setActivationPolicy: value => policies.push(value), dock: {
    hide: () => { visible = false; }, show: async () => { visible = true; }, isVisible: () => visible
  } };
  return { app, policies, dock: new LiveDock({ app, platform: 'darwin' }) };
}
test('live Dock policy restores normal navigation on workspace focus and panel close', async () => {
  const { dock, policies } = fixture();
  await dock.setCompanionOpen(true); assert.equal(dock.snapshot().dockVisible, false);
  assert.equal(dock.snapshot().captureExclusionProof, false);
  await dock.showWorkspace(); assert.equal(dock.snapshot().dockVisible, true);
  await dock.setCompanionOpen(true); assert.equal(dock.snapshot().dockVisible, false);
  await dock.setCompanionOpen(false); assert.equal(dock.snapshot().dockVisible, true);
  assert.deepEqual(policies, ['accessory','regular','accessory','regular']);
});
test('Dock opt-out persists across panel changes and rejects malformed preferences', async () => {
  const { dock } = fixture();
  await dock.setEnabled(false); await dock.setCompanionOpen(true);
  assert.equal(dock.snapshot().dockVisible, true);
  assert.throws(() => dock.setEnabled('true'), /boolean/);
});
test('late async Dock restoration cannot override a newer hidden request', async () => {
  const { dock, app } = fixture();
  let release, started;
  const ready = new Promise(resolve => { started = resolve; });
  app.dock.show = () => new Promise(resolve => { release = resolve; started(); });
  const restore = dock.showWorkspace(); await ready;
  const hide = dock.setCompanionOpen(true); release(); await restore; await hide;
  assert.equal(dock.snapshot().requestedHidden, true);
  assert.equal(dock.snapshot().dockVisible, false);
});
test('unsupported systems and native failures are reported without stopping session work', async () => {
  const unsupported = new LiveDock({ app: {}, platform: 'win32' });
  await unsupported.setCompanionOpen(true); assert.equal(unsupported.snapshot().supported, false);
  const { dock, app } = fixture(); app.setActivationPolicy = () => { throw new Error('OS failure'); };
  await dock.setCompanionOpen(true); assert.match(dock.snapshot().error, /OS failure/);
});
