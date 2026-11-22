'use strict';
// Launch the real app from the built DMG. Exercise its restricted preload APIs.
// Generated speech enters at the PCM IPC boundary; this is NOT a hardware audio
// or meeting receiver test. No production test hook, TCC bypass or fake model.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { createHash } = require('node:crypto');
const { spawn, execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { freePort } = require('../../src/transcription/worker');
const run = promisify(execFile);
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const output = path.resolve('out/release-evidence');
const model = 'qwen2.5:0.5b';
const spokenText = 'Hello. This is a test of the local speech recognition system. The release is ready for deployment.';
const report = {
  schema: 1, startedAt: new Date().toISOString(), sourceCommit: process.env.GITHUB_SHA || null,
  status: 'running', hardwareAudioTested: false, meetingReceiverVerified: false,
  scope: 'Packaged app, real preload IPC, bundled Whisper/FFmpeg, generated PCM speech and real local Ollama inference.',
  steps: [], speechModel: 'base', aiModel: model, spokenText
};
const connections = [], children = [];
let temp, mount, mounted = false;
async function record(name, action) {
  const started = Date.now();
  console.log(`Checking: ${name}`);
  try {
    const result = await action();
    report.steps.push({ name, status: 'passed', elapsedMs: Date.now() - started, result });
    await fs.writeFile(path.join(output, 'packaged-smoke.json'), JSON.stringify(report, null, 2));
    return result;
  } catch (error) {
    report.steps.push({ name, status: 'failed', elapsedMs: Date.now() - started, error: error.message });
    throw error;
  }
}
async function until(check, timeoutMs = 30000) {
  const until = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < until) {
    try { const value = await check(); if (value) return value; } catch (error) { lastError = error; }
    await delay(250);
  }
  throw new Error(`Readiness timed out${lastError ? ': ' + lastError.message : ''}`);
}
async function json(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(3000) });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response.json();
}
async function launch(binary, args, name, env = process.env) {
  const child = spawn(binary, args, { env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  children.push(child);
  child.on('error', error => { child.launchError = error; });
  let logs = '';
  const collect = chunk => { logs = (logs + chunk).slice(-200000); };
  child.stdout.on('data', collect); child.stderr.on('data', collect);
  child.saveLog = () => fs.writeFile(path.join(output, name + '.log'), logs);
  return child;
}
async function connect(target) {
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('CDP connection timed out')), 10000);
    ws.addEventListener('open', () => { clearTimeout(timeout); resolve(); }, { once: true });
    ws.addEventListener('error', () => { clearTimeout(timeout); reject(new Error('CDP connection failed')); }, { once: true });
  });
  const pending = new Map(); let next = 0;
  ws.addEventListener('message', event => {
    const data = JSON.parse(event.data), entry = pending.get(data.id);
    if (!entry) return;
    clearTimeout(entry.timeout); pending.delete(data.id);
    if (data.error) entry.reject(new Error(data.error.message)); else entry.resolve(data.result);
  });
  ws.addEventListener('close', () => {
    for (const entry of pending.values()) { clearTimeout(entry.timeout); entry.reject(new Error('App window closed')); }
    pending.clear();
  });
  const client = {
    close: () => ws.close(),
    call(method, params, timeoutMs = 180000) {
      return new Promise((resolve, reject) => {
        const id = ++next;
        const timeout = setTimeout(() => { pending.delete(id); reject(new Error(`${method} timed out`)); }, timeoutMs);
        pending.set(id, { resolve, reject, timeout }); ws.send(JSON.stringify({ id, method, params }));
      });
    },
    async evaluate(expression, timeoutMs) {
      const result = await this.call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, timeoutMs);
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
      return result.result.value;
    }
  };
  connections.push(client); return client;
}
async function findDmg(directory) {
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isFile() && entry.name.endsWith('.dmg')) return full;
    if (entry.isDirectory()) { const found = await findDmg(full); if (found) return found; }
  }
}
function checkWords(text) {
  const words = ['speech', 'recognition', 'release', 'deployment'].filter(word => text.toLowerCase().includes(word));
  assert.ok(words.length >= 2, `Recognition did not retain expected speech: ${text}`);
  return words;
}
async function main() {
  assert.equal(process.platform, 'darwin'); assert.equal(process.arch, 'arm64');
  await fs.mkdir(output, { recursive: true });
  temp = await fs.mkdtemp(path.join(os.tmpdir(), 'go1-packaged-'));
  mount = path.join(temp, 'mount'); await fs.mkdir(mount);
  const dmg = await findDmg(path.resolve('out/make')); assert.ok(dmg, 'No built DMG');
  report.dmg = { filename: path.basename(dmg), sha256: createHash('sha256').update(await fs.readFile(dmg)).digest('hex') };
  report.macOS = (await run('sw_vers', ['-productVersion'])).stdout.trim();
  await run('hdiutil', ['attach', '-readonly', '-nobrowse', '-mountpoint', mount, dmg], { timeout: 120000 }); mounted = true;
  const appName = (await fs.readdir(mount)).find(name => name.endsWith('.app')); assert.ok(appName);
  const bundle = path.join(mount, appName), native = await fs.realpath(path.join(bundle, 'Contents/Resources/native/bin'));
  report.appVersion = (await run('plutil', ['-extract', 'CFBundleShortVersionString', 'raw', path.join(bundle, 'Contents/Info.plist')])).stdout.trim();
  const ollama = await launch('ollama', ['serve'], 'ollama', { ...process.env, OLLAMA_HOST: '127.0.0.1:11434', OLLAMA_MODELS: path.join(temp, 'ollama-models') });
  await record('Local AI runtime and model', async () => {
    const version = await until(() => json('http://127.0.0.1:11434/api/version'), 60000);
    assert.equal(ollama.exitCode, null);
    await run('ollama', ['pull', model], { timeout: 900000, maxBuffer: 32 * 1024 * 1024, env: { ...process.env, OLLAMA_HOST: '127.0.0.1:11434' } });
    // Warm the model separately, then exercise GO1's real streaming request below.
    const warm = await fetch('http://127.0.0.1:11434/api/generate', {
      method: 'POST', body: JSON.stringify({ model, prompt: 'Hello', stream: false, options: { num_predict: 1 } }),
      headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(180000)
    });
    assert.equal(warm.ok, true); await warm.json();
    const tags = await json('http://127.0.0.1:11434/api/tags');
    return { version, model: tags.models.find(item => item.name === model) };
  });
  const speech = path.join(temp, 'speech.aiff'), wav = path.join(temp, 'speech.wav'), pcm = path.join(temp, 'speech.pcm');
  await run('say', ['-r', '145', '-o', speech, spokenText], { timeout: 30000 });
  await run(path.join(native, 'ffmpeg'), ['-y', '-i', speech, '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', wav], { timeout: 30000 });
  await run(path.join(native, 'ffmpeg'), ['-y', '-i', wav, '-f', 's16le', pcm], { timeout: 30000 });
  const pcmBase64 = (await fs.readFile(pcm)).toString('base64'), wavBase64 = (await fs.readFile(wav)).toString('base64');
  report.audioFixture = { kind: 'macOS generated speech; injected at PCM IPC boundary', sha256: createHash('sha256').update(await fs.readFile(wav)).digest('hex') };
  const port = await freePort();
  const app = await launch(path.join(bundle, 'Contents/MacOS/GO1'), [`--remote-debugging-port=${port}`, '--remote-debugging-address=127.0.0.1', `--user-data-dir=${path.join(temp, 'profile')}`], 'go1');
  const targets = () => json(`http://127.0.0.1:${port}/json/list`);
  const target = await until(async () => {
    if (app.launchError) throw app.launchError;
    return (await targets()).find(t => t.type === 'page' && t.url.endsWith('/index.html'));
  }, 60000);
  const workspace = await connect(target);
  await until(() => workspace.evaluate('Boolean(window.go1)'));
  const api = expression => workspace.evaluate(expression);
  await record('Packaged launch and bundled executable resolution', async () => {
    const setup = await api('window.go1.checkSetup()');
    report.detectedSetup = setup;
    for (const [key, filename] of [['ffmpeg','ffmpeg'], ['ffprobe','ffprobe'], ['whisper','whisper-cli'], ['whisperServer','whisper-server']]) {
      assert.ok(setup[key], `${key} unavailable`);
      assert.equal(await fs.realpath(setup[key]), path.join(native, filename), `${key} must resolve to the actual DMG executable: ${setup[key]}`);
    }
    return setup;
  });
  await record('First-run speech model installation and selection', async () => {
    const installed = await workspace.evaluate("window.go1.installModel('base')", 600000);
    assert.equal(installed.installed, true);
    const setup = await api("window.go1.selectModel('base')"); assert.equal(setup.ready, true);
    await api(`window.go1.savePracticeProfile({role:'Software Engineer', language:'en', mode:'technical', model:${JSON.stringify(model)}})`);
    const status = await api('window.go1.localCoachStatus()'); assert.ok(status.online && status.models.includes(model));
    return { installed, setup, status };
  });
  const id = await record('Live session opens a protected companion', async () => {
    const id = await api(`window.go1.startLive({language:'en',audioSource:'microphone',latencyMode:'balanced',assistancePermitted:true})`);
    const info = await api('window.go1.captureProtectionInfo()');
    assert.equal(info.allApplied, true); assert.equal(info.activity.aiEnabled, true);
    assert.ok(info.windows.some(window => window.role === 'companion'));
    return id;
  });
  await api(`window.qaUpdates=[]; window.qaChunks=[]; window.go1.onLiveUpdate(x=>window.qaUpdates.push(x)); window.go1.onAssistChunk(x=>window.qaChunks.push(x)); true`);
  await record('Protection toggles preserve the active session', async () => {
    const results = [];
    for (const enabled of [false, true]) {
      const info = await api(`window.go1.setCaptureProtection(${enabled})`);
      assert.equal(info.activity.liveSession, true); assert.equal(info.activity.aiEnabled, true); assert.equal(info.enabled, enabled);
      if (enabled) assert.equal(info.allApplied, true);
      results.push(info);
    }
    return results;
  });
  await record('Real streaming speech recognition while protected', async () => {
    await api(`(() => { const bytes=Uint8Array.from(atob(${JSON.stringify(pcmBase64)}), c=>c.charCodeAt(0)); const pcm=new Int16Array(bytes.buffer); for(let offset=0;offset<pcm.length;offset+=3200) window.go1.sendLiveChunk(${JSON.stringify(id)},pcm.slice(offset,offset+3200)); window.go1.sendLiveChunk(${JSON.stringify(id)},new Int16Array(16000)); return true; })()`);
    const result = await until(async () => {
      const update = await api('window.qaUpdates.at(-1)');
      if (update?.result?.text && /deployment/i.test(update.result.text)) return update.result;
    }, 120000);
    checkWords(result.text); report.liveTranscript = result; return result;
  });
  let panel = await connect(await until(async () => (await targets()).find(t => t.url.endsWith('/companion.html'))));
  await record('Real local AI stream reaches protected companion', async () => {
    const answer = await panel.evaluate(`window.go1Companion.ask('State one benefit of gradual software deployment.')`);
    assert.ok(answer.guidance.length > 20);
    const chunks = await api('window.qaChunks'); assert.ok(chunks.length > 0);
    const displayed = await until(async () => {
      const text = await panel.evaluate("document.getElementById('guidance').textContent");
      return text.trim() === answer.guidance ? text : null;
    });
    const transcript = await panel.evaluate("document.getElementById('transcript').textContent"); checkWords(transcript);
    const protection = await api('window.go1.captureProtectionInfo()'); assert.equal(protection.allApplied, true);
    report.guidance = answer.guidance;
    const screenshot = await panel.call('Page.captureScreenshot', { format: 'png' });
    await fs.writeFile(path.join(output, 'packaged-companion-real-inference.png'), Buffer.from(screenshot.data, 'base64'));
    return { answer, chunks: chunks.length, displayed, protection };
  });
  await record('Compact, translucency and close/reopen retain live text', async () => {
    assert.equal(await panel.evaluate('window.go1Companion.setCompact(true)'), true);
    assert.equal(await panel.evaluate('window.go1Companion.setOpacity(.7)'), .7);
    const style = await panel.evaluate("({compact:document.getElementById('companionApp').classList.contains('compact'),alpha:getComputedStyle(document.documentElement).getPropertyValue('--surface-opacity').trim()})");
    assert.equal(style.compact, true); assert.equal(style.alpha, '0.7');
    const screenshot = await panel.call('Page.captureScreenshot', { format: 'png' });
    await fs.writeFile(path.join(output, 'packaged-companion-compact.png'), Buffer.from(screenshot.data, 'base64'));
    await panel.evaluate('window.go1Companion.close()').catch(error => { if (!/closed|context/i.test(error.message)) throw error; });
    panel.close();
    await api('window.go1.showCompanion()');
    panel = await connect(await until(async () => (await targets()).find(t => t.url.endsWith('/companion.html'))));
    const retained = await until(async () => {
      const value = await panel.evaluate("({transcript:document.getElementById('transcript').textContent, guidance:document.getElementById('guidance').textContent})");
      return value.guidance.trim() === report.guidance ? value : null;
    });
    checkWords(retained.transcript); return retained;
  });
  const completed = await record('Stop flushes transcript and removes companion', async () => {
    const result = await api(`window.go1.stopLive(${JSON.stringify(id)})`); checkWords(result.text);
    const info = await api('window.go1.captureProtectionInfo()'); assert.equal(info.activity.liveSession, false);
    assert.ok(!info.windows.some(window => window.role === 'companion'));
    return result;
  });
  await record('Imported audio runs bundled FFprobe, FFmpeg and Whisper CLI', async () => {
    const result = await api(`window.go1.transcribe({bytes:Uint8Array.from(atob(${JSON.stringify(wavBase64)}),c=>c.charCodeAt(0)),language:'en'})`);
    checkWords(result.text); report.batchTranscript = result; return result;
  });
  await record('Completed review is protected and Stop & mask clears it', async () => {
    await api(`window.go1.openReview(${JSON.stringify(completed)})`);
    const protectedReview = await api('window.go1.captureProtectionInfo()');
    assert.equal(protectedReview.allApplied, true); assert.ok(protectedReview.windows.some(w => w.role === 'review'));
    const paused = await api('window.go1.pauseForPresentation()'); assert.equal(paused.paused, true);
    const rejected = await api("window.go1.startLive().then(()=>false,()=>true)"); assert.equal(rejected, true);
    const info = await api('window.go1.captureProtectionInfo()'); assert.ok(!info.windows.some(w => w.role === 'review'));
    await api('window.go1.resumeFromPresentation()');
    const resumed = await api('window.go1.captureProtectionInfo()'); assert.equal(resumed.activity.liveSession, false);
    return { protectedReview, paused, resumed };
  });
  await record('Workspace close terminates the persistent speech worker', async () => {
    await api("window.go1.startLive({language:'en', audioSource:'microphone'})");
    const processes = async () => (await run('ps', ['-axo', 'command='])).stdout.split('\n').filter(line => line.includes(native + '/whisper-server'));
    assert.ok((await processes()).length > 0, 'No live native worker found');
    await api('window.close(); true').catch(error => { if (!/closed|context/i.test(error.message)) throw error; });
    await until(async () => (await processes()).length === 0, 10000);
    return { nativeWorkerStopped: true };
  });
  report.status = 'passed';
}
main().catch(error => { report.status = 'failed'; report.error = error.stack; process.exitCode = 1; console.error(error); }).finally(async () => {
  for (const connection of connections) connection.close();
  for (const child of children.reverse()) {
    if (child.pid) { try { process.kill(-child.pid, 'SIGTERM'); } catch {} }
    await child.saveLog();
  }
  await delay(1000);
  if (mounted) { try { await run('hdiutil', ['detach', mount, '-force'], { timeout: 30000 }); } catch (error) { report.cleanupError = error.message; report.status = 'failed'; process.exitCode = 1; } }
  report.finishedAt = new Date().toISOString();
  await fs.mkdir(output, { recursive: true });
  await fs.writeFile(path.join(output, 'packaged-smoke.json'), JSON.stringify(report, null, 2));
  if (temp) await fs.rm(temp, { recursive: true, force: true });
  console.log(`Packaged app validation: ${report.status}`);
});
