'use strict';
// Build-time only. The packaged app reads this file in place, without copying
// it into userData or downloading it on first launch.
const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { ModelManager, MODEL_CATALOG } = require('../src/transcription/models');
async function main() {
  const directory = path.resolve('build/models');
  const id = 'base-q5_1', meta = MODEL_CATALOG[id];
  await fs.mkdir(directory, { recursive: true });
  const file = path.join(directory, meta.file);
  try {
    const hash = createHash('sha256').update(await fs.readFile(file)).digest('hex');
    if (hash !== meta.sha256) await fs.rm(file);
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const manager = new ModelManager({ directory, bundledDirectory: null });
  await manager.install(id);
  const bytes = await fs.readFile(file);
  const hash = createHash('sha256').update(bytes).digest('hex');
  if (hash !== meta.sha256) throw new Error('Bundled speech model integrity failed.');
  await fs.writeFile(path.join(directory, 'manifest.json'), JSON.stringify({
    schema: 1, model: id, file: meta.file, bytes: bytes.length, sha256: hash,
    multilingual: true, license: 'MIT', source: meta.url
  }, null, 2) + '\n');
  console.log(`Bundled multilingual Whisper ${id}: ${bytes.length} bytes; SHA-256 verified.`);
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
