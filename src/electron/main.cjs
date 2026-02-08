const { app, BrowserWindow, ipcMain, Menu } = require('electron');
const path = require('path');
const { exec } = require('child_process');

let mainWindow;

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
