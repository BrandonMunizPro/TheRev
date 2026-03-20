const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Browser commands
  executeCommand: (command) =>
    ipcRenderer.invoke('execute-browser-command', command),

  // Avatar customization
  saveAvatarCustomization: (avatarData) =>
    ipcRenderer.invoke('save-avatar-data', avatarData),
  getAvatarData: () => ipcRenderer.invoke('get-avatar-data'),
  saveVrmFile: (fileName, dataUrl) =>
    ipcRenderer.invoke('save-vrm-file', { fileName, dataUrl }),
  loadVrmFile: (fileName) => ipcRenderer.invoke('load-vrm-file', fileName),

  // VRoid Studio
  checkVroidStudio: () => ipcRenderer.invoke('check-vroid-studio'),
  launchVroidStudio: () => ipcRenderer.invoke('launch-vroid-studio'),
  openVroidExportFolder: () => ipcRenderer.invoke('open-vroid-export-folder'),

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
  openAIBrowser: (url, context) =>
    ipcRenderer.invoke('open-ai-browser', url, context),
  updateAIChatWithSummary: (summary) =>
    ipcRenderer.invoke('update-ai-chat-summary', summary),

  // AI Brain
  'ai-brain:execute': (params) =>
    ipcRenderer.invoke('ai-brain:execute', params),
  'ai-brain:approve': (params) =>
    ipcRenderer.invoke('ai-brain:approve', params),
  'ai-brain:navigate': (url) => ipcRenderer.invoke('ai-brain:navigate', url),
  'ai-brain:get-task': (taskId) =>
    ipcRenderer.invoke('ai-brain:get-task', taskId),

  // Avatar reactions (main -> renderer)
  'avatar:react': (type, message) =>
    ipcRenderer.invoke('avatar:react', type, message),
  'avatar:show-bubble': (message, duration) =>
    ipcRenderer.invoke('avatar:show-bubble', message, duration),
  'avatar:show-emotion': (emotion) =>
    ipcRenderer.invoke('avatar:show-emotion', emotion),
  'avatar:typing-start': () => ipcRenderer.invoke('avatar:typing-start'),
  'avatar:typing-stop': () => ipcRenderer.invoke('avatar:typing-stop'),
  setAvatarEmotion: (emotion) =>
    ipcRenderer.invoke('avatar:set-emotion', emotion),

  // Listen for avatar reactions from main
  onAvatarReact: (callback) => {
    ipcRenderer.on('avatar:react', (event, type, message) =>
      callback(type, message)
    );
  },
  onAvatarShowBubble: (callback) => {
    ipcRenderer.on('avatar:show-bubble', (event, message, duration) =>
      callback(message, duration)
    );
  },
  onAvatarShowEmotion: (callback) => {
    ipcRenderer.on('avatar:show-emotion', (event, emotion) =>
      callback(emotion)
    );
  },

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
  onOllamaReady: (callback) => {
    ipcRenderer.on('ollama-ready', (event, data) => callback(data));
  },
  onAIApprovalRequest: (callback) => {
    ipcRenderer.on('ai-approval-request', (event, data) => callback(data));
  },

  // Deep links
  onDeepLink: (callback) => {
    ipcRenderer.on('deep-link', (event, url) => callback(url));
  },

  // Tasks
  getTasks: (filter) => ipcRenderer.invoke('get-tasks', filter),

  // Analytics
  getAnalytics: (period) => ipcRenderer.invoke('get-analytics', period),

  // Audit Log
  getAuditLog: (filter) => ipcRenderer.invoke('get-audit-log', filter),

  // Shard Health
  getShardHealth: () => ipcRenderer.invoke('get-shard-health'),
  refreshShards: () => ipcRenderer.invoke('refresh-shards'),

  // Remove listeners
  removeAllListeners: (channel) => {
    ipcRenderer.removeAllListeners(channel);
  },
});
