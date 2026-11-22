'use strict';
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('go1Companion', Object.freeze({
  onSnapshot(callback) {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('go1:companion-snapshot', listener);
    return () => ipcRenderer.removeListener('go1:companion-snapshot', listener);
  },
  close: () => ipcRenderer.invoke('go1:companion-close'),
  focusWorkspace: () => ipcRenderer.invoke('go1:companion-focus-main'),
  stopAndMask: () => ipcRenderer.invoke('go1:companion-privacy'),
  setOpacity: value => ipcRenderer.invoke('go1:companion-opacity', value)
}));
