'use strict';
// Execute the real main-process module with an Electron boundary double.
// This verifies wiring and event order, not OS/compositor capture behavior.
const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const mainPath = path.join(__dirname, '../src/main.js');
async function boot(preferences = {}) {
  const handlers = new Map(), windows = [], writes = [];
  let ready;
  class Window extends EventEmitter {
    constructor(options) {
      super(); this.options = options; this.events = []; this.dead = false; this.protected = false;
      this.webContents = new EventEmitter();
      Object.assign(this.webContents, { setWindowOpenHandler() {}, send() {}, isDestroyed: () => false });
      windows.push(this);
    }
    static getAllWindows() { return windows.filter(w => !w.dead); }
    isDestroyed() { return this.dead; }
    setContentProtection(value) { this.events.push(['protect', value]); this.protected = value; }
    isContentProtected() { return this.protected; }
    show() { this.events.push(['show']); this.emit('show'); }
    focus() {}
    showInactive() { this.show(); }
    setAlwaysOnTop() {}
    setVisibleOnAllWorkspaces() {}
    close() { this.dead = true; this.emit('closed'); }
    async loadFile() { this.events.push(['load']); this.webContents.emit('did-finish-load'); this.emit('ready-to-show'); }
  }
  const app = new EventEmitter();
  Object.assign(app, { setName() {}, getPath: () => '/test-user-data', whenReady: () => ({ then: fn => { ready = fn; } }), quit() {} });
  const fakeSession = { setDisplayMediaRequestHandler() {}, setPermissionRequestHandler() {}, setPermissionCheckHandler() {} };
  const electron = { app, BrowserWindow: Window, ipcMain: { handle: (name, fn) => handlers.set(name, fn), on() {} }, session: { defaultSession: fakeSession }, globalShortcut: { register: () => true }, systemPreferences: {}, clipboard: {}, desktopCapturer: {}, dialog: {} };
  const nodeRequire = createRequire(mainPath);
  const requireMock = name => {
    if (name === 'electron') return electron;
    if (name === 'node:fs/promises') return {
      readFile: async file => file.endsWith('settings.json') ? JSON.stringify(preferences) : '{}',
      writeFile: async (file, text) => writes.push(JSON.parse(text)), rename: async () => {}
    };
    if (name === './transcription/engine') return { getSetup: () => ({ ready: true, modelFound: true }), resolveExecutable: () => '/fake/whisper-server' };
    if (name === './transcription/worker') return { createWorker: () => ({ ensureReady: async () => {}, close() {} }) };
    if (name === './transcription/vad-live') return { VadLiveSession: class { cancel() {} } };
    if (name === './transcription/models') return { MODEL_CATALOG: { small: {}, silero: { file: 'silero.bin' } }, modelState: () => ({}), ModelManager: class {} };
    return nodeRequire(name);
  };
  vm.runInNewContext(fs.readFileSync(mainPath, 'utf8'), {
    require: requireMock, __dirname: path.dirname(mainPath), process: { platform: 'darwin', env: {} },
    console, AbortController, setTimeout, clearTimeout
  }, { filename: mainPath });
  await ready();
  const invoke = (channel, payload, sender = windows[0].webContents) => handlers.get(channel)({ sender }, payload);
  return { windows, writes, invoke };
}
test('real main process protects workspace, review and companion before loading/showing them', async () => {
  const { windows, invoke } = await boot();
  await invoke('go1:review-open', { text: 'Completed practice', segments: [], durationMs: 2000 });
  await invoke('go1:live-start', { audioSource: 'microphone' });
  assert.equal(windows.length, 3);
  for (const w of windows) {
    assert.equal(w.options.show, false);
    assert.deepEqual(w.events[0], ['protect', true]);
    assert.ok(w.events.some(e => e[0] === 'show'));
  }
  assert.deepEqual(invoke('go1:content-protection-info').windows.map(w => w.role), ['workspace', 'review', 'companion']);
  await invoke('go1:content-protection-set', false);
  assert.ok(windows.every(w => !w.protected));
  invoke('go1:privacy-pause');
  assert.equal(windows[1].dead, true); assert.equal(windows[2].dead, true);
  assert.equal(invoke('go1:privacy-info').paused, true);
  assert.throws(() => invoke('go1:content-protection-info', null, {}), /Unrecognized/);
  await assert.rejects(invoke('go1:content-protection-set', 'false'), /boolean/);
});
test('saved protection opt-out survives restart and ordered settings writes retain the final preference', async () => {
  const { windows, writes, invoke } = await boot({ captureProtection: false });
  assert.deepEqual(windows[0].events[0], ['protect', false]);
  await Promise.all([invoke('go1:content-protection-set', true), invoke('go1:content-protection-set', false)]);
  assert.deepEqual(writes.map(w => w.captureProtection), [true, false]);
  assert.equal(invoke('go1:content-protection-info').enabled, false);
  const next = await boot(writes.at(-1));
  assert.deepEqual(next.windows[0].events[0], ['protect', false]);
});
