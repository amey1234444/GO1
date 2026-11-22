'use strict';

// Dock/app-switcher presentation is independent of window capture protection.
// Restore a normal app whenever the user returns to the workspace or closes the
// companion, so a live session cannot strand the user without navigation.
class LiveDock {
  constructor({ app, platform = process.platform, onChange = () => {} }) {
    this.app = app; this.platform = platform; this.onChange = onChange;
    this.enabled = true; this.companionOpen = false; this.workspaceRequested = false;
    this.revision = 0; this.queue = Promise.resolve(); this.error = null;
  }
  get requestedHidden() { return this.enabled && this.companionOpen && !this.workspaceRequested; }
  setEnabled(enabled) {
    if (typeof enabled !== 'boolean') throw new TypeError('Dock preference must be a boolean.');
    this.enabled = enabled;
    return this.refresh();
  }
  setCompanionOpen(open) {
    this.companionOpen = open;
    this.workspaceRequested = false;
    return this.refresh();
  }
  showWorkspace() { this.workspaceRequested = true; return this.refresh(); }
  refresh() {
    const revision = ++this.revision;
    this.queue = this.queue.catch(() => {}).then(async () => {
      if (revision !== this.revision || this.platform !== 'darwin') return this.snapshot();
      try {
        this.error = null;
        const hidden = this.requestedHidden;
        this.app.setActivationPolicy(hidden ? 'accessory' : 'regular');
        if (hidden) this.app.dock.hide();
        else await this.app.dock.show();
      } catch (error) { this.error = String(error.message || error); }
      this.onChange();
      return this.snapshot();
    });
    return this.queue;
  }
  snapshot() {
    let dockVisible = null, error = this.error;
    if (this.platform === 'darwin') {
      try { dockVisible = this.app.dock.isVisible(); }
      catch (cause) { error ||= String(cause.message || cause); }
    }
    return { supported: this.platform === 'darwin', enabled: this.enabled,
      companionOpen: this.companionOpen, requestedHidden: this.requestedHidden,
      dockVisible, error, captureExclusionProof: false };
  }
}
module.exports = { LiveDock };
