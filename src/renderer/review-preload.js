'use strict';
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('practiceReview', Object.freeze({
  onData(callback) {
    const handler = (_event, data) => callback(data);
    ipcRenderer.once('go1:review-data', handler);
  }
}));
