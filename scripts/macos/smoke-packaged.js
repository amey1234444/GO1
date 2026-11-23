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
  scope: 'Packaged app, real preload IPC, bundled Whisper/FFmpeg, generated PCM speech, synthetic MediaStream lifecycle and real local Ollama inference.',
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
      const result = await this.call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true }, timeoutMs);
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
  // Test a Finder-style copy instead of running from the mounted image.
  const bundle = path.join(temp, appName);
  await run('ditto', [path.join(mount, appName), bundle], { timeout: 120000 });
  await run('codesign', ['--verify', '--deep', '--strict', bundle]);
  report.installCopy = { method: 'ditto from mounted DMG to writable directory', signatureVerified: true, finderQuarantineTested: false };
  const native = await fs.realpath(path.join(bundle, 'Contents/Resources/native/bin'));
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
  await record('Live Dock mode hides and restores navigation without stopping processing', async () => {
    const hidden = await until(async () => {
      const info = await api('window.go1.captureProtectionInfo()');
      return info.presentation.dockVisible === false ? info : null;
    });
    assert.equal(hidden.activity.liveSession, true); assert.equal(hidden.allApplied, true);
    const visible = await api('window.go1.setLiveDockHidden(false)');
    assert.equal(visible.presentation.dockVisible, true); assert.equal(visible.activity.aiEnabled, true);
    await api('window.go1.setLiveDockHidden(true)');
    const temporaryPanel = await connect(await until(async () => (await targets()).find(t => t.url.endsWith('/companion.html'))));
    await temporaryPanel.evaluate('window.go1Companion.focusWorkspace()');
    assert.equal((await api('window.go1.captureProtectionInfo()')).presentation.dockVisible, true);
    await api('window.go1.showCompanion()');
    const restored = await until(async () => {
      const info = await api('window.go1.captureProtectionInfo()');
      return info.presentation.dockVisible === false ? info : null;
    });
    temporaryPanel.close();
    assert.equal(restored.activity.liveSession, true); assert.equal(restored.activity.aiEnabled, true);
    return { hidden, visible, restored };
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
  await record('Duplicate launch exits while the original protected session stays active', async () => {
    const duplicate = await launch(path.join(bundle, 'Contents/MacOS/GO1'), [`--user-data-dir=${path.join(temp, 'profile')}`], 'go1-duplicate');
    await until(() => duplicate.exitCode !== null, 20000);
    assert.equal(duplicate.exitCode, 0);
    const state = await api('window.go1.captureProtectionInfo()');
    assert.equal(state.activity.liveSession, true); assert.equal(state.activity.aiEnabled, true); assert.equal(state.allApplied, true);
    assert.equal(app.exitCode, null);
    await api('window.go1.showCompanion()');
    return { duplicateExitCode: duplicate.exitCode, originalSessionActive: true };
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
  await record('Local visibility toggle retains protected live transcript and AI state', async () => {
    const before=await panel.evaluate("({transcript:document.getElementById('transcript').textContent,answer:document.getElementById('guidance').textContent})");
    const initial=await api('window.go1.visibilityInfo()');assert.equal(initial.registered,true);
    const hidden=await api('window.go1.toggleVisibility()');
    assert.equal(hidden.hidden,true);assert.ok(hidden.windows.every(window=>!window.visible));
    await delay(400);
    assert.equal((await api('window.go1.captureProtectionInfo()')).activity.liveSession,true);
    await api('window.go1.showCompanion()');
    assert.ok((await api('window.go1.visibilityInfo()')).windows.every(window=>!window.visible));
    const restored=await api('window.go1.toggleVisibility()');assert.equal(restored.hidden,false);
    const after=await panel.evaluate("({transcript:document.getElementById('transcript').textContent,answer:document.getElementById('guidance').textContent})");
    assert.deepEqual(after,before);assert.equal(restored.windows.length,initial.windows.length);
    return {hidden,restored,sameText:true,shortcutRegistered:true,physicalKeypressTested:false};
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
    await until(async () => (await api('window.go1.captureProtectionInfo()')).presentation.dockVisible === true);
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
  await record('Actual app restart restores appearance without automatically recording', async () => {
    const saved = JSON.parse(await fs.readFile(path.join(temp, 'profile/settings.json'), 'utf8'));
    assert.equal(saved.companion.compact, true); assert.equal(saved.companion.surfaceOpacity, .7);
    assert.ok(saved.companion.bounds.width > 0);
    assert.equal(JSON.stringify(saved).includes('speech recognition'), false);
    app.kill('SIGTERM');
    await until(() => app.exitCode !== null || app.signalCode !== null, 20000);
    const restarted = await launch(path.join(bundle, 'Contents/MacOS/GO1'), [`--remote-debugging-port=${port}`, '--remote-debugging-address=127.0.0.1', `--user-data-dir=${path.join(temp, 'profile')}`], 'go1-restarted');
    const next = await connect(await until(async () => (await targets()).find(t => t.type === 'page' && t.url.endsWith('/index.html')), 60000));
    await until(() => next.evaluate('Boolean(window.go1)'));
    const idle = await next.evaluate('window.go1.captureProtectionInfo()'); assert.equal(idle.activity.liveSession, false);
    const sessionId = await next.evaluate("window.go1.startLive({language:'en', audioSource:'microphone'})");
    const panel = await connect(await until(async () => (await targets()).find(t => t.url.endsWith('/companion.html'))));
    const restored = await until(async () => {
      const state = await panel.evaluate("({compact:document.getElementById('companionApp').classList.contains('compact'),opacity:document.getElementById('opacity').value})");
      return state.compact && state.opacity === '70' ? state : null;
    });
    assert.equal(restarted.exitCode, null);
    await next.evaluate(`window.go1.cancelLive(${JSON.stringify(sessionId)})`);
    return { savedAppearance: saved.companion, restored, automaticRecording: idle.activity.liveSession };
  });
  // Exercise the real renderer capture lifecycle with synthetic MediaStreams.
  // Device permissions and microphone/system hardware are deliberately not mocked as passed.
  const inputPage = await connect(await until(async () => (await targets()).find(t => t.url.endsWith('/index.html'))));
  const fixtureId = await record('Renderer audio startup minimizes workspace and survives real-time silence', async () => {
    const sessionId = await inputPage.evaluate(`(async () => {
      window.qaHealth = null; window.qaRecovered = null;
      window.go1.onAudioHealth(value => { window.qaHealth = value; });
      window.go1.onLiveUpdate(value => { window.qaRecovered = value; });
      window.qaContexts = [];
      window.qaSilentStream = () => {
        const ctx = new AudioContext(); const source = ctx.createConstantSource(); source.offset.value = 0;
        const destination = ctx.createMediaStreamDestination(); source.connect(destination); source.start();
        window.qaContexts.push(ctx); void ctx.resume(); return destination.stream;
      };
      document.getElementById('assistConsent').checked = true;
      document.getElementById('languageSelect').value = 'en';
      state.stream = window.qaSilentStream();
      await startLive(state.stream); state.recording = true;
      return state.liveId;
    })()`);
    await delay(5000);
    const observed = await inputPage.evaluate('(async()=>({info:await window.go1.captureProtectionInfo(),health:window.qaHealth,result:state.result,recording:state.recording}))()');
    assert.equal(observed.info.activity.workspaceMinimized,true);
    assert.equal(observed.info.activity.liveSession,true); assert.equal(observed.recording,true);
    assert.ok(observed.health.health.frames > 5); assert.equal(observed.health.health.rms,0);
    assert.ok(!observed.result?.text);
    report.silentCapture = observed;
    return sessionId;
  });
  const inputPanel = await connect(await until(async () => (await targets()).find(t => t.url.endsWith('/companion.html'))));
  await record('Ended audio track keeps companion open and explicit reconnect restores capture', async () => {
    await inputPanel.evaluate('window.go1Companion.setCompact(false)');
    await inputPage.evaluate("(() => { const track=state.stream.getAudioTracks()[0]; track.stop(); track.dispatchEvent(new Event('ended')); return true; })()");
    await until(async () => (await inputPanel.evaluate("document.getElementById('inputStateLabel').textContent")) === 'Input lost');
    assert.equal((await inputPage.evaluate('window.go1.captureProtectionInfo()')).activity.liveSession,true);
    const lost = await inputPanel.call('Page.captureScreenshot',{format:'png'});
    await fs.writeFile(path.join(output,'packaged-input-disconnected.png'),Buffer.from(lost.data,'base64'));
    await inputPanel.evaluate('window.go1Companion.focusWorkspace()');
    assert.equal((await inputPage.evaluate('window.go1.captureProtectionInfo()')).activity.workspaceMinimized,false);
    // Substitute only acquisition: the real reconnect/track/worklet/state code still runs.
    await inputPage.evaluate(`(async () => { const original=acquireCaptureStream; acquireCaptureStream=async()=>window.qaSilentStream();
      try { await reconnectLiveAudio(); } finally { acquireCaptureStream=original; } return true; })()`);
    await until(async () => (await inputPanel.evaluate("document.getElementById('inputStateLabel').textContent")) === 'Waiting for audio');
    const connected = await inputPage.evaluate('(async()=>({id:state.liveId,input:currentInputState(),info:await window.go1.captureProtectionInfo()}))()');
    assert.equal(connected.id,fixtureId);assert.equal(connected.input,'ready');assert.equal(connected.info.activity.liveSession,true);
    return { retainedSession:true, reconnected:true, acquisition:'synthetic MediaStream; not hardware permission coverage' };
  });
  await record('Native worker exit recovers on the next speech without closing the live session', async () => {
    const entries=(await run('ps',['-axo','pid=,command='])).stdout.split('\n');
    const ids=entries.map(line=>line.trim().match(/^(\d+)\s+(.+)$/)).filter(match=>match && match[2].startsWith(native+'/whisper-server')).map(match=>Number(match[1]));
    assert.equal(ids.length,1);process.kill(ids[0],'SIGKILL');await delay(300);
    await inputPage.evaluate(`(() => { const bytes=Uint8Array.from(atob(${JSON.stringify(pcmBase64)}), c=>c.charCodeAt(0)); const pcm=new Int16Array(bytes.buffer); for(let offset=0;offset<pcm.length;offset+=3200) window.go1.sendLiveChunk(${JSON.stringify(fixtureId)},pcm.slice(offset,offset+3200)); window.go1.sendLiveChunk(${JSON.stringify(fixtureId)},new Int16Array(16000)); return true; })()`);
    const result=await until(async()=>{const value=await inputPage.evaluate('window.qaRecovered');return /deployment/i.test(value?.result?.text||'')?value.result:null;},150000);
    checkWords(result.text);assert.equal((await inputPage.evaluate('window.go1.captureProtectionInfo()')).activity.liveSession,true);
    await inputPage.evaluate('(async()=>{await stopRecording();for(const ctx of window.qaContexts) await ctx.close();return true;})()');
    assert.equal((await inputPage.evaluate('window.go1.captureProtectionInfo()')).activity.liveSession,false);
    return { recoveredTranscript:result.text, sessionRetainedUntilExplicitStop:true };
  });
  await record('OA same-window capture, green crop cursor and retained draft', async () => {
    await inputPage.evaluate("selectWorkspaceMode('oa')");
    const displays=await inputPage.evaluate('window.go1.captureDisplays()');assert.ok(displays.length>0);
    const captured=await inputPage.evaluate("window.go1.captureDisplay("+JSON.stringify(displays[0].id)+").then(x=>({width:x.width,height:x.height,valid:x.dataUrl.startsWith('data:image/png;')}))");
    assert.ok(captured.valid && captured.width>0 && captured.height>0);
    const count=(await targets()).filter(x=>x.type==='page').length;
    // A deterministic image makes crop-coordinate assertions independent of desktop contents.
    await inputPage.evaluate("(async()=>{const c=document.createElement('canvas');c.width=400;c.height=300;const x=c.getContext('2d');x.fillStyle='white';x.fillRect(0,0,400,300);x.fillStyle='red';x.fillRect(30,30,340,240);await loadOaImage(c.toDataURL());document.getElementById('oaCanvas').scrollIntoView({block:'center'});return true;})()");
    const rect=await inputPage.evaluate("(()=>{const c=document.getElementById('oaCanvas'),r=c.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,cursor:getComputedStyle(c).cursor};})()");
    assert.match(rect.cursor,/crop-cursor/);
    await inputPage.call('Input.dispatchMouseEvent',{type:'mousePressed',x:rect.x+rect.w*.1,y:rect.y+rect.h*.1,button:'left',clickCount:1});
    await inputPage.call('Input.dispatchMouseEvent',{type:'mouseMoved',x:rect.x+rect.w*.9,y:rect.y+rect.h*.9,button:'left',buttons:1});
    await inputPage.call('Input.dispatchMouseEvent',{type:'mouseReleased',x:rect.x+rect.w*.9,y:rect.y+rect.h*.9,button:'left',clickCount:1});
    const selected=await inputPage.evaluate("({crop:oa.crop,cursor:getComputedStyle(document.getElementById('oaCanvas')).cursor})");
    assert.ok(selected.crop && selected.crop.width>=318 && selected.crop.width<=322);
    assert.equal(selected.cursor,'default');
    await inputPage.evaluate("document.getElementById('oaApplyCrop').click()");
    await until(async()=> (await inputPage.evaluate('oa.image.width'))<400);
    const draft=await inputPage.evaluate("({image:oaPng(),question:document.getElementById('oaQuestion').value})");
    await inputPage.evaluate('window.go1.toggleVisibility()');
    assert.ok((await inputPage.evaluate('window.go1.visibilityInfo()')).windows.every(window=>!window.visible));
    await inputPage.evaluate('window.go1.toggleVisibility()');
    assert.deepEqual(await inputPage.evaluate("({image:oaPng(),question:document.getElementById('oaQuestion').value})"),draft);
    assert.equal((await targets()).filter(x=>x.type==='page').length,count);
    const shot=await inputPage.call('Page.captureScreenshot',{format:'png'});await fs.writeFile(path.join(output,'packaged-oa-crop.png'),Buffer.from(shot.data,'base64'));
    return {captured,selected,noAdditionalWindow:true,draftRetained:true};
  });
  await record('Real local vision model receives the reviewed crop', async () => {
    const visionModel='moondream:latest';
    await run('ollama',['pull',visionModel],{timeout:900000,maxBuffer:32*1024*1024,env:{...process.env,OLLAMA_HOST:'127.0.0.1:11434'}});
    await inputPage.evaluate("document.getElementById('oaModel').value='moondream:latest';document.getElementById('oaQuestion').value='What color is the large square in this image? Keep the answer short.';document.getElementById('oaConsent').checked=true;updateOaControls();document.getElementById('oaAsk').click();true");
    await until(async()=>!(await inputPage.evaluate('oa.running')),360000);
    const result=await inputPage.evaluate("({answer:document.getElementById('oaAnswer').textContent,status:document.getElementById('oaStatus').textContent})");
    assert.match(result.status,/Analysis complete/);assert.match(result.answer,/red/i);
    const shot=await inputPage.call('Page.captureScreenshot',{format:'png'});await fs.writeFile(path.join(output,'packaged-oa-vision.png'),Buffer.from(shot.data,'base64'));
    await inputPage.evaluate("window.go1.pauseForPresentation()");
    await until(async()=>await inputPage.evaluate("oa.image===null && document.getElementById('oaAnswer').textContent===''"));
    return {model:visionModel,...result,privacyClearedImage:true,scope:'Simple color fixture; not a coding/OCR accuracy benchmark'};
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
