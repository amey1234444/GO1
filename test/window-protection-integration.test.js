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
async function boot(preferences = {}, overrides = {}) {
  const handlers = new Map(), listeners = new Map(), windows = [], writes = [], sent = [];
  let ready;
  class Window extends EventEmitter {
    constructor(options) {
      super(); this.options = options; this.events = []; this.dead = false; this.protected = false;
      this.webContents = new EventEmitter();
      Object.assign(this.webContents, { setWindowOpenHandler() {}, send: (channel, data) => sent.push({ window: this, channel, data }), isDestroyed: () => false });
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
  const electron = { app, BrowserWindow: Window, ipcMain: { handle: (name, fn) => handlers.set(name, fn), on: (name, fn) => listeners.set(name, fn) }, session: { defaultSession: fakeSession }, globalShortcut: { register: () => true }, systemPreferences: {}, clipboard: {}, desktopCapturer: {}, dialog: {} };
  const nodeRequire = createRequire(mainPath);
  const requireMock = name => {
    if (Object.hasOwn(overrides, name)) return overrides[name];
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
  return { windows, writes, invoke, sent, send: (channel, payload) => listeners.get(channel)({ sender: windows[0].webContents }, payload) };
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

function deferred() {
  let resolve; const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}
for (const audioSource of ['microphone', 'system']) {
  test(`live ${audioSource} PCM and AI streams continue across protection changes`, async () => {
    const inferenceStarted = deferred(), releaseInference = deferred(), aiStarted = deferred();
    let speechSignal, aiSignal, aiStream;
    const { generateLiveGuidance } = require('../src/practice/live-assist');
    const { windows, invoke, send, sent } = await boot({ captureProtection: false }, {
      './transcription/vad-live': require('../src/transcription/vad-live'),
      './transcription/worker': { createWorker: () => ({
        ensureReady: async () => {}, close() {},
        infer: async (_pcm, options) => {
          speechSignal = options.signal; inferenceStarted.resolve();
          await releaseInference.promise;
          return { text: 'The deployment is ready.', language: 'en' };
        }
      }) },
      './practice/live-assist': { generateLiveGuidance: options => generateLiveGuidance({ ...options,
        fetchImpl: async (_url, request) => {
          aiSignal = request.signal;
          const body = new ReadableStream({ start(c) { aiStream = c; } });
          aiStarted.resolve(); return { ok: true, body };
        }
      }) }
    });
    const id = await invoke('go1:live-start', { audioSource, language: 'en', latencyMode: 'fast', assistancePermitted: true });
    assert.equal(windows[0].options.webPreferences.backgroundThrottling, false);
    assert.equal(windows[1].options.webPreferences.backgroundThrottling, false);
    // Real PCM normalization, VAD, transcript aggregation and AI stream parser.
    // Recognition/model output are controlled fixtures, not real model inference.
    const pcm = new Int16Array(16000); pcm.fill(6000, 0, 6400);
    send('go1:live-frame', { id, pcm });
    await inferenceStarted.promise;
    const ai = invoke('go1:assist-generate', { question: 'How should we deploy?', context: 'A deployment discussion.' });
    await aiStarted.promise;
    for (const enabled of [true, false, true]) {
      const info = await invoke('go1:content-protection-set', enabled);
      assert.equal(info.activity.liveSession, true);
      assert.equal(info.activity.aiEnabled, true);
      assert.equal(info.activity.aiRunning, true);
      assert.equal(info.activity.paused, false);
      assert.equal(speechSignal.aborted, false);
      assert.equal(aiSignal.aborted, false);
    }
    releaseInference.resolve();
    const encode = text => new TextEncoder().encode(text);
    aiStream.enqueue(encode('{"message":{"content":"Check health"},"done":false}\n'));
    aiStream.enqueue(encode('{"message":{"content":" before rollout."},"done":true}\n')); aiStream.close();
    assert.equal((await ai).guidance, 'Check health before rollout.');
    await new Promise(resolve => setImmediate(resolve));
    const companion = sent.filter(s => s.channel === 'go1:companion-snapshot').at(-1).data;
    assert.equal(companion.transcript, 'The deployment is ready.');
    assert.equal(companion.guidance, 'Check health before rollout.');
    assert.equal(companion.captureProtection.enabled, true);
    assert.ok(sent.some(s => s.channel === 'go1:live-update' && s.data.result.text));
    assert.equal(sent.filter(s => s.channel === 'go1:assist-chunk').map(s => s.data.delta).join(''), 'Check health before rollout.');
    assert.equal((await invoke('go1:live-stop', id)).text, 'The deployment is ready.');
    const stopped = invoke('go1:content-protection-info');
    assert.equal(stopped.activity.liveSession, false);
    assert.equal(stopped.enabled, true);
  });
}
