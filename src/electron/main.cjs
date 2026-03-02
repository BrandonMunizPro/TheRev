const { app, BrowserWindow, ipcMain, Menu, dialog, shell } = require('electron');
const path = require('path');
const { exec, spawn } = require('child_process');
const fs = require('fs');

let mainWindow;
let ollamaProcess = null;

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

function createBrowserWindow() {
  const browserWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: false,
    },
    title: 'Rev Sandbox Browser',
  });

  browserWindow.loadURL('https://www.google.com');
  return browserWindow;
}

// IPC handlers for sandbox browser commands
ipcMain.handle('execute-browser-command', async (event, command) => {
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
    exec('curl -s http://localhost:11434/api/tags', { timeout: 3000 }, (error) => {
      resolve(!error);
    });
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
          reject(new Error('Failed to start Ollama. Please make sure Ollama is installed.'));
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
