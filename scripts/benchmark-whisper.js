#!/usr/bin/env node
'use strict';
// Benchmarks a real installed whisper-server model. No simulated speed claims.
// Usage: node scripts/benchmark-whisper.js ./speech.wav [5]
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { performance } = require('node:perf_hooks');
const { execute, resolveExecutable } = require('../src/transcription/engine');
const { WhisperWorker } = require('../src/transcription/worker');
const { percentile } = require('../src/transcription/latency');

async function main() {
  const filename = process.argv[2];
  if (!filename || !fs.existsSync(filename)) throw new Error('Usage: node scripts/benchmark-whisper.js path/to/consented-speech.wav [runs]');
  const runs = Number(process.argv[3] || 5);
  if (!Number.isInteger(runs) || runs < 1 || runs > 20) throw new Error('Runs must be between 1 and 20.');
  const selected = process.env.GO1_BENCH_MODEL || 'small';
  const model = process.env.GO1_WHISPER_MODEL || path.join(os.homedir(), 'Library', 'Application Support', 'GO1', 'models', `ggml-${selected}.bin`);
  if (!fs.existsSync(model)) throw new Error(`Missing model: ${model}. Install one in GO1 or set GO1_WHISPER_MODEL.`);
  const ffmpeg = resolveExecutable('ffmpeg', process.env.GO1_FFMPEG_PATH);
  const server = resolveExecutable('whisper-server', process.env.GO1_WHISPER_SERVER_PATH);
  if (!ffmpeg || !server) throw new Error('Install ffmpeg and whisper.cpp with whisper-server.');
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'go1-bench-'));
  const output = path.join(temp, 'mono.raw');
  const worker = new WhisperWorker({ binary: server, model });
  try {
    await execute(ffmpeg, ['-nostdin', '-v', 'error', '-y', '-i', filename, '-t', '15', '-ac', '1', '-ar', '16000', '-f', 's16le', output], {timeoutMs: 60000});
    const pcm = fs.readFileSync(output);
    if (pcm.length < 16000 || pcm.length > 16 * 1024 * 1024) throw new Error('Provide 0.5 to 15 seconds of speech audio.');
    const start = performance.now();
    await worker.ensureReady();
    const startup = Math.round(performance.now() - start);
    const data = [];
    for (let i = 0; i < runs; i++) {
      const begin = performance.now();
      const recognized = await worker.infer(pcm, {language: process.env.GO1_BENCH_LANGUAGE || 'auto'});
      const ms = Math.round(performance.now() - begin);
      data.push(ms);
      console.log(`Run ${i+1}/${runs}: ${ms} ms; language=${recognized.language}; chars=${recognized.text.length}`);
    }
    console.log(JSON.stringify({
      type: 'actual whisper-server inference, no VAD/capture/AI feedback', model: path.basename(model),
      startupMs: startup, clipDurationMs: Math.round(pcm.length / 32), runs,
      inferenceP50Ms: percentile(data, 0.5), inferenceP95Ms: percentile(data, 0.95),
      samplesMs: data, testedAt: new Date().toISOString()
    }, null, 2));
  } finally { worker.close(); fs.rmSync(temp, { recursive: true, force: true }); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
