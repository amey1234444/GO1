'use strict';

const path = require('node:path');
const fs = require('node:fs/promises');
const { app, BrowserWindow, ipcMain, session, systemPreferences, dialog, clipboard, desktopCapturer } = require('electron');
const { randomUUID } = require('node:crypto');
const { getSetup, transcribe } = require('./transcription/engine');
const { VadLiveSession } = require('./transcription/vad-live');
const { createWorker } = require('./transcription/worker');
const { ModelManager, MODEL_CATALOG, modelState } = require('./transcription/models');
const { cancelPrivateProcessing } = require('./privacy/presentation');

app.setName('GO1');
let mainWindow;
let activeController;
let liveController;
let liveSession;
let liveId;
let worker = null;
let manager = null;
let selectedModel = 'small';
let displayPermissionUntil = 0;
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
  return { ...status, models: modelState(modelDirectory()), selectedModel, whisperServer: require('./transcription/engine').resolveExecutable('whisper-server', process.env.GO1_WHISPER_SERVER_PATH) };
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
  mainWindow.on('closed', () => { activeController?.abort(); liveController?.abort(); liveSession?.cancel(); liveSession = null; mainWindow = null; });
}

app.whenReady().then(async () => {
  try {
    const prefs = JSON.parse(await fs.readFile(configPath(), 'utf8'));
    if (Object.prototype.hasOwnProperty.call(MODEL_CATALOG, prefs.selectedModel) && prefs.selectedModel !== 'silero') selectedModel = prefs.selectedModel;
  } catch { /* defaults on fresh install */ }
  manager = new ModelManager({ directory: modelDirectory(), onProgress: data => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('go1:model-progress', data);
  } });
  session.defaultSession.setDisplayMediaRequestHandler(async (request, callback) => {
    if (request.securityOrigin && !request.securityOrigin.startsWith('file://')) return callback(null);
    if (Date.now() > displayPermissionUntil || (request.frame !== mainWindow?.webContents.mainFrame && request.frame?.top !== mainWindow?.webContents.mainFrame)) return callback(null);
    displayPermissionUntil = 0; // one user action authorizes one prompt
    try {
      const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 0, height: 0 } });
      if (!sources.length) return callback(null);
      return callback({ video: sources[0], audio: 'loopback' });
    } catch { callback(null); }
  }, { useSystemPicker: false });

  session.defaultSession.setPermissionRequestHandler((contents, permission, callback, details) => {
    const types = details.mediaTypes || [];
    callback(permission === 'media' && contents === mainWindow?.webContents && !types.includes('video'));
  });
  session.defaultSession.setPermissionCheckHandler((contents, permission, origin, details) => {
    return permission === 'media' && contents === mainWindow?.webContents && !details.mediaType?.includes('video');
  });
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('before-quit', () => { activeController?.abort(); liveController?.abort(); liveSession?.cancel(); manager?.cancel(); resetWorker(); });

function onlyApp(event) { if (!ownWindow(event)) throw new Error('Unrecognized request origin.'); }
ipcMain.handle('go1:setup', event => {
  onlyApp(event);
  return setup();
});

ipcMain.handle('go1:microphone', async event => {
  onlyApp(event);
  if (process.platform !== 'darwin') return true;
  const existing = systemPreferences.getMediaAccessStatus('microphone');
  if (existing === 'granted') return true;
  if (existing === 'denied' || existing === 'restricted') return false;
  return systemPreferences.askForMediaAccess('microphone');
});

ipcMain.handle('go1:transcribe', async (event, payload) => {
  onlyApp(event);
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
  if (liveSession || activeController) throw new Error('Finish the current session first.');
  const language = String(options.language || 'auto').toLowerCase();
  if (!/^(auto|[a-z]{2,3})$/.test(language)) throw new Error('Invalid language code.');
  if (!setup().modelFound || !setup().whisperServer) throw new Error('Install whisper-server and the selected multilingual model first.');
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('go1:stage', 'Loading Whisper model in persistent worker...');
  await getWorker().ensureReady();
  liveController = new AbortController();
  liveId = randomUUID();
  liveSession = new VadLiveSession({
    language,
    translate: options.translate === true,
    signal: liveController.signal,
    transcribeWindow: (pcm, opts) => getWorker().infer(pcm, opts),
    onUpdate: result => { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('go1:live-update', { id: liveId, result }); },
    onStatus: status => { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('go1:live-status', { id: liveId, status }); }
  });
  return liveId;
});

ipcMain.on('go1:live-frame', (event, { id, pcm } = {}) => {
  if (!ownWindow(event) || !liveSession || id !== liveId) return;
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
  if (process.platform !== 'darwin') throw new Error('System audio capture is only supported on macOS in GO1.');
  displayPermissionUntil = Date.now() + 15000;
  return true;
});

// Presentation privacy does not attempt to bypass screen sharing or meeting monitoring.
// A renderer action cancels background inference before sensitive UI is masked.
ipcMain.handle('go1:privacy-pause', event => {
  onlyApp(event);
  displayPermissionUntil = 0;
  cancelPrivateProcessing({ activeController, liveController, liveSession });
  liveSession = null;
  liveController = null;
  liveId = null;
  return true;
});
