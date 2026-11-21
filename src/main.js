'use strict';

const path = require('node:path');
const fs = require('node:fs/promises');
const { app, BrowserWindow, ipcMain, session, systemPreferences, dialog, clipboard } = require('electron');
const { randomUUID } = require('node:crypto');
const { getSetup, transcribe, transcribePcmWindow } = require('./transcription/engine');
const { LiveSession } = require('./transcription/live');

app.setName('GO1');
let mainWindow;
let activeController;
let liveController;
let liveSession;
let liveId;
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

app.whenReady().then(() => {
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
app.on('before-quit', () => { activeController?.abort(); liveController?.abort(); liveSession?.cancel(); });

function onlyApp(event) { if (!ownWindow(event)) throw new Error('Unrecognized request origin.'); }
const modelDirectory = () => path.join(app.getPath('userData'), 'models');

ipcMain.handle('go1:setup', event => {
  onlyApp(event);
  return getSetup({ modelDirectory: modelDirectory() });
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
      modelDirectory: modelDirectory(),
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
  if (!getSetup({ modelDirectory: modelDirectory() }).ready) throw new Error('Install whisper.cpp and its multilingual model first.');
  liveController = new AbortController();
  liveId = randomUUID();
  liveSession = new LiveSession({
    language,
    translate: options.translate === true,
    signal: liveController.signal,
    transcribeWindow: (pcm, opts) => transcribePcmWindow(pcm, { ...opts, modelDirectory: modelDirectory() }),
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
