'use strict';
const VISIBILITY_SHORTCUT = 'CommandOrControl+D';

// Local window visibility only. Never alters session state, protection or processes.
class WindowVisibility {
  constructor(getWindows) { this.getWindows = getWindows; this.hidden = false; this.suspended = 0; this.saved = new Map(); }
  get blocked() { return this.hidden || this.suspended > 0; }
  rememberAndHide() {
    for (const window of this.getWindows()) {
      if (window.isDestroyed()) continue;
      if (!this.saved.has(window) && (window.isVisible() || window.isMinimized())) {
        this.saved.set(window, { minimized: window.isMinimized(), focused: window.isFocused() });
      }
      window.hide();
    }
  }
  restore() {
    if (this.blocked) return;
    const saved = [...this.saved]; this.saved.clear();
    for (const [window, state] of saved) {
      if (window.isDestroyed()) continue;
      if (state.minimized) { window.showInactive(); window.minimize(); }
      else { if (window.isMinimized()) window.restore(); window.showInactive(); }
    }
    const focus = saved.find(([window, state]) => state.focused && !state.minimized && !window.isDestroyed());
    focus?.[0].focus();
  }
  toggle() {
    this.hidden = !this.hidden;
    if (this.hidden) this.rememberAndHide(); else this.restore();
    return this.hidden;
  }
  show(window, inactive = false) {
    if (!window || window.isDestroyed()) return false;
    if (this.blocked) {
      if (!this.saved.has(window)) this.saved.set(window, { minimized: false, focused: !inactive });
      window.hide(); return false;
    }
    if (inactive) window.showInactive(); else { window.show(); window.focus(); }
    return true;
  }
  // Capture temporarily hides our windows, then restores only if the user hasn't
  // chosen Hide in the meantime. Nested capture cleanup cannot override Cmd+D.
  suspend() {
    this.suspended++;
    this.rememberAndHide();
    let released = false;
    return () => { if (released) return; released = true; this.suspended--; this.restore(); };
  }
}
function registerVisibilityShortcut(globalShortcut, toggle) {
  try { return Boolean(globalShortcut.register(VISIBILITY_SHORTCUT, toggle)); }
  catch { return false; }
}
module.exports = { WindowVisibility, VISIBILITY_SHORTCUT, registerVisibilityShortcut };
