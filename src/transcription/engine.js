'use strict';

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { normalizeWhisperJson } = require('./formats');

const MAX_BYTES = 80 * 1024 * 1024;
const MAX_SECONDS = 30 * 60;

function resolveExecutable(name, override) {
  if (override) {
    const pathToBinary = path.resolve(override);
    if (!fs.existsSync(pathToBinary)) throw new Error(`${name} executable not found at ${pathToBinary}`);
    return pathToBinary;
  }
  const directories = [...new Set([
    ...(process.env.PATH || '').split(path.delimiter),
    '/opt/homebrew/bin', '/usr/local/bin', '/usr/bin'
  ].filter(Boolean))];
  for (const directory of directories) {
    const candidate = path.join(directory, name);
    try { fs.accessSync(candidate, fs.constants.X_OK); return candidate; } catch { /* keep looking */ }
  }
  return null;
}

function getSetup({ modelDirectory }) {
  const ffmpeg = resolveExecutable('ffmpeg', process.env.GO1_FFMPEG_PATH);
  const ffprobe = resolveExecutable('ffprobe', process.env.GO1_FFPROBE_PATH);
  const whisper = resolveExecutable('whisper-cli', process.env.GO1_WHISPER_PATH);
  const model = process.env.GO1_WHISPER_MODEL || path.join(modelDirectory, 'ggml-small.bin');
  const modelFound = fs.existsSync(model) && fs.statSync(model).size > 1024 * 1024;
  return { ffmpeg, ffprobe, whisper, model, modelFound, ready: Boolean(ffmpeg && ffprobe && whisper && modelFound) };
}

function execute(binary, args, { signal, timeoutMs = 600000 } = {}) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new Error('Operation cancelled.'));
    let settled = false;
    let stderr = '';
    let stdout = '';
    let timedOut = false;
    let child;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      signal?.removeEventListener('abort', abort);
      if (error) reject(error); else resolve(value);
    };
    const abort = () => { child?.kill('SIGKILL'); finish(new Error('Operation cancelled.')); };
    const timeout = setTimeout(() => {
      timedOut = true;
      child?.kill('SIGKILL');
      finish(new Error(`Processing exceeded the ${Math.round(timeoutMs / 1000)}-second timeout.`));
    }, timeoutMs);
    try {
      child = spawn(binary, args, { shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (error) { return finish(error); }
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) return abort();
    child.stdout.on('data', chunk => { stdout = (stdout + chunk.toString('utf8')).slice(-10000); });
    child.stderr.on('data', chunk => { stderr = (stderr + chunk.toString('utf8')).slice(-6000); });
    child.once('error', error => finish(new Error(`Unable to run ${path.basename(binary)}: ${error.message}`)));
    child.once('close', code => {
      if (settled) return;
      if (timedOut) return finish(new Error('Processing timed out.'));
      if (code !== 0) return finish(new Error(`${path.basename(binary)} failed (${code}): ${stderr || 'No details available'}`));
      finish(null, { stdout, stderr });
    });
  });
}

function validatePayload(payload) {
  if (!payload || !payload.bytes) throw new Error('An audio file or recording is required.');
  const bytes = payload.bytes instanceof ArrayBuffer ? Buffer.from(payload.bytes) : Buffer.from(payload.bytes);
  if (bytes.length === 0 || bytes.length > MAX_BYTES) throw new Error('Audio must be between 1 byte and 80 MB.');
  const language = String(payload.language || 'auto').toLowerCase().trim();
  if (!/^(auto|[a-z]{2,3})$/.test(language)) throw new Error('Invalid language code.');
  return { bytes, language, translate: payload.translate === true };
}

async function transcribe(payload, { modelDirectory, signal, onStage, binaries = {} } = {}) {
  const { bytes, language, translate } = validatePayload(payload);
  const setup = { ...getSetup({ modelDirectory }), ...binaries };
  if (!setup.ready && !binaries.ready) throw new Error('Setup incomplete: install ffmpeg, ffprobe, whisper-cli and a multilingual model. See README.');
  if (/\.en(\.|$)/.test(path.basename(setup.model)) && language !== 'en') {
    throw new Error('An English-only model cannot auto-detect or transcribe other languages. Install ggml-small.bin or another multilingual model.');
  }
  const workdir = await fsp.mkdtemp(path.join(os.tmpdir(), 'go1-asr-'));
  try {
    const input = path.join(workdir, 'input.audio');
    const wav = path.join(workdir, 'audio.wav');
    const outputPrefix = path.join(workdir, 'transcript');
    await fsp.writeFile(input, bytes, { mode: 0o600 });
    onStage?.('Converting audio to 16 kHz mono PCM...');
    if (setup.ffprobe) {
      const probe = await execute(setup.ffprobe, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', input], { signal, timeoutMs: 15000 });
      const duration = Number(probe.stdout.trim());
      if (Number.isFinite(duration) && duration > MAX_SECONDS) throw new Error('Audio is longer than 30 minutes. Split it into smaller recordings.');
    }
    await execute(setup.ffmpeg, ['-nostdin', '-v', 'error', '-y', '-i', input, '-map', '0:a:0', '-t', String(MAX_SECONDS), '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', wav], { signal, timeoutMs: 180000 });
    onStage?.('Transcribing speech locally...');
    const args = ['-m', setup.model, '-f', wav, '-l', language, '-oj', '-of', outputPrefix, '-np'];
    if (translate) args.push('-tr');
    await execute(setup.whisper, args, { signal, timeoutMs: 20 * 60 * 1000 });
    const raw = JSON.parse(await fsp.readFile(`${outputPrefix}.json`, 'utf8'));
    return { ...normalizeWhisperJson(raw), translatedToEnglish: translate };
  } finally {
    await fsp.rm(workdir, { recursive: true, force: true });
  }
}

module.exports = { MAX_BYTES, MAX_SECONDS, getSetup, resolveExecutable, validatePayload, execute, transcribe };

function wavFromPCM16(bytes) {
  const pcm = Buffer.from(bytes);
  if (!pcm.length || pcm.length % 2 !== 0 || pcm.length > 16 * 1024 * 1024) throw new Error('Invalid 16-bit mono PCM audio.');
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(16000, 24);
  header.writeUInt32LE(32000, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

async function transcribePcmWindow(pcm, { modelDirectory, language = 'auto', translate = false, signal, binaries = {} } = {}) {
  const setup = { ...getSetup({ modelDirectory }), ...binaries };
  if (!setup.whisper || !setup.modelFound && !binaries.ready) throw new Error('Whisper CLI and multilingual model must be installed.');
  const workdir = await fsp.mkdtemp(path.join(os.tmpdir(), 'go1-live-'));
  try {
    const input = path.join(workdir, 'audio.wav');
    const prefix = path.join(workdir, 'result');
    await fsp.writeFile(input, wavFromPCM16(pcm), { mode: 0o600 });
    const args = ['-m', setup.model, '-f', input, '-l', language, '-oj', '-of', prefix, '-np'];
    if (translate) args.push('-tr');
    await execute(setup.whisper, args, { signal, timeoutMs: 120000 });
    return normalizeWhisperJson(JSON.parse(await fsp.readFile(`${prefix}.json`, 'utf8')));
  } finally { await fsp.rm(workdir, { recursive: true, force: true }); }
}

module.exports.wavFromPCM16 = wavFromPCM16;
module.exports.transcribePcmWindow = transcribePcmWindow;
