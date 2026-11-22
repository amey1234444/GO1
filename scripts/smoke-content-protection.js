'use strict';
// Run with Electron on a real macOS/Windows host. This tests API state only.
// It does not certify capture exclusion in any meeting application.
const assert = require('node:assert/strict');
const { app, BrowserWindow } = require('electron');
const { ContentProtection } = require('../src/privacy/content-protection');
app.whenReady().then(async () => {
  const windows = [];
  try {
    assert.ok(['darwin', 'win32'].includes(process.platform), 'Run this smoke test on macOS or Windows.');
    const controller = new ContentProtection();
    for (const role of ['workspace', 'companion', 'review']) {
      const window = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
      windows.push(window);
      controller.register(window, role);
      await window.loadURL('data:text/html,<title>GO1 capture API smoke</title>Test fixture');
    }
    const enabled = controller.snapshot();
    assert.equal(enabled.allApplied, true);
    controller.setEnabled(false);
    assert.ok(controller.snapshot().windows.every(w => !w.applied && !w.error));
    controller.setEnabled(true);
    assert.equal(controller.snapshot().allApplied, true);
    windows[1].destroy();
    assert.equal(controller.snapshot().windows.length, 2);
    console.log('GO1_CAPTURE_API_SMOKE ' + JSON.stringify({
      result: 'pass', platform: process.platform, osRelease: require('node:os').release(),
      electron: process.versions.electron, node: process.versions.node,
      enabled, receiverTests: 'not_run', guaranteedCaptureExclusion: false
    }));
    app.exit(0);
  } catch (error) {
    console.error('GO1_CAPTURE_API_SMOKE ' + JSON.stringify({ result: 'fail', error: error.message, receiverTests: 'not_run' }));
    for (const window of windows) if (!window.isDestroyed()) window.destroy();
    app.exit(1);
  }
}).catch(error => { console.error(error); app.exit(1); });
