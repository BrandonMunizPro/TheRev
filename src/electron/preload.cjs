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

  // Ollama management
  checkOllamaStatus: () => ipcRenderer.invoke('check-ollama-status'),
  startOllama: () => ipcRenderer.invoke('start-ollama'),
  openOllamaDownload: () => ipcRenderer.invoke('open-ollama-download'),

  // Browser Automation
  launchBrowserAutomation: (config) =>
    ipcRenderer.invoke('browser-automation:launch', config),
  executeBrowserAutomation: (action, params) =>
    ipcRenderer.invoke('browser-automation:execute', { action, params }),
  navigateBrowser: (url) =>
    ipcRenderer.invoke('browser-automation:navigate', url),
  takeScreenshot: () => ipcRenderer.invoke('browser-automation:screenshot'),
  fillForm: (formData) =>
    ipcRenderer.invoke('browser-automation:fill-form', formData),
  closeBrowserAutomation: () => ipcRenderer.invoke('browser-automation:close'),
  openAIBrowser: () => ipcRenderer.invoke('open-ai-browser'),

  // AI Brain
  'ai-brain:execute': (params) =>
    ipcRenderer.invoke('ai-brain:execute', params),
  'ai-brain:approve': (params) =>
    ipcRenderer.invoke('ai-brain:approve', params),
  'ai-brain:navigate': (url) => ipcRenderer.invoke('ai-brain:navigate', url),
  'ai-brain:get-task': (taskId) =>
    ipcRenderer.invoke('ai-brain:get-task', taskId),

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
  onAIApprovalRequest: (callback) => {
    ipcRenderer.on('ai-approval-request', (event, data) => callback(data));
  },

  // Remove listeners
  removeAllListeners: (channel) => {
    ipcRenderer.removeAllListeners(channel);
  },
});
