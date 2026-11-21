'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs/promises');
const { ModelManager, modelState } = require('../src/transcription/models');
const catalog = { test: { file: 'ggml-test.bin', minBytes: 12, maxBytes: 32, url: 'https://example.invalid/model.bin' } };
test('model installer validates streamed file, caches download and sends progress', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'go1-models-'));
  const observed = [];
  let fetches = 0;
  const manager = new ModelManager({ directory, catalog, onProgress: x => observed.push(x), fetchFn: async () => {
    fetches++;
    return { ok: true, headers: { get: () => '16' }, body: (async function* () { yield Buffer.concat([Buffer.from('lmgg'), Buffer.alloc(12)]); })() };
  } });
  try {
    const result = await manager.install('test');
    assert.equal(result.installed, true);
    assert.equal(modelState(directory, catalog).test.installed, true);
    assert.equal(observed[0].written, 16);
    assert.equal((await manager.install('test')).cached, true);
    assert.equal(fetches, 1);
    await assert.rejects(manager.install('nonexistent'), /Unknown model/);
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});
test('model installer rejects invalid model contents and removes temporary data', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'go1-badmodel-'));
  const manager = new ModelManager({ directory, catalog, fetchFn: async () => ({
    ok: true, headers: { get: () => '16' }, body: (async function* () { yield Buffer.alloc(16); })()
  }) });
  try {
    await assert.rejects(manager.install('test'), /Invalid Whisper model header/);
    assert.deepEqual(await fs.readdir(directory), []);
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});
