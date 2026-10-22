/**
 * ExamProctor.ai — Electron Secure Preload Script
 * Exposes a strictly restricted API to the React renderer via contextBridge.
 * Follows Electron security best practices: contextIsolation enabled, nodeIntegration disabled.
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,

  // Fullscreen management
  setFullscreen: (flag) => ipcRenderer.invoke('window:set-fullscreen', Boolean(flag)),
  getFullscreen: () => ipcRenderer.invoke('window:get-fullscreen'),

  // Event listeners for exam integrity
  onFullscreenChange: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const subscription = (_event, isFullscreen) => callback(isFullscreen);
    ipcRenderer.on('window:fullscreen-change', subscription);
    return () => ipcRenderer.removeListener('window:fullscreen-change', subscription);
  },

  onWindowBlur: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const subscription = (_event, data) => callback(data);
    ipcRenderer.on('window:blur', subscription);
    return () => ipcRenderer.removeListener('window:blur', subscription);
  },

  onWindowFocus: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const subscription = (_event, data) => callback(data);
    ipcRenderer.on('window:focus', subscription);
    return () => ipcRenderer.removeListener('window:focus', subscription);
  },

  // App metadata
  getAppVersion: () => ipcRenderer.invoke('app:get-version'),
  getPlatform: () => process.platform,
});
