'use strict';

const path = require('node:path');
const fs = require('node:fs/promises');
const { app, BrowserWindow, ipcMain, session, systemPreferences, dialog, clipboard, desktopCapturer, globalShortcut, screen, powerMonitor } = require('electron');
const { randomUUID } = require('node:crypto');
const { getSetup, transcribe } = require('./transcription/engine');
const { VadLiveSession } = require('./transcription/vad-live');
const { CaptureDiagnostics } = require('./audio/diagnostics');
const { createWorker } = require('./transcription/worker');
const { ModelManager, MODEL_CATALOG, modelState } = require('./transcription/models');
const { cancelPrivateProcessing } = require('./privacy/presentation');
const { PrivacyGate } = require('./privacy/gate');
const { ContentProtection } = require('./privacy/content-protection');
const { LiveDock } = require('./privacy/live-dock');
const { companionWindowOptions, configureCompanionWindow, refreshCompanionWindow } = require('./privacy/companion-window');
const { PRIVACY_SHORTCUT, registerEmergencyPrivacy } = require('./privacy/shortcut');
const { analysePractice } = require('./practice/feedback');
const { prepareReview, reviewAllowed } = require('./practice/review-policy');
const { normalizeProfile, DEFAULT_PROFILE, validateTranscript } = require('./practice/session');
const { localModelStatus, generatePracticeFeedback } = require('./practice/local-coach');
const { generateLiveGuidance } = require('./practice/live-assist');
const { freshCompanionState, updateTranscript, updateQuestion, addGuidance, opacityFromInput } = require('./companion/state');
const { companionBounds, companionPreferences } = require('./companion/layout');

app.setName('GO1');
const ownsInstance = app.requestSingleInstanceLock();
if (!ownsInstance) app.quit();
let workspaceReady = false;
let quitAfterSettings = false;
app.on('second-instance', () => revealWorkspace());
let mainWindow;
let reviewWindow = null;
let companionWindow = null;
let companionState = null;
let companionCompact = false;
let companionOpacity = 0.86;
let companionPlacement = null;
let placementSaveTimer = null;
let activeController;
let liveController;
let liveSession;
let liveId;
let liveStarting = null;
let captureDiagnostics = null;
let worker = null;
let manager = null;
let selectedModel = 'small';
let displayPermissionUntil = 0;
const privacyGate = new PrivacyGate();
const contentProtection = new ContentProtection({ platform: process.platform });
const liveDock = new LiveDock({ app, platform: process.platform, onChange: () => {
  // Reapply the existing preference after macOS activation-policy changes.
  contentProtection.setEnabled(contentProtection.enabled);
  publishProtection();
} });
let emergencyShortcutRegistered = false;
let coachController = null;
let assistController = null;
let assistPermitted = false;
let practiceProfile = { ...DEFAULT_PROFILE };
const profilePath = () => path.join(app.getPath('userData'), 'practice-profile.json');

function closeCompanion(clear = true) {
  const openWindow = companionWindow;
  companionWindow = null;
  void liveDock.setCompanionOpen(false);
  if (clear) companionState = null; // Stop/privacy clears data; closing just the panel keeps the live session.
  if (openWindow && !openWindow.isDestroyed()) openWindow.close();
}
function publishCompanion() {
  if (companionWindow && !companionWindow.isDestroyed() && companionState && !privacyGate.paused) {
    companionWindow.webContents.send('go1:companion-snapshot', { ...companionState, compact: companionCompact, surfaceOpacity: companionOpacity, captureProtection: protectionInfo() });
  }
}
function protectionInfo() {
  return { ...contentProtection.snapshot(), presentation: liveDock.snapshot(), activity: {
    liveSession: Boolean(liveSession), aiEnabled: Boolean(liveSession && assistPermitted),
    aiRunning: Boolean(assistController), paused: privacyGate.paused
  } };
}
function publishProtection() {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('go1:content-protection-changed', protectionInfo());
  publishCompanion();
}
function rememberCompanionPlacement(window, immediate = false) {
  if (window.isDestroyed()) return;
  companionPlacement = window.getBounds();
  clearTimeout(placementSaveTimer);
  const save = () => { placementSaveTimer = null; void saveSettings().catch(() => console.warn('Could not save companion placement.')); };
  if (immediate) save();
  else { placementSaveTimer = setTimeout(save, 250); placementSaveTimer.unref?.(); }
}
function recoverPresentation() {
  // Reassert only the user's existing preference; never start audio or exit Stop & mask.
  contentProtection.setEnabled(contentProtection.enabled);
  if (companionWindow && !companionWindow.isDestroyed() && !privacyGate.paused) {
    const current = companionWindow.getBounds();
    const next = companionBounds(screen.getDisplayMatching(current).workArea, companionCompact, current);
    if (Object.keys(next).some(key => next[key] !== current[key])) companionWindow.setBounds(next);
    refreshCompanionWindow(companionWindow, process.platform);
    rememberCompanionPlacement(companionWindow);
  }
  void liveDock.refresh();
  publishProtection();
}
function revealWorkspace() {
  if (!workspaceReady) return;
  void liveDock.showWorkspace().then(() => {
    if (!mainWindow || mainWindow.isDestroyed()) createWindow();
    else { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.show(); mainWindow.focus(); }
  });
}
async function openCompanion() {
  privacyGate.assertAllowed();
  if (!liveSession || !liveId) throw new Error('Start a live session first.');
  if (companionWindow && !companionWindow.isDestroyed()) {
    await liveDock.setCompanionOpen(true);
    if (!companionWindow || companionWindow.isDestroyed() || privacyGate.paused) return false;
    companionWindow.show(); companionWindow.focus(); publishCompanion(); return true;
  }
  const window = new BrowserWindow({
    title: 'GO1 — Live Companion',
    ...companionBounds((companionPlacement ? screen.getDisplayMatching(companionPlacement) : screen.getPrimaryDisplay()).workArea, companionCompact, companionPlacement),
    show: false, opacity: 1, backgroundColor: '#00000000',
    ...companionWindowOptions(process.platform),
    // Capture protection is applied below before the first show.
    webPreferences: {
      preload: path.join(__dirname, 'renderer', 'companion-preload.js'),
      backgroundThrottling: false,
      contextIsolation: true, sandbox: true, nodeIntegration: false, webSecurity: true
    }
  });
  contentProtection.register(window, 'companion');
  configureCompanionWindow(window, process.platform);
  companionWindow = window;
  window.on('move', () => rememberCompanionPlacement(window));
  window.on('close', () => rememberCompanionPlacement(window, true));
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  window.webContents.once('did-finish-load', () => {
    if (privacyGate.paused || !liveSession || companionWindow !== window || window.isDestroyed()) {
      if (!window.isDestroyed()) window.close(); return;
    }
    publishCompanion();
    if (process.platform === 'darwin') window.showInactive();
    else window.show();
  });
  window.on('closed', () => { if (companionWindow === window) { companionWindow = null; void liveDock.setCompanionOpen(false); } });
  try { await window.loadFile(path.join(__dirname, 'renderer', 'companion.html')); }
  catch (error) { if (!window.isDestroyed()) window.close(); throw error; }
  if (companionWindow === window && !privacyGate.paused) await liveDock.setCompanionOpen(true);
  return true;
}
function companionOnly(event) {
  if (!companionWindow || companionWindow.isDestroyed() || event.sender !== companionWindow.webContents) throw new Error('Unrecognized companion window.');
}
ipcMain.handle('go1:companion-open', async event => { onlyApp(event); return openCompanion(); });
ipcMain.handle('go1:companion-question', (event, text) => {
  onlyApp(event);
  if (privacyGate.paused || !liveSession || !companionState) return false;
  companionState = updateQuestion(companionState, text); publishCompanion(); return true;
});
ipcMain.handle('go1:companion-close', event => {
  companionOnly(event);
  closeCompanion(false); return true;
});
ipcMain.handle('go1:companion-focus-main', async event => {
  companionOnly(event);
  await liveDock.showWorkspace();
  if (mainWindow && !mainWindow.isDestroyed()) { mainWindow.show(); mainWindow.focus(); }
  return true;
});
ipcMain.handle('go1:companion-opacity', async (event, value) => {
  companionOnly(event);
  const opacity = opacityFromInput(value);
  companionOpacity = opacity; publishCompanion(); // Surface alpha only; text stays opaque.
  await saveSettings();
  return opacity;
});
ipcMain.handle('go1:companion-compact', async (event, compact) => {
  companionOnly(event);
  if (typeof compact !== 'boolean') throw new Error('Expected compact boolean.');
  const bounds = companionWindow.getBounds();
  companionCompact = compact;
  companionWindow.setBounds(companionBounds(screen.getDisplayMatching(bounds).workArea, compact, bounds));
  companionPlacement = companionWindow.getBounds();
  await saveSettings();
  publishCompanion(); return compact;
});
ipcMain.handle('go1:companion-assist', (event, question) => {
  companionOnly(event);
  return generateSessionGuidance({ question, context: liveSession?.snapshot().text?.slice(-10000) || '' });
});
ipcMain.handle('go1:companion-privacy', event => {
  companionOnly(event);
  activatePresentationPrivacy('companion');
  return true;
});


// Invoked synchronously by both the main-process hotkey and the UI action.
// Stop all in-flight work before asking the renderer to mask sensitive text.
function activatePresentationPrivacy(source = 'button') {
  privacyGate.enter();
  liveStarting = null;
  coachController?.abort();
  assistController?.abort();
  assistPermitted = false;
  closeCompanion();
  if (reviewWindow && !reviewWindow.isDestroyed()) reviewWindow.close();
  reviewWindow = null;
  displayPermissionUntil = 0;
  cancelPrivateProcessing({ activeController, liveController, liveSession });
  liveSession = null;
  liveController = null;
  liveId = null;
  captureDiagnostics = null;
  publishProtection();
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
let settingsWrite = Promise.resolve();
function saveSettings() {
  const settings = JSON.stringify({ selectedModel, captureProtection: contentProtection.enabled, hideDockDuringLive: liveDock.enabled,
    companion: { compact: companionCompact, surfaceOpacity: companionOpacity, bounds: companionPlacement } });
  settingsWrite = settingsWrite.catch(() => {}).then(async () => {
    const file = configPath();
    const temp = file + '.tmp';
    await fs.writeFile(temp, settings, { mode: 0o600 });
    await fs.rename(temp, file);
  });
  return settingsWrite;
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

function closeWorkspaceSession() {
  // Invalidate pending startup before aborting work; macOS can reopen this workspace.
  liveStarting = null;
  coachController?.abort();
  assistController?.abort();
  activeController?.abort();
  liveController?.abort();
  liveSession?.cancel();
  liveSession = liveController = liveId = captureDiagnostics = null;
  assistPermitted = false;
  displayPermissionUntil = 0;
  closeCompanion();
  if (reviewWindow && !reviewWindow.isDestroyed()) reviewWindow.close();
  reviewWindow = null;
  resetWorker();
}

const ownWindow = event => mainWindow && !mainWindow.isDestroyed() && event.sender === mainWindow.webContents;

function createWindow() {
  mainWindow = new BrowserWindow({
    title: 'GO1 — Multilingual Transcription',
    width: 1190, height: 800, minWidth: 830, minHeight: 620,
    show: false,
    backgroundColor: '#0b1020',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      backgroundThrottling: false,
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true
    }
  });
  contentProtection.register(mainWindow, 'workspace');
  mainWindow.once('ready-to-show', () => { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.show(); });
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  mainWindow.webContents.on('did-finish-load', () => {
    if (privacyGate.paused) mainWindow.webContents.send('go1:privacy-activate', { source: 'restored' });
  });
  mainWindow.on('closed', () => { closeWorkspaceSession(); mainWindow = null; });
}

if (ownsInstance) app.whenReady().then(async () => {
  try {
    const prefs = JSON.parse(await fs.readFile(configPath(), 'utf8'));
    if (Object.prototype.hasOwnProperty.call(MODEL_CATALOG, prefs.selectedModel) && prefs.selectedModel !== 'silero') selectedModel = prefs.selectedModel;
    if (typeof prefs.captureProtection === 'boolean') contentProtection.setEnabled(prefs.captureProtection);
    if (typeof prefs.hideDockDuringLive === 'boolean') liveDock.enabled = prefs.hideDockDuringLive;
    const saved = companionPreferences(prefs.companion);
    companionCompact = saved.compact; companionOpacity = saved.surfaceOpacity; companionPlacement = saved.bounds;
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
  workspaceReady = true;
  createWindow();
  emergencyShortcutRegistered = registerEmergencyPrivacy(globalShortcut, activatePresentationPrivacy);
  app.on('activate', revealWorkspace);
  app.on('did-become-active', () => { if (liveDock.requestedHidden) void liveDock.refresh(); });
  for (const event of ['display-added', 'display-removed', 'display-metrics-changed']) screen.on(event, recoverPresentation);
  for (const event of ['resume', 'unlock-screen']) powerMonitor.on(event, recoverPresentation);
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('before-quit', event => {
  closeWorkspaceSession(); manager?.cancel();
  clearTimeout(placementSaveTimer);
  if (ownsInstance && !quitAfterSettings) {
    event.preventDefault(); quitAfterSettings = true;
    void saveSettings().catch(() => console.warn('Could not save settings before quit.')).finally(() => app.quit());
  }
});

function onlyApp(event) { if (!ownWindow(event)) throw new Error('Unrecognized request origin.'); }
ipcMain.handle('go1:content-protection-info', event => { onlyApp(event); return protectionInfo(); });
ipcMain.handle('go1:live-dock-set', async (event, enabled) => {
  onlyApp(event);
  await liveDock.setEnabled(enabled);
  await saveSettings();
  publishProtection();
  return protectionInfo();
});
ipcMain.handle('go1:content-protection-set', async (event, enabled) => {
  onlyApp(event);
  contentProtection.setEnabled(enabled);
  publishProtection();
  await saveSettings();
  return protectionInfo();
});
ipcMain.handle('go1:privacy-info', event => { onlyApp(event); return shortcutInfo(); });
ipcMain.handle('go1:privacy-resume', event => {
  onlyApp(event);
  privacyGate.exit();
  publishProtection();
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
  if (activeController || liveSession || liveStarting) throw new Error('Finish the current session first.');
  const controller = new AbortController();
  activeController = controller;
  try {
    return await transcribe(payload, {
      modelDirectory: modelDirectory(), selectedModel,
      signal: controller.signal,
      onStage: message => {
        if (!controller.signal.aborted && !privacyGate.paused && mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('go1:stage', message);
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
  if (liveSession || liveStarting || activeController) throw new Error('Finish the current session first.');
  const language = String(options.language || 'auto').toLowerCase();
  const audioSource = options.audioSource || 'microphone';
  if (!['microphone', 'system'].includes(audioSource)) throw new Error('Invalid audio source.');
  const latencyMode = options.latencyMode === 'fast' ? 'fast' : 'balanced';
  if (!/^(auto|[a-z]{2,3})$/.test(language)) throw new Error('Invalid language code.');
  if (!setup().modelFound || !setup().whisperServer) throw new Error('Install whisper-server and the selected multilingual model first.');
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('go1:stage', 'Loading Whisper model in persistent worker...');
  const startup = {};
  liveStarting = startup;
  let sessionWorker;
  try {
    sessionWorker = getWorker();
    await sessionWorker.ensureReady();
    privacyGate.validate(privacyTicket);
    if (liveStarting !== startup || !ownWindow(event)) throw new Error('Session startup cancelled.');
  } catch (error) {
    if (liveStarting === startup && worker === sessionWorker) resetWorker();
    throw error;
  } finally {
    if (liveStarting === startup) liveStarting = null;
  }
  assistPermitted = options.assistancePermitted === true;
  liveController = new AbortController();
  const sessionId = randomUUID();
  liveId = sessionId;
  captureDiagnostics = new CaptureDiagnostics({ source: audioSource });
  liveSession = new VadLiveSession({
    language,
    latencyMode,
    translate: options.translate === true,
    signal: liveController.signal,
    transcribeWindow: (pcm, opts) => sessionWorker.infer(pcm, opts),
    onUpdate: result => {
      if (liveId !== sessionId || privacyGate.paused) return;
      if (companionState && !privacyGate.paused) { companionState = updateTranscript(companionState, result.text || ''); publishCompanion(); }
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('go1:live-update', { id: sessionId, result });
    },
    onStatus: status => { if (liveId === sessionId && !privacyGate.paused && mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('go1:live-status', { id: sessionId, status }); }
  });
  companionState = freshCompanionState({ role: practiceProfile.role, language, sessionId: liveId, assistancePermitted: assistPermitted });
  try { await openCompanion(); } catch (error) { console.warn('Companion window unavailable:', error.message); }
  publishProtection();
  if (liveId !== sessionId || privacyGate.paused) throw new Error('Session startup cancelled.');
  return sessionId;
});

ipcMain.on('go1:live-frame', (event, { id, pcm } = {}) => {
  if (!ownWindow(event) || privacyGate.paused || !liveSession || !captureDiagnostics || id !== liveId) return;
  try {
    // Normalize Int16Array from AudioWorklet to PCM16 bytes required by VAD.
    const bytes = captureDiagnostics.ingest(pcm);
    liveSession.append(bytes);
    if (captureDiagnostics.shouldPublish() && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('go1:audio-health', { id, health: captureDiagnostics.snapshot() });
    }
  } catch (error) {
    liveSession.cancel();
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('go1:live-status', { id, status: { type: 'error', message: error.message } });
  }
});

ipcMain.handle('go1:live-stop', async (event, id) => {
  onlyApp(event);
  if (!liveSession || id !== liveId) throw new Error('No matching live session.');
  assistController?.abort(); assistPermitted = false;
  closeCompanion();
  captureDiagnostics = null;
  const sessionToStop = liveSession;
  try { return await sessionToStop.stop(); }
  finally {
    if (liveSession === sessionToStop) {
      liveSession = null;
      liveController = null;
      liveId = null;
      publishProtection();
    }
  }
});
ipcMain.handle('go1:live-cancel', (event, id) => {
  onlyApp(event);
  if (!liveSession || id !== liveId) return false;
  assistController?.abort(); assistPermitted = false;
  closeCompanion();
  captureDiagnostics = null;
  if (liveSession && id === liveId) {
    liveController?.abort();
    liveSession.cancel();
    liveSession = null;
    liveController = null;
    liveId = null;
    publishProtection();
  }
  return true;
});


ipcMain.handle('go1:model-install', async (event, id) => {
  onlyApp(event);
  if (activeController || liveSession || liveStarting) throw new Error('Stop transcription before installing models.');
  if (!manager) throw new Error('Model manager unavailable.');
  return manager.install(id);
});
ipcMain.handle('go1:model-cancel', event => { onlyApp(event); manager?.cancel(); return true; });
ipcMain.handle('go1:model-select', async (event, id) => {
  onlyApp(event);
  if (!Object.prototype.hasOwnProperty.call(MODEL_CATALOG, id) || id === 'silero') throw new Error('Invalid model.');
  if (liveSession || liveStarting || activeController || manager?.controller) throw new Error('Stop other operations first.');
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


// Completed practice review uses the same capture-protection policy as other windows.
// Only completed, consent-based practice results may appear in this separate window.
ipcMain.handle('go1:review-open', async (event, result) => {
  onlyApp(event);
  privacyGate.assertAllowed();
  if (!reviewAllowed({ paused: privacyGate.paused, activeTranscription: Boolean(activeController), liveSession: Boolean(liveSession || liveStarting) })) {
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
  contentProtection.register(window, 'review');
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
  if (liveSession || liveStarting || activeController) throw new Error('Finish the recording before changing interview context.');
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
  if (liveSession || liveStarting || activeController || coachController) throw new Error('Finish recording and processing before requesting practice feedback.');
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
        if (!controller.signal.aborted && !privacyGate.paused && privacyGate.snapshot().epoch === ticket && mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('go1:coach-chunk', { id, delta });
        }
      }
    });
    privacyGate.validate(ticket);
    if (controller.signal.aborted) throw new Error('Practice feedback cancelled.');
    return { id, feedback };
  } finally { if (coachController === controller) coachController = null; }
});
ipcMain.handle('go1:coach-cancel', event => {
  onlyApp(event);
  coachController?.abort();
  return true;
});

// Explicitly triggered and visible: authorized AI assistance during a consented meeting.
// Never automatically answer incoming audio or run while presentation privacy is active.
ipcMain.handle('go1:assist-generate', async (event, { question, context } = {}) => {
  onlyApp(event);
  return generateSessionGuidance({ question, context });
});
async function generateSessionGuidance({ question, context } = {}) {
  const ticket = privacyGate.ticket();
  if (!liveSession || !assistPermitted) throw new Error('Start a permitted live session and enable AI guidance first.');
  if (assistController || coachController) throw new Error('A local AI request is already running.');
  if (typeof question !== 'string' || question.length < 4 || question.length > 2000) throw new Error('Invalid question.');
  if (typeof context !== 'string' || context.length > 12000) throw new Error('Invalid live transcript context.');
  const controller = new AbortController();
  assistController = controller;
  const sessionId = liveId;
  publishProtection();
  const id = randomUUID();
  if (companionState) {
    companionState = { ...updateQuestion(companionState, question), guidance: '', status: 'Generating local talking points...' };
    publishCompanion();
  }
  try {
    const guidance = await generateLiveGuidance({
      profile: practiceProfile, question, context,
      signal: controller.signal,
      onChunk: delta => {
        if (liveId === sessionId && !controller.signal.aborted && !privacyGate.paused && privacyGate.snapshot().epoch === ticket && mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('go1:assist-chunk', { id, delta });
          if (companionState) { companionState = addGuidance(companionState, delta); publishCompanion(); }
        }
      }
    });
    privacyGate.validate(ticket);
    if (controller.signal.aborted || liveId !== sessionId || !liveSession || !assistPermitted) throw new Error('Session stopped before guidance completed.');
    if (companionState) { companionState = { ...companionState, status: 'Guidance complete. Verify facts before use.' }; publishCompanion(); }
    return { id, guidance };
  } catch (error) {
    if (liveId === sessionId && companionState && !privacyGate.paused) { companionState = { ...companionState, status: error.message || 'Guidance failed.' }; publishCompanion(); }
    throw error;
  } finally { if (assistController === controller) { assistController = null; publishProtection(); } }
}
ipcMain.handle('go1:assist-cancel', event => {
  onlyApp(event); assistController?.abort();
  if (companionState) { companionState = { ...companionState, status: 'Guidance cancelled.' }; publishCompanion(); }
  return true;
});

// Local-only deterministic practice statistics; no model provider or external service.
ipcMain.handle('go1:practice-review', (event, result) => {
  onlyApp(event);
  if (!result || typeof result !== 'object' || typeof result.text !== 'string' || result.text.length > 250000) throw new Error('Invalid practice transcript.');
  return analysePractice({ text: result.text, durationMs: result.durationMs });
});
