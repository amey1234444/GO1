'use strict';

const path = require('node:path');
const fs = require('node:fs/promises');
const { app, BrowserWindow, ipcMain, session, systemPreferences, dialog, clipboard, desktopCapturer, globalShortcut } = require('electron');
const { randomUUID } = require('node:crypto');
const { getSetup, transcribe } = require('./transcription/engine');
const { VadLiveSession } = require('./transcription/vad-live');
const { createWorker } = require('./transcription/worker');
const { ModelManager, MODEL_CATALOG, modelState } = require('./transcription/models');
const { cancelPrivateProcessing } = require('./privacy/presentation');
const { PrivacyGate } = require('./privacy/gate');
const { PRIVACY_SHORTCUT, registerEmergencyPrivacy } = require('./privacy/shortcut');
const { analysePractice } = require('./practice/feedback');
const { prepareReview, reviewAllowed } = require('./practice/review-policy');
const { normalizeProfile, DEFAULT_PROFILE, validateTranscript } = require('./practice/session');
const { localModelStatus, generatePracticeFeedback } = require('./practice/local-coach');

app.setName('GO1');
let mainWindow;
let reviewWindow = null;
let activeController;
let liveController;
let liveSession;
let liveId;
let worker = null;
let manager = null;
let selectedModel = 'small';
let displayPermissionUntil = 0;
const privacyGate = new PrivacyGate();
let emergencyShortcutRegistered = false;
let coachController = null;
let practiceProfile = { ...DEFAULT_PROFILE };
const profilePath = () => path.join(app.getPath('userData'), 'practice-profile.json');

// Invoked synchronously by both the main-process hotkey and the UI action.
// Stop all in-flight work before asking the renderer to mask sensitive text.
function activatePresentationPrivacy(source = 'button') {
  privacyGate.enter();
  coachController?.abort();
  if (reviewWindow && !reviewWindow.isDestroyed()) reviewWindow.close();
  reviewWindow = null;
  displayPermissionUntil = 0;
  cancelPrivateProcessing({ activeController, liveController, liveSession });
  liveSession = null;
  liveController = null;
  liveId = null;
  if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
    mainWindow.webContents.send('go1:privacy-activate', { source });
  }
  return privacyGate.snapshot();
}

function shortcutInfo() {
  return { shortcut: PRIVACY_SHORTCUT, registered: emergencyShortcutRegistered, ...privacyGate.snapshot() };
}

const modelDirectory = () => path.join(app.getPath('userData'), 'models');
const configPath = () => path.join(app.getPath('userData'), 'settings.json');
async function saveSettings() {
  const file = configPath();
  const temp = file + '.tmp';
  await fs.writeFile(temp, JSON.stringify({ selectedModel }), { mode: 0o600 });
  await fs.rename(temp, file);
}
function setup() {
  const status = getSetup({ modelDirectory: modelDirectory(), selectedModel });
  return { ...status, models: modelState(modelDirectory()), selectedModel, platform: process.platform, systemAudioSupported: process.platform === 'darwin', whisperServer: require('./transcription/engine').resolveExecutable('whisper-server', process.env.GO1_WHISPER_SERVER_PATH) };
}
function getWorker() {
  if (!worker) worker = createWorker({ modelDirectory: modelDirectory(), selectedModel, vadModel: path.join(modelDirectory(), MODEL_CATALOG.silero.file) });
  return worker;
}
function resetWorker() { worker?.close(); worker = null; }

const ownWindow = event => mainWindow && !mainWindow.isDestroyed() && event.sender === mainWindow.webContents;

function createWindow() {
  mainWindow = new BrowserWindow({
    title: 'GO1 — Multilingual Transcription',
    width: 1190, height: 800, minWidth: 830, minHeight: 620,
    backgroundColor: '#0b1020',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true
    }
  });
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  mainWindow.webContents.on('did-finish-load', () => {
    if (privacyGate.paused) mainWindow.webContents.send('go1:privacy-activate', { source: 'restored' });
  });
  mainWindow.on('closed', () => { if (reviewWindow && !reviewWindow.isDestroyed()) reviewWindow.close(); reviewWindow = null; activeController?.abort(); liveController?.abort(); liveSession?.cancel(); liveSession = null; mainWindow = null; });
}

app.whenReady().then(async () => {
  try {
    const prefs = JSON.parse(await fs.readFile(configPath(), 'utf8'));
    if (Object.prototype.hasOwnProperty.call(MODEL_CATALOG, prefs.selectedModel) && prefs.selectedModel !== 'silero') selectedModel = prefs.selectedModel;
  } catch { /* defaults on fresh install */ }
  try {
    const file = await fs.readFile(profilePath(), 'utf8');
    if (file.length <= 16000) practiceProfile = normalizeProfile(JSON.parse(file));
  } catch { /* A missing or invalid local profile uses safe defaults. */ }
  manager = new ModelManager({ directory: modelDirectory(), onProgress: data => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('go1:model-progress', data);
  } });
  session.defaultSession.setDisplayMediaRequestHandler(async (request, callback) => {
    if (request.securityOrigin && !request.securityOrigin.startsWith('file://')) return callback(null);
    if (privacyGate.paused || Date.now() > displayPermissionUntil || (request.frame !== mainWindow?.webContents.mainFrame && request.frame?.top !== mainWindow?.webContents.mainFrame)) return callback(null);
    displayPermissionUntil = 0; // one user action authorizes one prompt
    try {
      const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 0, height: 0 } });
      if (privacyGate.paused || !sources.length) return callback(null);
      return callback({ video: sources[0], audio: 'loopback' });
    } catch { callback(null); }
  }, { useSystemPicker: false });

  session.defaultSession.setPermissionRequestHandler((contents, permission, callback, details) => {
    const types = details.mediaTypes || [];
    callback(!privacyGate.paused && permission === 'media' && contents === mainWindow?.webContents && !types.includes('video'));
  });
  session.defaultSession.setPermissionCheckHandler((contents, permission, origin, details) => {
    return !privacyGate.paused && permission === 'media' && contents === mainWindow?.webContents && !details.mediaType?.includes('video');
  });
  createWindow();
  emergencyShortcutRegistered = registerEmergencyPrivacy(globalShortcut, activatePresentationPrivacy);
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('before-quit', () => { coachController?.abort(); activeController?.abort(); liveController?.abort(); liveSession?.cancel(); manager?.cancel(); resetWorker(); });

function onlyApp(event) { if (!ownWindow(event)) throw new Error('Unrecognized request origin.'); }
ipcMain.handle('go1:privacy-info', event => { onlyApp(event); return shortcutInfo(); });
ipcMain.handle('go1:privacy-resume', event => {
  onlyApp(event);
  privacyGate.exit();
  return shortcutInfo();
});

ipcMain.handle('go1:setup', event => {
  onlyApp(event);
  return setup();
});

ipcMain.handle('go1:microphone', async event => {
  onlyApp(event);
  const ticket = privacyGate.ticket();
  if (process.platform !== 'darwin') return true;
  const existing = systemPreferences.getMediaAccessStatus('microphone');
  if (existing === 'granted') return true;
  if (existing === 'denied' || existing === 'restricted') return false;
  const granted = await systemPreferences.askForMediaAccess('microphone');
  privacyGate.validate(ticket);
  return granted;
});

ipcMain.handle('go1:transcribe', async (event, payload) => {
  onlyApp(event);
  privacyGate.assertAllowed();
  if (activeController) throw new Error('A transcription is already in progress.');
  const controller = new AbortController();
  activeController = controller;
  try {
    return await transcribe(payload, {
      modelDirectory: modelDirectory(), selectedModel,
      signal: controller.signal,
      onStage: message => {
        if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('go1:stage', message);
      }
    });
  } finally {
    if (activeController === controller) activeController = null;
  }
});

ipcMain.handle('go1:cancel', event => { onlyApp(event); activeController?.abort(); return true; });
ipcMain.handle('go1:copy', (event, text) => {
  onlyApp(event);
  if (typeof text !== 'string' || text.length > 5000000) throw new Error('Invalid clipboard text.');
  clipboard.writeText(text);
  return true;
});
ipcMain.handle('go1:save', async (event, { format, content }) => {
  onlyApp(event);
  if (!['txt', 'json', 'srt', 'vtt'].includes(format) || typeof content !== 'string' || content.length > 5000000) throw new Error('Invalid export data.');
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    title: 'Export transcription',
    defaultPath: `GO1-transcript.${format}`,
    filters: [{ name: format.toUpperCase(), extensions: [format] }]
  });
  if (canceled || !filePath) return false;
  await fs.writeFile(filePath, content, { encoding: 'utf8', flag: 'w' });
  return true;
});


ipcMain.handle('go1:live-start', async (event, options = {}) => {
  onlyApp(event);
  const privacyTicket = privacyGate.ticket();
  if (liveSession || activeController) throw new Error('Finish the current session first.');
  const language = String(options.language || 'auto').toLowerCase();
  const latencyMode = options.latencyMode === 'fast' ? 'fast' : 'balanced';
  if (!/^(auto|[a-z]{2,3})$/.test(language)) throw new Error('Invalid language code.');
  if (!setup().modelFound || !setup().whisperServer) throw new Error('Install whisper-server and the selected multilingual model first.');
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('go1:stage', 'Loading Whisper model in persistent worker...');
  await getWorker().ensureReady();
  privacyGate.validate(privacyTicket);
  liveController = new AbortController();
  liveId = randomUUID();
  liveSession = new VadLiveSession({
    language,
    latencyMode,
    translate: options.translate === true,
    signal: liveController.signal,
    transcribeWindow: (pcm, opts) => getWorker().infer(pcm, opts),
    onUpdate: result => { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('go1:live-update', { id: liveId, result }); },
    onStatus: status => { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('go1:live-status', { id: liveId, status }); }
  });
  return liveId;
});

ipcMain.on('go1:live-frame', (event, { id, pcm } = {}) => {
  if (!ownWindow(event) || privacyGate.paused || !liveSession || id !== liveId) return;
  try {
    liveSession.append(pcm);
  } catch (error) {
    liveSession.cancel();
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('go1:live-status', { id, status: { type: 'error', message: error.message } });
  }
});

ipcMain.handle('go1:live-stop', async (event, id) => {
  onlyApp(event);
  if (!liveSession || id !== liveId) throw new Error('No matching live session.');
  const sessionToStop = liveSession;
  try { return await sessionToStop.stop(); }
  finally {
    if (liveSession === sessionToStop) {
      liveSession = null;
      liveController = null;
      liveId = null;
    }
  }
});
ipcMain.handle('go1:live-cancel', (event, id) => {
  onlyApp(event);
  if (liveSession && id === liveId) {
    liveController?.abort();
    liveSession.cancel();
    liveSession = null;
    liveController = null;
    liveId = null;
  }
  return true;
});


ipcMain.handle('go1:model-install', async (event, id) => {
  onlyApp(event);
  if (activeController || liveSession) throw new Error('Stop transcription before installing models.');
  if (!manager) throw new Error('Model manager unavailable.');
  return manager.install(id);
});
ipcMain.handle('go1:model-cancel', event => { onlyApp(event); manager?.cancel(); return true; });
ipcMain.handle('go1:model-select', async (event, id) => {
  onlyApp(event);
  if (!Object.prototype.hasOwnProperty.call(MODEL_CATALOG, id) || id === 'silero') throw new Error('Invalid model.');
  if (liveSession || activeController || manager?.controller) throw new Error('Stop other operations first.');
  if (!modelState(modelDirectory())[id].installed) throw new Error('Download this model before selecting it.');
  selectedModel = id;
  resetWorker();
  await saveSettings();
  return setup();
});
ipcMain.handle('go1:prepare-system-audio', event => {
  onlyApp(event);
  privacyGate.assertAllowed();
  if (process.platform !== 'darwin') throw new Error('System audio capture is only supported on macOS in GO1.');
  displayPermissionUntil = Date.now() + 15000;
  return true;
});

// A single fail-closed main-process gate is shared by button and global shortcut.
ipcMain.handle('go1:privacy-pause', event => {
  onlyApp(event);
  return activatePresentationPrivacy('button');
});


// Deliberately ordinary and visible: not always-on-top, not capture-excluded, no hidden input.
// Only completed, consent-based practice results may appear in this separate window.
ipcMain.handle('go1:review-open', async (event, result) => {
  onlyApp(event);
  privacyGate.assertAllowed();
  if (!reviewAllowed({ paused: privacyGate.paused, activeTranscription: Boolean(activeController), liveSession: Boolean(liveSession) })) {
    throw new Error('Stop recording and finish transcription before opening a review.');
  }
  const data = prepareReview(result);
  if (reviewWindow && !reviewWindow.isDestroyed()) reviewWindow.close();
  const window = new BrowserWindow({
    title: 'GO1 — Practice review',
    width: 540, height: 650, minWidth: 390, minHeight: 420,
    parent: mainWindow,
    modal: false,
    show: false,
    backgroundColor: '#11182c',
    webPreferences: {
      preload: path.join(__dirname, 'renderer', 'review-preload.js'),
      contextIsolation: true, sandbox: true, nodeIntegration: false, webSecurity: true
    }
  });
  reviewWindow = window;
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  window.webContents.once('did-finish-load', () => {
    if (privacyGate.paused || window.isDestroyed()) { if (!window.isDestroyed()) window.close(); return; }
    window.webContents.send('go1:review-data', data);
    window.show();
  });
  window.on('closed', () => { if (reviewWindow === window) reviewWindow = null; });
  try { await window.loadFile(path.join(__dirname, 'renderer', 'review.html')); }
  catch (error) { if (!window.isDestroyed()) window.close(); throw error; }
  return true;
});

// A practice profile is stored only in this user's app data; it is not uploaded.
ipcMain.handle('go1:practice-profile-get', event => { onlyApp(event); return { ...practiceProfile }; });
ipcMain.handle('go1:practice-profile-save', async (event, profile) => {
  onlyApp(event);
  privacyGate.assertAllowed();
  if (liveSession || activeController) throw new Error('Finish the recording before changing interview context.');
  const next = normalizeProfile(profile);
  const dest = profilePath(), tmp = dest + '.tmp';
  await fs.writeFile(tmp, JSON.stringify(next), { encoding: 'utf8', mode: 0o600 });
  await fs.rename(tmp, dest);
  practiceProfile = next;
  return { ...next };
});
ipcMain.handle('go1:coach-status', async event => {
  onlyApp(event);
  privacyGate.assertAllowed();
  const ticket = privacyGate.ticket();
  const status = await localModelStatus();
  privacyGate.validate(ticket);
  return status;
});
ipcMain.handle('go1:coach-feedback', async (event, transcript) => {
  onlyApp(event);
  const ticket = privacyGate.ticket();
  if (liveSession || activeController || coachController) throw new Error('Finish recording and processing before requesting practice feedback.');
  const text = validateTranscript(transcript);
  const controller = new AbortController();
  coachController = controller;
  const id = randomUUID();
  try {
    const feedback = await generatePracticeFeedback({
      profile: practiceProfile,
      transcript: text,
      signal: controller.signal,
      onChunk: delta => {
        if (!privacyGate.paused && privacyGate.isCurrent(ticket) && mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('go1:coach-chunk', { id, delta });
        }
      }
    });
    privacyGate.validate(ticket);
    return { id, feedback };
  } finally { if (coachController === controller) coachController = null; }
});
ipcMain.handle('go1:coach-cancel', event => {
  onlyApp(event);
  coachController?.abort();
  return true;
});

// Local-only deterministic practice statistics; no model provider or external service.
ipcMain.handle('go1:practice-review', (event, result) => {
  onlyApp(event);
  if (!result || typeof result !== 'object' || typeof result.text !== 'string' || result.text.length > 250000) throw new Error('Invalid practice transcript.');
  return analysePractice({ text: result.text, durationMs: result.durationMs });
});
