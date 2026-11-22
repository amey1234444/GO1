'use strict';
const { app, BrowserWindow, screen } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { companionWindowOptions, configureCompanionWindow } = require('../../src/privacy/companion-window');
const { ContentProtection } = require('../../src/privacy/content-protection');
const { captureVerdict } = require('../../src/privacy/capture-verdict');
const { probeCompanion } = require('./probe-companion');
const execute = promisify(execFile);
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const root = path.resolve(__dirname, '../..');
const output = path.resolve(process.env.GO1_CAPTURE_EVIDENCE_DIR || path.join(root, 'out/capture-evidence'));
const helper = path.join(root, 'out/capture-probe/go1-capture-probe');
const html = color => 'data:text/html,' + encodeURIComponent(`<html><body style="margin:0;background:${color};overflow:hidden"><div style="font:24px sans-serif;padding:24px">GO1 SYNTHETIC CAPTURE TEST</div><div style="width:24px;height:24px;background:white;animation:move .4s infinite alternate"></div><style>@keyframes move{to{transform:translateX(300px)}}</style></body></html>`);
app.whenReady().then(async () => {
  const windows = [];
  const report = { schemaVersion: 1, date: new Date().toISOString(), electron: process.versions.electron,
    os: require('node:os').release(), platform: process.platform, trials: [], receiverVerified: false,
    note: 'Synthetic local ScreenCaptureKit evidence. This is not a Zoom/Meet/Teams receiving-device test.' };
  try {
    if (process.platform !== 'darwin') throw new Error('Run this capture experiment on macOS 14 or later.');
    await fs.mkdir(output, { recursive: true });
    const display = screen.getPrimaryDisplay();
    if (display.bounds.width < 850 || display.bounds.height < 600) throw new Error('Test requires at least an 850 × 600 point desktop.');
    const backdrop = new BrowserWindow({ show: false, frame: false, x: display.bounds.x + 40, y: display.bounds.y + 80,
      width: 800, height: 500, backgroundColor: '#00ffff', webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
    windows.push(backdrop);
    await backdrop.loadURL(html('#00ffff')); backdrop.show();
    const cases = [
      { name: 'unprotected-control', protected: false, panel: false },
      { name: 'protected-ordinary', protected: true, panel: false },
      { name: 'panel-unprotected-control', protected: false, panel: true },
      { name: 'go1-mac-panel', protected: true, panel: true },
      { name: 'panel-accessory-policy', protected: true, panel: true, accessory: true },
      { name: 'selected-other-window', protected: true, panel: true, selectedWindow: true }
    ];
    for (const scenario of cases) {
      app.setActivationPolicy(scenario.accessory ? 'accessory' : 'regular');
      const window = new BrowserWindow({ show: false, frame: false,
        x: display.bounds.x + 180, y: display.bounds.y + 200, width: 320, height: 180,
        opacity: scenario.panel ? 0.94 : 1,
        ...(scenario.panel ? companionWindowOptions('darwin') : {}),
        webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
      windows.push(window);
      const protection = new ContentProtection({ enabled: scenario.protected });
      protection.register(window, 'synthetic-companion');
      if (scenario.panel) configureCompanionWindow(window, 'darwin');
      await window.loadURL(html('#ff00ff')); window.showInactive(); window.moveTop();
      await wait(600); // Allow the desktop to compose, not evidence of exclusion by itself.
      const args = ['--output', path.join(output, scenario.name), '--display', String(display.id), '--marker-window', window.getMediaSourceId().split(':')[1]];
      if (scenario.selectedWindow) args.push('--window', backdrop.getMediaSourceId().split(':')[1]);
      if (process.env.GO1_REQUEST_SCREEN_PERMISSION === '1') args.push('--request-permission');
      let capture;
      try {
        const { stdout } = await execute(helper, args, { timeout: 20000, maxBuffer: 1024 * 1024 });
        capture = JSON.parse(stdout.trim());
      } catch (error) { capture = { status: 'error', reason: String(error.message), receiverVerified: false }; }
      report.trials.push({ scenario, windowState: { visible: window.isVisible(), alwaysOnTop: window.isAlwaysOnTop(), allWorkspaces: window.isVisibleOnAllWorkspaces(), bounds: window.getBounds() }, protection: protection.snapshot(), capture });
      window.destroy();
      if (capture.status === 'blocked') break;
    }
    const control = report.trials[0]?.capture;
    for (const trial of report.trials) trial.verdict = captureVerdict(control, trial.capture);
    const own = report.trials.find(t => t.scenario.name === 'go1-mac-panel');
    report.result = control?.status === 'blocked' ? 'blocked' : own?.verdict.result || 'inconclusive';
    if (control?.status === 'captured') report.companion = await probeCompanion({ root, output, helper, display });
    await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
    console.log('GO1_CAPTURE_PIXELS ' + JSON.stringify(report));
    if (report.result !== 'excluded-in-tested-paths') console.log(`::warning::GO1 capture result: ${report.result}. No full-screen invisibility certification.`);
    // Exit success means evidence collection completed; report.result is the capture verdict.
    app.exit(0);
  } catch (error) {
    report.result = 'error'; report.error = String(error.message);
    await fs.mkdir(output, { recursive: true });
    await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
    console.error(error); app.exit(1);
  } finally {
    for (const window of windows) if (!window.isDestroyed()) window.destroy();
  }
});
