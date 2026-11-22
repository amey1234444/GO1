'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { execute, transcribe } = require('../src/transcription/engine');

async function fakeBinary(dir, name, source) {
  const filepath = path.join(dir, name + '.cjs');
  await fs.writeFile(filepath, `${source}\n`);
  return filepath;
}

test('end-to-end orchestration: decode, transcribe, parse detected language', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'go1-integration-'));
  try {
    const ffprobe = await fakeBinary(directory, 'ffprobe', `process.stdout.write('3.12\\n');`);
    const ffmpeg = await fakeBinary(directory, 'ffmpeg', `require('node:fs').writeFileSync(process.argv.at(-1), 'pretend wav');`);
    const whisper = await fakeBinary(directory, 'whisper-cli', `
      const args = process.argv.slice(2);
      const out = args[args.indexOf('-of') + 1];
      if (args[args.indexOf('-l') + 1] !== 'auto') process.exit(9);
      require('node:fs').writeFileSync(out + '.json', JSON.stringify({ result: { language: 'mr' }, transcription: [
        { offsets: { from: 0, to: 3120 }, text: ' नमस्कार मंडळी' }
      ] }));
    `);
    const stages = [];
    const result = await transcribe({ bytes: new Uint8Array([1, 2, 3, 4]), language: 'auto' }, {
      modelDirectory: directory,
      // Invoke JS fixtures through Node on every OS; Windows cannot execute shebang files.
      // Still exercise real child processes, arguments, output parsing and temporary files.
      executeCommand: (script, args, options) => execute(process.execPath, [script, ...args], options),
      onStage: stage => stages.push(stage),
      binaries: { ffmpeg, ffprobe, whisper, model: path.join(directory, 'fake.bin'), ready: true }
    });
    assert.equal(result.text, 'नमस्कार मंडळी');
    assert.equal(result.language, 'mr');
    assert.equal(stages.length, 2);
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});

test('cancel interrupts a child process', async () => {
  const controller = new AbortController();
  const promise = execute(process.execPath, ['-e', 'setTimeout(() => {}, 60000)'], { signal: controller.signal, timeoutMs: 10000 });
  controller.abort();
  await assert.rejects(promise, /cancelled/i);
});

test('nonzero command exit reports useful error', async () => {
  await assert.rejects(execute(process.execPath, ['-e', "process.stderr.write('failure info'); process.exit(3)"], { timeoutMs: 1000 }), /failed \(3\): failure info/);
});
