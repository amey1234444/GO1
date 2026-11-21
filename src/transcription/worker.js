'use strict';
// Supervised, persistent local Whisper model process. No internet connections.
const { spawn } = require('node:child_process');
const { createServer } = require('node:net');
const fs = require('node:fs');
const { Blob } = require('node:buffer');
const { normalizeServerResponse } = require('./formats');
const { wavFromPCM16, resolveExecutable } = require('./engine');

const delay = ms => new Promise(r => setTimeout(r, ms));
async function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const p = server.address().port;
      server.close(() => resolve(p));
    });
  });
}
function isLive(child) { return child && child.exitCode === null && !child.killed; }

class WhisperWorker {
  constructor({ binary, model, vadModel, spawnFn = spawn, fetchFn = fetch, getPort = freePort, startupMs = 90000 } = {}) {
    this.binary = binary;
    this.model = model;
    this.vadModel = vadModel;
    this.spawnFn = spawnFn;
    this.fetchFn = fetchFn;
    this.getPort = getPort;
    this.startupMs = startupMs;
    this.child = null;
    this.url = null;
    this.startPromise = null;
    this.queue = Promise.resolve();
    this.stopped = false;
    this.logs = '';
  }
  async ensureReady() {
    if (this.stopped) throw new Error('Whisper worker is closed.');
    if (this.url && isLive(this.child)) return this.url;
    if (!this.startPromise) this.startPromise = this._start().finally(() => { this.startPromise = null; });
    return this.startPromise;
  }
  async _start() {
    if (!this.binary || !fs.existsSync(this.binary)) throw new Error('whisper-server binary not found. Run the setup script.');
    if (!this.model || !fs.existsSync(this.model)) throw new Error('Whisper model not installed.');
    const port = await this.getPort();
    const url = `http://127.0.0.1:${port}`;
    const args = ['--host', '127.0.0.1', '--port', String(port), '-m', this.model, '-l', 'auto'];
    if (this.vadModel && fs.existsSync(this.vadModel)) args.push('--vad', '-vm', this.vadModel);
    this.logs = '';
    const child = this.spawnFn(this.binary, args, { shell: false, stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
    this.child = child;
    child.stderr?.on('data', chunk => { this.logs = (this.logs + String(chunk)).slice(-3000); });
    let failed = null;
    child.once('error', error => { failed = error; });
    child.once('exit', (code, signal) => {
      if (this.child === child) this.url = null;
      failed ||= new Error(`Whisper server exited (${signal || code}). ${this.logs}`);
    });
    const until = Date.now() + this.startupMs;
    while (!this.stopped && Date.now() < until) {
      if (failed || !isLive(child)) throw failed || new Error('Whisper server stopped unexpectedly.');
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 800);
        try {
          // The upstream default root serves an HTML page; any HTTP response means ready.
          const response = await this.fetchFn(url + '/', { signal: controller.signal });
          if (response && typeof response.status === 'number') {
            this.url = url;
            return url;
          }
        } finally { clearTimeout(timeout); }
      } catch { /* Model may still be loading. */ }
      await delay(220);
    }
    this.close();
    throw new Error(`Whisper server did not start within ${this.startupMs / 1000}s. ${this.logs}`);
  }
  async infer(pcm, { language = 'auto', translate = false, signal } = {}) {
    // Serialize inference calls to avoid exhausting RAM during overlapping sessions.
    const work = () => this._infer(pcm, { language, translate, signal });
    const result = this.queue.then(work, work);
    this.queue = result.catch(() => {});
    return result;
  }
  async _infer(pcm, { language, translate, signal }) {
    if (signal?.aborted) throw new Error('Transcription cancelled.');
    const url = await this.ensureReady();
    if (!/^(auto|[a-z]{2,3})$/.test(language)) throw new Error('Invalid speech language.');
    const form = new FormData();
    form.set('file', new Blob([wavFromPCM16(pcm)], { type: 'audio/wav' }), 'segment.wav');
    form.set('response_format', 'verbose_json');
    form.set('language', language);
    form.set('translate', translate ? 'true' : 'false');
    const timeout = new AbortController();
    const timeoutId = setTimeout(() => timeout.abort(new Error('Whisper inference timed out.')), 120000);
    const forwardAbort = () => timeout.abort(signal.reason || new Error('Transcription cancelled.'));
    signal?.addEventListener('abort', forwardAbort, { once: true });
    try {
      const response = await this.fetchFn(url + '/inference', { method: 'POST', body: form, signal: timeout.signal });
      if (!response.ok) throw new Error(`Whisper inference failed (HTTP ${response.status}): ${(await response.text()).slice(0,400)}`);
      const body = await response.json();
      return normalizeServerResponse(body);
    } finally {
      clearTimeout(timeoutId);
      signal?.removeEventListener('abort', forwardAbort);
    }
  }
  close() {
    this.stopped = true;
    this.url = null;
    if (isLive(this.child)) this.child.kill('SIGTERM');
  }
}
function createWorker({ modelDirectory, selectedModel = 'small', vadModel } = {}) {
  const { getSetup } = require('./engine');
  const setup = getSetup({ modelDirectory, selectedModel });
  const binary = resolveExecutable('whisper-server', process.env.GO1_WHISPER_SERVER_PATH);
  return new WhisperWorker({ binary, model: setup.model, vadModel });
}
module.exports = { WhisperWorker, createWorker, freePort };
