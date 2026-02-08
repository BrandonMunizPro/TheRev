const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Browser commands
  executeCommand: (command) =>
    ipcRenderer.invoke('execute-browser-command', command),

  // Avatar customization
  saveAvatarCustomization: (avatarData) =>
    ipcRenderer.invoke('save-avatar-customization', avatarData),
  getAvatarData: () => ipcRenderer.invoke('get-avatar-data'),

  // Event listeners
  onAvatarUpdated: (callback) => {
    ipcRenderer.on('avatar-updated', (event, data) => callback(data));
  },
  onOpenAvatarCustomizer: (callback) => {
    ipcRenderer.on('open-avatar-customizer', callback);
  },
  onOpenSandboxBrowser: (callback) => {
    ipcRenderer.on('open-sandbox-browser', callback);
  },
  onRefreshNews: (callback) => {
    ipcRenderer.on('refresh-news', callback);
  },
  onOpenNewsSource: (callback) => {
    ipcRenderer.on('open-news-source', (event, data) => callback(data.source));
  },
  onShowAbout: (callback) => {
    ipcRenderer.on('show-about', callback);
  },

  // Remove listeners
  removeAllListeners: (channel) => {
    ipcRenderer.removeAllListeners(channel);
  },
});
