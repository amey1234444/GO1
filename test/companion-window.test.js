'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { companionWindowOptions, configureCompanionWindow } = require('../src/privacy/companion-window');
test('Mac companion uses a frameless nonactivating panel', () => {
  const options = companionWindowOptions('darwin');
  assert.equal(options.type, 'panel'); assert.equal(options.frame, false);
  assert.equal(options.transparent, true); assert.equal(options.hasShadow, false);
  assert.equal(companionWindowOptions('win32').transparent, true);
  assert.equal(companionWindowOptions('win32').type, undefined);
  assert.deepEqual(companionWindowOptions('linux'), {});
});
test('Mac companion keeps its fullscreen/Spaces policy across restore without modifying capture state', () => {
  const w = new EventEmitter(), calls = [];
  w.isDestroyed = () => false;
  w.setAlwaysOnTop = (...args) => calls.push(['top', ...args]);
  w.setVisibleOnAllWorkspaces = (...args) => calls.push(['spaces', ...args]);
  configureCompanionWindow(w, 'darwin');
  w.emit('show'); w.emit('restore');
  assert.equal(calls.length, 6);
  assert.deepEqual(calls[0], ['top', true, 'screen-saver']);
  assert.deepEqual(calls[1], ['spaces', true, { visibleOnFullScreen: true, skipTransformProcessType: true }]);
  w.isDestroyed = () => true; w.emit('restore'); assert.equal(calls.length, 6);
});
