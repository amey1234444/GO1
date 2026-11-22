'use strict';

const PRIVACY_SHORTCUT = 'CommandOrControl+Shift+9';

/** Register an emergency STOP-only accelerator. It never toggles privacy off. */
function registerEmergencyPrivacy(globalShortcut, enterPrivacy) {
  if (!globalShortcut || typeof globalShortcut.register !== 'function') return false;
  if (typeof enterPrivacy !== 'function') throw new TypeError('A privacy callback is required.');
  try { return Boolean(globalShortcut.register(PRIVACY_SHORTCUT, () => enterPrivacy('hotkey'))); }
  catch { return false; }
}
module.exports = { PRIVACY_SHORTCUT, registerEmergencyPrivacy };
