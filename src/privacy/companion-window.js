'use strict';

// Independently implemented from the observed GO Client window API configuration.
// These options control local presentation. ContentProtection owns capture requests.
function companionWindowOptions(platform = process.platform) {
  if (!['darwin', 'win32'].includes(platform)) return {};
  return {
    ...(platform === 'darwin' ? { type: 'panel' } : {}), frame: false, transparent: true, hasShadow: false,
    alwaysOnTop: true, skipTaskbar: true, fullscreenable: false,
    resizable: false, maximizable: false,
    backgroundColor: '#00000000'
  };
}

function configureCompanionWindow(window, platform = process.platform) {
  if (platform !== 'darwin') return;
  const apply = () => {
    if (window.isDestroyed()) return;
    window.setAlwaysOnTop(true, 'screen-saver');
    window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true });
  };
  apply();
  window.on('show', apply);
  window.on('restore', apply);
}

module.exports = { companionWindowOptions, configureCompanionWindow };
