const {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  dialog,
  shell,
} = require('electron');
app.commandLine.appendSwitch('enable-webview');
app.commandLine.appendSwitch('disable-features', 'VizDisplayCompositor');

// Register custom protocol for deep links
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('therev', process.execPath, [
      process.argv[1],
    ]);
  }
} else {
  app.setAsDefaultProtocolClient('therev');
}

// Handle second instance (when opened with URL)
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (event, commandLine) => {
    // Handle URL passed as argument
    const url = commandLine.find((arg) => arg.startsWith('therev://'));
    if (url) {
      handleDeepLink(url);
    }
    // Focus the main window
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

function handleDeepLink(url) {
  console.log('[DeepLink] Received:', url);
  if (mainWindow && mainWindow.webContents) {
    mainWindow.webContents.send('deep-link', url);
  }
}

const path = require('path');
const { exec, spawn, spawnSync } = require('child_process');
const fs = require('fs');

let mainWindow;
let ollamaProcess = null;
let browserAutomationProcess = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs'),
      webSecurity: false, // For sandbox browser
      webviewTag: true,
      partition: 'persist:main',
    },
    icon: path.join(__dirname, '../assets/icon.png'),
    titleBarStyle: 'hiddenInset',
  });

  // Load the frontend - connect to localhost backend
  mainWindow.loadFile(path.join(__dirname, 'frontend/index.html'));

  // Auto-start Ollama in background
  console.log('[App] Auto-starting Ollama...');
  startOllama()
    .then(() => {
      console.log('[App] Ollama started, checking for models...');
      return ensureOllamaModel();
    })
    .then((modelResult) => {
      console.log('[App] Ollama ready:', modelResult);
      mainWindow?.webContents.send('ollama-ready', modelResult);
    })
    .catch((err) => {
      console.log('[App] Ollama auto-start failed:', err.message);
      // Don't block app startup - just log it
    });

  // Open DevTools in development
  mainWindow.webContents.openDevTools();

  // Create custom menu
  createMenu();
}

function createMenu() {
  const template = [
    {
      label: 'TheRev',
      submenu: [
        {
          label: 'About TheRev',
          click: () => {
            mainWindow.webContents.send('show-about');
          },
        },
        { type: 'separator' },
        {
          label: 'Quit',
          accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Ctrl+Q',
          click: () => {
            app.quit();
          },
        },
      ],
    },
    {
      label: 'Rev Avatar',
      submenu: [
        {
          label: 'Customize Rev',
          click: () => {
            mainWindow.webContents.send('open-avatar-customizer');
          },
        },
        {
          label: 'Reset Rev',
          click: () => {
            mainWindow.webContents.send('reset-avatar');
          },
        },
      ],
    },
    {
      label: 'Browser',
      submenu: [
        {
          label: 'Open Sandbox Browser',
          accelerator: 'CmdOrCtrl+B',
          click: () => {
            mainWindow.webContents.send('open-sandbox-browser');
          },
        },
        {
          label: 'New Browser Window',
          click: () => {
            createBrowserWindow();
          },
        },
      ],
    },
    {
      label: 'News',
      submenu: [
        {
          label: 'Refresh News Feed',
          accelerator: 'CmdOrCtrl+R',
          click: () => {
            mainWindow.webContents.send('refresh-news');
          },
        },
        {
          label: 'Drop Site News',
          click: () => {
            mainWindow.webContents.send('open-news-source', {
              source: 'dropsitenews',
            });
          },
        },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

function createBrowserWindow(url = 'https://www.google.com') {
  const browserWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs'),
      webSecurity: false,
    },
    title: 'Rev Browser',
  });

  // Load the URL directly
  browserWindow.loadURL(url);
  return browserWindow;
}

// IPC handlers for sandbox browser commands
ipcMain.handle('execute-browser-command', async (event, command) => {
  // Handle special commands
  if (command.startsWith('open-url:')) {
    const url = command.replace('open-url:', '');
    createBrowserWindow(url);
    return 'Opened: ' + url;
  }

  if (command === 'open-new-browser-window') {
    createBrowserWindow();
    return 'New browser window opened';
  }

  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) {
        reject(error);
      } else {
        resolve(stdout);
      }
    });
  });
});

// IPC handlers for Rev avatar commands
ipcMain.handle('save-avatar-customization', async (event, avatarData) => {
  // Save avatar data to local storage or backend
  mainWindow.webContents.send('avatar-updated', avatarData);
  return true;
});

ipcMain.handle('get-avatar-data', async () => {
  // Retrieve avatar data
  return {};
});

// Deep link handler - send to renderer
ipcMain.handle('process-deep-link', async (event, url) => {
  if (mainWindow && mainWindow.webContents) {
    mainWindow.webContents.send('deep-link', url);
  }
  return true;
});

// Ollama management functions
function checkOllamaRunning() {
  return new Promise((resolve) => {
    exec(
      'curl -s http://localhost:11434/api/tags',
      { timeout: 3000 },
      (error) => {
        resolve(!error);
      }
    );
  });
}

function startOllama() {
  return new Promise((resolve, reject) => {
    if (ollamaProcess) {
      resolve(true);
      return;
    }

    // Try to start Ollama - just run the command
    const isWindows = process.platform === 'win32';
    const command = isWindows ? 'start "" ollama serve' : 'ollama serve';

    exec(command, { shell: true }, (error) => {
      // Even if there's an error, wait and check if it started
      setTimeout(async () => {
        const running = await checkOllamaRunning();
        if (running) {
          resolve(true);
        } else {
          reject(
            new Error(
              'Failed to start Ollama. Please make sure Ollama is installed.'
            )
          );
        }
      }, 3000);
    });
  });
}

// Check if Ollama has models, if not pull llama3
async function ensureOllamaModel() {
  try {
    const response = await fetch('http://localhost:11434/api/tags');
    const data = await response.json();

    if (!data.models || data.models.length === 0) {
      console.log('[Ollama] No models found, pulling llama3...');

      // Pull llama3 model
      const pullResponse = await fetch('http://localhost:11434/api/pull', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'llama3' }),
      });

      if (pullResponse.ok) {
        console.log('[Ollama] Successfully pulled llama3 model');
        return {
          success: true,
          model: 'llama3',
          message: 'Model llama3 installed',
        };
      } else {
        return { success: false, error: 'Failed to pull model' };
      }
    }

    return {
      success: true,
      model: data.models[0].name,
      message: 'Model already installed',
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// IPC handlers for Ollama management
ipcMain.handle('check-ollama-status', async () => {
  // First check if it's already running
  const running = await checkOllamaRunning();
  if (running) {
    return { installed: true, running: true, needsInstall: false };
  }

  // Try to start it - if it works, we know it's installed
  return new Promise((resolve) => {
    exec('ollama --version', { timeout: 5000 }, (error) => {
      if (error) {
        // Try Windows executable name too
        exec('ollama.exe --version', { timeout: 5000 }, (err2) => {
          resolve({ installed: !err2, running: false, needsInstall: !!err2 });
        });
      } else {
        resolve({ installed: true, running: false, needsInstall: false });
      }
    });
  });
});

ipcMain.handle('start-ollama', async () => {
  try {
    await startOllama();

    // Wait a moment for Ollama to fully start
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Check and pull model if needed
    const modelResult = await ensureOllamaModel();

    return { success: true, ...modelResult };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('open-ollama-download', async () => {
  // Open Ollama download page
  shell.openExternal('https://ollama.com/download');
  return true;
});

// Browser Automation IPC Handlers
ipcMain.handle('browser-automation:launch', async (event, config) => {
  try {
    // Start the browser automation service if not already running
    if (!browserAutomationProcess) {
      const scriptPath = path.join(
        __dirname,
        '../browser/automation-server.cjs'
      );
      console.log('[Browser Automation] Starting server from:', scriptPath);

      // Check if the file exists
      if (!fs.existsSync(scriptPath)) {
        return { success: false, error: 'Automation server script not found' };
      }

      browserAutomationProcess = spawn('node', [scriptPath], {
        stdio: 'pipe',
        env: { ...process.env, PORT: '9222' },
        detached: false,
      });

      browserAutomationProcess.stdout.on('data', (data) => {
        console.log('[Browser Automation]:', data.toString());
      });

      browserAutomationProcess.stderr.on('data', (data) => {
        console.error('[Browser Automation Error]:', data.toString());
      });

      browserAutomationProcess.on('error', (err) => {
        console.error('[Browser Automation] Process error:', err);
      });

      // Wait for server to start and verify it's running
      await new Promise((resolve) => setTimeout(resolve, 3000));

      // Test if server is responding
      try {
        const testReq = await fetch('http://localhost:9222/api/status');
        if (testReq.ok) {
          console.log('[Browser Automation] Server is running');
        }
      } catch (e) {
        return {
          success: false,
          error: 'Server failed to start: ' + e.message,
        };
      }
    }

    return { success: true, port: 9222 };
  } catch (error) {
    console.error('[Browser Automation] Launch error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle(
  'browser-automation:execute',
  async (event, { action, params }) => {
    try {
      const response = await fetch('http://localhost:9222/api/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, params }),
      });

      if (!response.ok) {
        throw new Error(`Automation failed: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
);

ipcMain.handle('browser-automation:navigate', async (event, url) => {
  return await fetch('http://localhost:9222/api/navigate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  })
    .then((r) => r.json())
    .catch((e) => ({ success: false, error: e.message }));
});

ipcMain.handle('browser-automation:screenshot', async () => {
  try {
    const response = await fetch('http://localhost:9222/api/screenshot', {
      method: 'POST',
    });
    return await response.json();
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('browser-automation:fill-form', async (event, formData) => {
  try {
    const response = await fetch('http://localhost:9222/api/fill-form', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ formData }),
    });
    return await response.json();
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('browser-automation:close', async () => {
  if (browserAutomationProcess) {
    browserAutomationProcess.kill();
    browserAutomationProcess = null;
  }
  return { success: true };
});

let aiBrowserWindow = null;
let aiWebview = null;

// Get or create the AI browser window
function getOrCreateAIBrowserWindow() {
  if (!aiBrowserWindow || aiBrowserWindow.isDestroyed()) {
    aiBrowserWindow = new BrowserWindow({
      width: 1200,
      height: 800,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, 'preload.cjs'),
        webSecurity: false,
        webviewTag: true,
        partition: 'persist:ai-browser',
      },
      title: 'Rev AI Browser',
    });

    aiBrowserWindow.loadFile(path.join(__dirname, 'frontend/ai-browser.html'));

    aiBrowserWindow.on('closed', () => {
      aiBrowserWindow = null;
      aiWebview = null;
    });
  }
  return aiBrowserWindow;
}

ipcMain.handle('open-ai-browser', async (event, url, context) => {
  console.log(
    '[open-ai-browser] Called with url:',
    url,
    'context:',
    context ? 'yes' : 'no'
  );

  // Create new AI Browser window with the chat interface (reuse existing if available)
  if (aiBrowserWindow && !aiBrowserWindow.isDestroyed()) {
    aiBrowserWindow.focus();
  } else {
    aiBrowserWindow = new BrowserWindow({
      width: 1200,
      height: 800,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, 'preload.cjs'),
        webSecurity: false,
        webviewTag: true,
        partition: 'persist:ai-browser',
      },
      title: 'Rev AI Browser',
    });

    aiBrowserWindow.on('closed', () => {
      aiBrowserWindow = null;
    });
  }

  // Store reference for later use
  const currentWindow = aiBrowserWindow;

  // Load the AI browser page (with chat panel)
  currentWindow.loadFile(path.join(__dirname, 'frontend/ai-browser.html'));

  currentWindow.focus();

  // After the AI browser page loads, navigate the webview inside it
  currentWindow.webContents.once('did-finish-load', () => {
    console.log('[open-ai-browser] AI Browser page loaded');

    if (url) {
      const finalUrl = url.startsWith('http') ? url : 'https://' + url;

      // Navigate the webview element INSIDE the page, not the window itself
      currentWindow.webContents.executeJavaScript(`
        (function() {
          const webview = document.querySelector('webview');
          if (webview) {
            webview.src = '${finalUrl.replace(/'/g, "\\'")}';
            console.log('[open-ai-browser] Navigating webview to:', '${finalUrl.replace(/'/g, "\\'")}');
          } else {
            console.log('[open-ai-browser] Webview not found!');
          }
        })();
      `);
    }

    // Inject context/summary after a short delay to let the page settle
    if (context) {
      setTimeout(() => {
        const escapedContext = context
          .replace(/'/g, "\\'")
          .replace(/"/g, '\\"');
        currentWindow.webContents.executeJavaScript(`
          (function() {
            try {
              const chatMessages = document.getElementById('chatMessages');
              if (chatMessages) {
                const msgDiv = document.createElement('div');
                msgDiv.className = 'message ai';
                msgDiv.innerHTML = '<span class="avatar">🤖</span><strong>📰 Article Summary:</strong><br><br>' + '${escapedContext}';
                chatMessages.appendChild(msgDiv);
                chatMessages.scrollTop = chatMessages.scrollHeight;
              }
            } catch(e) { console.log('Error adding context:', e); }
          })();
        `);
      }, 3000);
    }
  });

  return { success: true };
});

// Update AI chat with summary after it's loaded
ipcMain.handle('update-ai-chat-summary', async (event, summary) => {
  console.log(
    '[update-ai-chat-summary] Received summary:',
    summary ? summary.substring(0, 50) + '...' : 'null'
  );

  // Use the stored aiBrowserWindow reference
  if (aiBrowserWindow && !aiBrowserWindow.isDestroyed()) {
    console.log('[update-ai-chat-summary] Using stored window reference');
    const escapedSummary = (summary || '')
      .replace(/'/g, "\\'")
      .replace(/"/g, '\\"');

    aiBrowserWindow.webContents.executeJavaScript(`
      (function() {
        try {
          console.log('[renderer] Trying to add summary to chat');
          const chatMessages = document.getElementById('chatMessages');
          console.log('[renderer] chatMessages found:', !!chatMessages);
          if (chatMessages) {
            // Add the AI summary
            const msgDiv = document.createElement('div');
            msgDiv.className = 'message ai';
            msgDiv.innerHTML = '<span class="avatar">🤖</span><strong>📰 AI Summary:</strong><br><br>' + '${escapedSummary}';
            chatMessages.appendChild(msgDiv);
            chatMessages.scrollTop = chatMessages.scrollHeight;
            console.log('[renderer] Summary added to chat');
          } else {
            console.log('[renderer] chatMessages NOT found');
          }
        } catch(e) { console.log('[renderer] Error adding summary:', e); }
      })();
    `);
    return { success: true };
  }

  return { success: false, error: 'No AI Browser window found' };
});

// ============================================
// DIRECT WEBVIEW CONTROL - AI controls the actual webview
// ============================================

ipcMain.handle('webview:execute', async (event, { action, params }) => {
  try {
    const win = getOrCreateAIBrowserWindow();

    // Get the webview from the window
    const webview = win.webContents
      .getAllWebContents()
      .find((w) => w.getURL().includes('webview'));

    if (!webview) {
      // Try to find webview element via JavaScript
      const result = await win.webContents.executeJavaScript(`
        (function() {
          const webview = document.querySelector('webview');
          if (!webview) return { success: false, error: 'No webview found' };
          
          // Return webview element info
          return { success: true, exists: true, url: webview.getAttribute('src') };
        })();
      `);

      if (!result.success) {
        return {
          success: false,
          error: 'Webview not ready. Please open the AI Browser first.',
        };
      }
    }

    // Execute the action directly in the webview
    switch (action) {
      case 'navigate': {
        const url = params.url;
        const result = await win.webContents.executeJavaScript(`
          (function() {
            const webview = document.querySelector('webview');
            if (webview) {
              webview.loadURL('${url.replace(/'/g, "\\'")}');
              return { success: true, url: '${url}' };
            }
            return { success: false, error: 'Webview not found' };
          })();
        `);
        return result;
      }

      case 'type': {
        const { selector, value } = params;
        const result = await win.webContents.executeJavaScript(`
          (function() {
            const webview = document.querySelector('webview');
            if (!webview) return { success: false, error: 'Webview not found' };
            
            // Try multiple selectors
            const selectors = ${JSON.stringify([
              'input[aria-label="Search"]',
              'input[name="search"]',
              '#search-input',
              'input[type="search"]',
              'input[type="text"]',
              'input[id="search"]',
              'ytd-searchbox input',
              '#search',
            ])};
            
            let element = null;
            for (const sel of selectors) {
              try {
                const els = webview.document.querySelectorAll(sel);
                for (const el of els) {
                  if (el.offsetParent !== null) { // visible
                    element = el;
                    break;
                  }
                }
                if (element) break;
              } catch(e) {}
            }
            
            if (element) {
              element.focus();
              element.value = '${value.replace(/'/g, "\\'")}';
              element.dispatchEvent(new Event('input', { bubbles: true }));
              element.dispatchEvent(new Event('change', { bubbles: true }));
              return { success: true, selector: element.tagName + '.' + element.className };
            }
            return { success: false, error: 'Search input not found' };
          })();
        `);
        return result;
      }

      case 'click': {
        const { selector } = params;
        const result = await win.webContents.executeJavaScript(`
          (function() {
            const webview = document.querySelector('webview');
            if (!webview) return { success: false, error: 'Webview not found' };
            
            // Try multiple search button selectors
            const selectors = ${JSON.stringify([
              'button[aria-label="Search"]',
              'button#search-icon-legacy',
              '#search-icon-legacy',
              'button[type="submit"]',
              'ytd-searchbox button',
              '#search-button',
            ])};
            
            let element = null;
            for (const sel of selectors) {
              try {
                const els = webview.document.querySelectorAll(sel);
                for (const el of els) {
                  if (el.offsetParent !== null) {
                    element = el;
                    break;
                  }
                }
                if (element) break;
              } catch(e) {}
            }
            
            if (element) {
              element.click();
              return { success: true };
            }
            
            // Try pressing Enter key as fallback
            const searchInput = webview.document.querySelector('input[aria-label="Search"], input[name="search"], #search-input');
            if (searchInput) {
              searchInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
              return { success: true, method: 'enter-key' };
            }
            
            return { success: false, error: 'Search button not found' };
          })();
        `);
        return result;
      }

      case 'scroll': {
        const { x, y } = params;
        const result = await win.webContents.executeJavaScript(`
          (function() {
            const webview = document.querySelector('webview');
            if (webview) {
              webview.executeJavaScript('window.scrollTo(${x || 0}, ${y || 300})');
              return { success: true };
            }
            return { success: false, error: 'Webview not found' };
          })();
        `);
        return result;
      }

      case 'getContent': {
        const result = await win.webContents.executeJavaScript(`
          (function() {
            const webview = document.querySelector('webview');
            if (webview) {
              try {
                const title = webview.getTitle();
                const url = webview.getURL();
                return { success: true, title, url };
              } catch(e) {
                return { success: false, error: e.message };
              }
            }
            return { success: false, error: 'Webview not found' };
          })();
        `);
        return result;
      }

      default:
        return { success: false, error: `Unknown action: ${action}` };
    }
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Get webview URL for context
ipcMain.handle('webview:getUrl', async () => {
  try {
    const win = getOrCreateAIBrowserWindow();
    const result = await win.webContents.executeJavaScript(`
      (function() {
        const webview = document.querySelector('webview');
        if (webview) {
          return { success: true, url: webview.getAttribute('src'), title: webview.getTitle ? webview.getTitle() : '' };
        }
        return { success: false, error: 'No webview' };
      })();
    `);
    return result;
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// ============================================
// AI BRAIN IPC HANDLERS (Uses webview directly now)
// ============================================

const AUTOMATION_SERVER = 'http://localhost:9222';

ipcMain.handle('ai-brain:execute', async (event, { task, userId }) => {
  try {
    // First get the current page context from webview
    let pageContext = '';
    try {
      const win = getOrCreateAIBrowserWindow();
      const contextResult = await win.webContents.executeJavaScript(`
        (function() {
          const webview = document.querySelector('webview');
          if (!webview) return { success: false };
          try {
            const title = webview.getTitle ? webview.getTitle() : '';
            const url = webview.getAttribute('src') || '';
            return { success: true, title, url };
          } catch(e) { return { success: false }; }
        })();
      `);
      if (contextResult?.success) {
        pageContext = `Current page: ${contextResult.title} (${contextResult.url})`;
      }
    } catch (e) {}

    // Use the AI backend to plan actions
    const response = await fetch(
      'http://localhost:4000/api/ai-browser-command',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: task }),
      }
    );

    const result = await response.json();

    console.log('[AI Brain] Result:', JSON.stringify(result).substring(0, 500));

    // Handle executed browser actions - NOW EXECUTE IN WEBVIEW
    if (result.success && result.executed && result.actions) {
      const win = getOrCreateAIBrowserWindow();
      const executedActions = [];

      // Execute each action in the webview
      for (const actionDesc of result.actions) {
        // Parse action from description
        const lowerDesc = actionDesc.toLowerCase();

        if (
          lowerDesc.includes('go to') ||
          lowerDesc.includes('navigate') ||
          lowerDesc.includes('youtube')
        ) {
          // Extract URL and navigate
          let url = 'https://www.youtube.com';
          if (lowerDesc.includes('youtube')) {
            const searchMatch = task.match(/search\s+(.+?)(?:on|\s+youtube)/i);
            if (searchMatch) {
              url = `https://www.youtube.com/results?search_query=${encodeURIComponent(searchMatch[1])}`;
            }
          }

          const navResult = await win.webContents.executeJavaScript(`
            (function() {
              const webview = document.querySelector('webview');
              if (webview) {
                webview.loadURL('${url}');
                return { success: true, url: '${url}' };
              }
              return { success: false, error: 'No webview' };
            })();
          `);
          executedActions.push({ action: 'navigate', result: navResult });
        } else if (lowerDesc.includes('search') || lowerDesc.includes('type')) {
          // Type in search box
          const searchMatch =
            task.match(/search\s+(.+?)(?:on|\s+youtube|$)/i) ||
            task.match(/(?:search|find|look up)\s+(.+)/i);
          const searchTerm = searchMatch
            ? searchMatch[1]
            : task.replace(/search/i, '').trim();

          // Type in search
          const typeResult = await win.webContents.executeJavaScript(`
            (function() {
              const webview = document.querySelector('webview');
              if (!webview) return { success: false, error: 'No webview' };
              
              const selectors = ['input[aria-label="Search"]', 'input[name="search"]', '#search-input', 
                                 'input[type="search"]', 'input[type="text"]', 'ytd-searchbox input'];
              let el = null;
              for (const sel of selectors) {
                try {
                  const els = webview.document.querySelectorAll(sel);
                  for (const e of els) { if (e.offsetParent !== null) { el = e; break; } }
                  if (el) break;
                } catch(e) {}
              }
              
              if (el) { el.focus(); el.value = '${searchTerm.replace(/'/g, "\\'")}'; el.dispatchEvent(new Event('input', {bubbles:true})); 
                return { success: true, value: '${searchTerm.replace(/'/g, "\\'")}' }; }
              return { success: false, error: 'Search input not found' };
            })();
          `);
          executedActions.push({ action: 'type', result: typeResult });

          // Click search button or press enter
          await new Promise((r) => setTimeout(r, 500));
          const clickResult = await win.webContents.executeJavaScript(`
            (function() {
              const webview = document.querySelector('webview');
              if (!webview) return { success: false };
              
              const btnSelectors = ['button[aria-label="Search"]', 'button#search-icon-legacy', 'ytd-searchbox button'];
              let el = null;
              for (const sel of btnSelectors) {
                try {
                  const els = webview.document.querySelectorAll(sel);
                  for (const e of els) { if (e.offsetParent !== null) { el = e; break; } }
                  if (el) break;
                } catch(e) {}
              }
              
              if (el) { el.click(); return { success: true }; }
              
              // Press Enter
              const inp = webview.document.querySelector('input[aria-label="Search"], input[name="search"]');
              if (inp) { inp.dispatchEvent(new KeyboardEvent('keydown', {key:'Enter', bubbles:true})); 
                return { success: true, method: 'enter' }; }
              return { success: false, error: 'No button found' };
            })();
          `);
          executedActions.push({ action: 'click', result: clickResult });
        } else if (lowerDesc.includes('scroll')) {
          await win.webContents.executeJavaScript(`
            const webview = document.querySelector('webview');
            if (webview) webview.executeJavaScript('window.scrollBy(0, 500)');
          `);
          executedActions.push({ action: 'scroll', result: { success: true } });
        }
      }

      const successCount = executedActions.filter(
        (a) => a.result?.success
      ).length;

      return {
        success: true,
        executed: true,
        actions: result.actions,
        steps: executedActions,
        message: `🤖 Executed ${executedActions.length} actions in webview (${successCount} succeeded)`,
        response: `I executed ${executedActions.length} actions in the browser:\n\n${executedActions.map((a, i) => `✅ ${i + 1}. ${a.action}: ${a.result?.success ? 'Success' : 'Failed'}`).join('\n')}\n\nThe page should now show the results!`,
      };
    }

    // Handle AI text response
    if (result.success && result.isAIResponse && result.response) {
      return {
        success: true,
        actions: [
          {
            type: 'AI_RESPONSE',
            content: result.response,
            provider: result.provider,
            model: result.model,
          },
        ],
        response: result.response,
      };
    }

    // Handle navigation URL - navigate in webview
    if (result.success && result.url) {
      const win = getOrCreateAIBrowserWindow();

      // Navigate in webview
      const navResult = await win.webContents.executeJavaScript(`
        (function() {
          const webview = document.querySelector('webview');
          if (webview) {
            webview.loadURL('${result.url.replace(/'/g, "\\'")}');
            return { success: true };
          }
          return { success: false };
        })();
      `);

      return {
        success: true,
        executed: true,
        actions: [{ type: 'NAVIGATE', value: result.url }],
        response: `🚀 Navigated to ${result.url}`,
        context: result.context || null,
      };
    }

    return result;
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('ai-brain:approve', async (event, { taskId, approved }) => {
  try {
    if (approved) {
      // Execute the approved action - get screenshot
      const screenshotRes = await fetch(`${AUTOMATION_SERVER}/api/screenshot`, {
        method: 'POST',
      });
      const screenshot = await screenshotRes.json();
      return {
        success: true,
        actions: [{ type: 'screenshot', result: screenshot }],
      };
    }
    return { success: true, message: 'Denied' };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('ai-brain:navigate', async (event, url) => {
  try {
    const response = await fetch(`${AUTOMATION_SERVER}/api/navigate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
    return await response.json();
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('ai-brain:get-task', async (event, taskId) => {
  return null;
});

// Tasks
ipcMain.handle('get-tasks', async (event, filter) => {
  // Return mock data for now - would connect to backend in production
  return [
    {
      id: 'task-1',
      type: 'generation',
      status: 'completed',
      provider: 'ChatGPT',
      intent: 'Generate political analysis',
      createdAt: new Date().toISOString(),
    },
    {
      id: 'task-2',
      type: 'research',
      status: 'processing',
      provider: 'Claude',
      intent: 'Research campaign finance',
      createdAt: new Date().toISOString(),
    },
    {
      id: 'task-3',
      type: 'analysis',
      status: 'pending',
      provider: 'Gemini',
      intent: 'Analyze polling data',
      createdAt: new Date().toISOString(),
    },
    {
      id: 'task-4',
      type: 'automation',
      status: 'failed',
      provider: 'Browser',
      intent: 'Scrape news',
      createdAt: new Date().toISOString(),
      error: 'Timeout',
    },
  ];
});

// Analytics
ipcMain.handle('get-analytics', async (event, period = '24h') => {
  try {
    const response = await fetch(
      `http://localhost:4000/api/analytics?period=${period}`
    );
    if (!response.ok) throw new Error('Failed to fetch analytics');
    return await response.json();
  } catch (error) {
    console.error('[IPC] Analytics error:', error.message);
    // Return fallback data on error
    return {
      totalTokens: 0,
      totalTasks: 0,
      totalCost: 0,
      avgResponseTime: 0,
      byProvider: {},
      workers: [],
      queues: [],
      period,
    };
  }
});

// Audit Log
ipcMain.handle('get-audit-log', async (event, filter = {}) => {
  try {
    const params = new URLSearchParams();
    if (filter.category) params.append('category', filter.category);
    if (filter.startDate) params.append('startDate', filter.startDate);
    if (filter.endDate) params.append('endDate', filter.endDate);
    if (filter.userId) params.append('userId', filter.userId);
    if (filter.severity) params.append('severity', filter.severity);

    const response = await fetch(
      `http://localhost:4000/api/audit-log?${params}`
    );
    if (!response.ok) throw new Error('Failed to fetch audit log');
    return await response.json();
  } catch (error) {
    console.error('[IPC] Audit log error:', error.message);
    return [];
  }
});

// Shard Health
ipcMain.handle('get-shard-health', async (event) => {
  try {
    const response = await fetch('http://localhost:4000/api/shard-health');
    if (!response.ok) throw new Error('Failed to fetch shard health');
    const health = await response.json();

    // Transform to match frontend expected format
    return health.map((h) => ({
      shardId: `${h.shardType}-shard-${h.shardId}`,
      shardType: h.shardType,
      isHealthy: h.isHealthy,
      isQuarantined: !h.isHealthy,
      currentLoad: h.errorRate || 0,
      activeConnections: 0,
      quarantineReason:
        h.consecutiveFailures > 3 ? 'Health check failures' : undefined,
    }));
  } catch (error) {
    console.error('[IPC] Shard health error:', error.message);
    return [];
  }
});

ipcMain.handle('refresh-shards', async (event) => {
  return { success: true };
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
