'use strict';

// OS capture exclusion is a request, not proof of the receiver's video output.
// In particular, macOS ScreenCaptureKit can ignore NSWindowSharingNone.
class ContentProtection {
  constructor({ platform = process.platform, enabled = true } = {}) {
    this.platform = platform;
    this.enabled = enabled;
    this.windows = new Map();
  }

  register(window, role) {
    if (this.windows.has(window)) return;
    this.windows.set(window, { role, applied: false, error: null });
    // Call immediately after construction, before loading content or showing it.
    this.apply(window);
    window.on('show', () => this.apply(window));
    window.on('restore', () => this.apply(window));
    window.once('closed', () => this.windows.delete(window));
  }

  apply(window) {
    const state = this.windows.get(window);
    if (!state || window.isDestroyed()) return;
    state.applied = false;
    state.error = null;
    if (!['darwin', 'win32'].includes(this.platform)) return;
    try {
      window.setContentProtection(this.enabled);
      state.applied = window.isContentProtected() === true;
      if (state.applied !== this.enabled) state.error = 'OS protection state does not match the requested setting.';
    } catch (error) {
      state.error = String(error.message || error);
    }
  }

  setEnabled(enabled) {
    if (typeof enabled !== 'boolean') throw new TypeError('Capture protection must be a boolean.');
    this.enabled = enabled;
    for (const window of this.windows.keys()) this.apply(window);
    return this.snapshot();
  }

  snapshot() {
    const supported = ['darwin', 'win32'].includes(this.platform);
    const windows = [];
    for (const [window, state] of this.windows) {
      if (window.isDestroyed()) continue;
      // Read the current flag; do not use a cached success after an OS change.
      let applied = false, error = state.error;
      if (supported) {
        try { applied = window.isContentProtected() === true; }
        catch (err) { error = String(err.message || err); }
      }
      if (supported && applied !== this.enabled && !error) error = 'OS protection state does not match the requested setting.';
      windows.push({ role: state.role, applied, error });
    }
    const allApplied = supported && windows.length > 0 && windows.every(w => w.applied && !w.error);
    return {
      enabled: this.enabled, supported, platform: this.platform, allApplied,
      receiverVerified: false, guaranteedCaptureExclusion: false, windows,
      limitation: this.platform === 'darwin'
        ? 'macOS ScreenCaptureKit can still capture GO1. Share a specific other window or tab, and check a second device.'
        : this.platform === 'win32'
          ? 'Windows capture exclusion depends on the capture method and OS version. Check a second device before sharing private content.'
          : 'Capture exclusion is unavailable on this platform. Share a specific other window or tab, or stop and mask GO1.'
    };
  }
}

module.exports = { ContentProtection };
