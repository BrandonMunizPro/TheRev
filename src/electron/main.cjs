const {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  dialog,
  shell,
} = require('electron');
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
    },
    icon: path.join(__dirname, '../assets/icon.png'),
    titleBarStyle: 'hiddenInset',
  });

  // Load the frontend - connect to localhost backend
  mainWindow.loadFile(path.join(__dirname, 'frontend/index.html'));

  // Open DevTools in development
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }

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
    return { success: true };
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

ipcMain.handle('open-ai-browser', async () => {
  createBrowserWindow();
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
