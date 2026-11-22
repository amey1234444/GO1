'use strict';
// Genuine renderer/capture images with labelled fixture data, never a Meet mockup.
const { BrowserWindow, ipcMain } = require('electron');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs/promises');
const { promisify } = require('node:util');
const { execFile } = require('node:child_process');
const { ContentProtection } = require('../../src/privacy/content-protection');
const { companionWindowOptions, configureCompanionWindow } = require('../../src/privacy/companion-window');
const { companionBounds } = require('../../src/companion/layout');
const execute = promisify(execFile);
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function probeCompanion({ root, output, helper, display }) {
  const directory = path.join(output, 'companion-live');
  await fs.mkdir(directory, { recursive: true });
  const window = new BrowserWindow({ show: false, x: display.bounds.x + 50, y: display.bounds.y + 90,
    width: 780, height: 540, opacity: 1, ...companionWindowOptions('darwin'),
    webPreferences: { preload: path.join(root, 'src/renderer/companion-preload.js'),
      backgroundThrottling: false, sandbox: true, contextIsolation: true, nodeIntegration: false }
  });
  const protection = new ContentProtection({ enabled: false });
  protection.register(window, 'companion'); configureCompanionWindow(window, 'darwin');
  const capture = async name => {
    const args = ['--output', path.join(directory, name), '--display', String(display.id),
      '--marker-window', window.getMediaSourceId().split(':')[1]];
    if (process.env.GO1_REQUEST_SCREEN_PERMISSION === '1') args.push('--request-permission');
    const { stdout } = await execute(helper, args, { timeout: 20000, maxBuffer: 1024 * 1024 });
    return JSON.parse(stdout.trim());
  };
  const snapshot = { role: 'SYNTHETIC TEST — release planning', language: 'en', assistancePermitted: true, compact: false, surfaceOpacity: .86,
    question: 'What should we check before rollout?', transcript: 'Sample transcript: checking release readiness.',
    guidance: 'Sample AI text: verify service health.', status: 'Synthetic fixture — no microphone or AI model used.' };
  const send = () => window.webContents.send('go1:companion-snapshot', { ...snapshot, captureProtection: protection.snapshot() });
  ipcMain.handle('go1:companion-compact', (event, value) => {
    assert.equal(event.sender, window.webContents);
    snapshot.compact = value;
    window.setBounds(companionBounds(display.workArea, value, window.getBounds()));
    send(); return value;
  });
  ipcMain.handle('go1:companion-opacity', (event, value) => {
    assert.equal(event.sender, window.webContents);
    snapshot.surfaceOpacity = value; send(); return value;
  });
  try {
    await window.loadFile(path.join(root, 'src/renderer/companion.html'));
    send(); window.showInactive(); window.moveTop(); await wait(500);
    const unprotected = await capture('unprotected-display');
    protection.setEnabled(true);
    // Exercise real preload/renderer updates while the panel is hidden/backgrounded.
    window.hide();
    snapshot.transcript = 'Sample transcript updated while protected: the release health check passed.';
    snapshot.guidance = 'Sample AI text updated while protected:\n1. Check service health.\n2. Roll out gradually.\n3. Keep rollback ready.';
    send(); await wait(350);
    const rendered = await window.webContents.executeJavaScript(`({
      transcript: document.getElementById('transcript').textContent,
      guidance: document.getElementById('guidance').textContent,
      protection: document.getElementById('protectionState').textContent
    })`);
    assert.equal(rendered.transcript, snapshot.transcript);
    assert.equal(rendered.guidance, snapshot.guidance);
    assert.match(rendered.protection, /requested/);
    window.showInactive(); window.moveTop(); await wait(500);
    await fs.writeFile(path.join(directory, 'sender-panel.png'), (await window.webContents.capturePage()).toPNG());
    const protectedDisplay = await capture('protected-display');
    await window.webContents.executeJavaScript("document.getElementById('guidance').scrollIntoView({block:'center'})");
    await wait(200);
    await fs.writeFile(path.join(directory, 'sender-guidance.png'), (await window.webContents.capturePage()).toPNG());
    await window.webContents.executeJavaScript("document.getElementById('compact').click()");
    await wait(350);
    assert.equal(window.getBounds().height, 76);
    await fs.writeFile(path.join(directory, 'sender-compact.png'), (await window.webContents.capturePage()).toPNG());
    await window.webContents.executeJavaScript("document.getElementById('compact').click()");
    await wait(350);
    await window.webContents.executeJavaScript("document.getElementById('opacity').value = '70'; document.getElementById('opacity').dispatchEvent(new Event('input', {bubbles:true}))");
    await wait(350);
    const glass = await window.webContents.executeJavaScript(`({
      html: getComputedStyle(document.documentElement).backgroundColor,
      body: getComputedStyle(document.body).backgroundColor,
      surface: getComputedStyle(document.querySelector('.workspace')).backgroundColor,
      textOpacity: getComputedStyle(document.getElementById('guidance')).opacity,
      noHorizontalOverflow: document.documentElement.scrollWidth <= innerWidth,
      compact: document.getElementById('companionApp').classList.contains('compact')
    })`);
    assert.equal(glass.body, 'rgba(0, 0, 0, 0)');
    assert.match(glass.surface, /0\.7\)/);
    assert.equal(glass.textOpacity, '1');
    assert.equal(glass.noHorizontalOverflow, true);
    assert.equal(glass.compact, false);
    await fs.writeFile(path.join(directory, 'sender-translucent.png'), (await window.webContents.capturePage()).toPNG());
    return { status: 'collected', rendered, backgroundThrottling: window.webContents.getBackgroundThrottling(),
      glass, compactControlVerified: true,
      protection: protection.snapshot(), unprotected, protectedDisplay, receiverVerified: false,
      note: 'Real companion HTML/preload, synthetic text. Sender images use capturePage (app content, not desktop). Observer images use independent ScreenCaptureKit. No Google Meet or actual speech/AI inference.' };
  } finally {
    ipcMain.removeHandler('go1:companion-compact'); ipcMain.removeHandler('go1:companion-opacity');
    if (!window.isDestroyed()) window.destroy();
  }
}
module.exports = { probeCompanion };
