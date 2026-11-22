'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { WhisperWorker } = require('../src/transcription/worker');
const { normalizeServerResponse } = require('../src/transcription/formats');
const sample = () => new Uint8Array([0, 0, 0, 0]);
test('normalizes verbose JSON from whisper-server', () => {
  const out = normalizeServerResponse({ language: 'hi', text: 'नमस्ते', duration: 1.5, segments: [{ start: 0.2, end: 1.5, text: 'नमस्ते' }] });
  assert.equal(out.segments[0].startMs, 200);
  assert.equal(out.segments[0].endMs, 1500);
  assert.equal(out.text, 'नमस्ते');
});
test('worker keeps model process loaded for multiple requests and shuts down', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'go1-worker-'));
  const binary = path.join(dir, 'server');
  const model = path.join(dir, 'model');
  await fs.writeFile(binary, 'stub');
  await fs.writeFile(model, 'stub');
  let starts = 0, inferenceCalls = 0, child;
  const worker = new WhisperWorker({
    binary, model, getPort: async () => 8765,
    spawnFn: () => {
      starts++;
      child = new EventEmitter();
      child.exitCode = null; child.killed = false;
      child.stderr = new EventEmitter();
      child.kill = () => { child.killed = true; child.exitCode = 0; };
      return child;
    },
    fetchFn: async (url, req) => {
      if (!req || !req.method) return { status: 200 };
      inferenceCalls++;
      assert.equal(url, 'http://127.0.0.1:8765/inference');
      assert.equal(req.body.get('language'), 'auto');
      return { ok: true, json: async () => ({ language: 'en', segments: [{ start: 0, end: 0.1, text: 'Hello' }], text: 'Hello' }) };
    }
  });
  try {
    assert.equal((await worker.infer(sample())).text, 'Hello');
    assert.equal((await worker.infer(sample())).text, 'Hello');
    assert.equal(starts, 1);
    assert.equal(inferenceCalls, 2);
    worker.close();
    assert.equal(child.killed, true);
    await assert.rejects(worker.infer(sample()), /closed/i);
  } finally { worker.close(); await fs.rm(dir, { force: true, recursive: true }); }
});

test('cancellation during model startup never dispatches an inference request', async () => {
  const controller = new AbortController();
  let completeStartup, calls = 0;
  const ready = new Promise(resolve => { completeStartup = resolve; });
  const worker = new WhisperWorker({ fetchFn: async () => { calls++; } });
  worker.ensureReady = () => ready;
  const work = worker.infer(sample(), { signal: controller.signal });
  await new Promise(resolve => setImmediate(resolve));
  controller.abort(); completeStartup('http://127.0.0.1:8765');
  await assert.rejects(work, /cancelled/);
  assert.equal(calls, 0);
});

test('worker does not publish a response decoded after cancellation', async () => {
  const controller = new AbortController();
  const worker = new WhisperWorker({ fetchFn: async () => ({ ok: true, json: async () => {
    controller.abort(); return { text: 'Obsolete text', language: 'en' };
  } }) });
  worker.ensureReady = async () => 'http://127.0.0.1:8765';
  await assert.rejects(worker.infer(sample(), { signal: controller.signal }), /cancelled/);
});
