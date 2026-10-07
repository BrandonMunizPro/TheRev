const { pathToFileURL } = require('node:url');

// The shared preload is also used by browser windows. Trust both the specific
// main window and its top-level local document, not just a file:// origin.
function isTrustedLauncherSender(event, mainWindow, frontendPath) {
  if (
    !mainWindow ||
    mainWindow.isDestroyed() ||
    event.sender !== mainWindow.webContents
  )
    return false;
  const frame = event.senderFrame;
  return Boolean(
    frame &&
    frame === mainWindow.webContents.mainFrame &&
    frame.url === pathToFileURL(frontendPath).href
  );
}

function registerLauncherIPC({
  ipcMain,
  dialog,
  getMainWindow,
  frontendPath,
  library,
  sessions,
}) {
  const handle = (channel, operation) => {
    ipcMain.handle(channel, async (event, ...args) => {
      if (!isTrustedLauncherSender(event, getMainWindow(), frontendPath)) {
        return { success: false, error: 'Game launcher access denied' };
      }
      try {
        return { success: true, data: await operation(...args) };
      } catch (error) {
        console.warn('[Games]', channel, error.message);
        return { success: false, error: error.message };
      }
    });
  };

  const state = async (refresh = false) => ({
    library: await (refresh ? library.refresh() : library.getLibrary()),
    session: sessions.getSession(),
  });
  handle('games:get-library', () => state());
  handle('games:refresh', () => state(true));
  handle('games:update-profile', (gameId, patch) =>
    library.updateProfile(gameId, patch)
  );
  handle('games:launch', (gameId) => sessions.launch(gameId));
  handle('games:end-session', (sessionId) => sessions.end(sessionId));
  handle('games:choose-steam-folder', async () => {
    const selected = await dialog.showOpenDialog(getMainWindow(), {
      title: 'Choose the Steam installation folder',
      properties: ['openDirectory'],
    });
    if (selected.canceled || !selected.filePaths.length)
      return { canceled: true };
    await library.setSteamRoot(selected.filePaths[0]);
    return { canceled: false, ...(await state(true)) };
  });
  handle('games:reset-steam-folder', async () => {
    await library.setSteamRoot(null);
    return state(true);
  });
  const changed = (session) => {
    const window = getMainWindow();
    if (
      window &&
      !window.isDestroyed() &&
      !window.webContents.isDestroyed() &&
      window.webContents.getURL() === pathToFileURL(frontendPath).href
    ) {
      window.webContents.send('games:session-changed', session);
    }
  };
  sessions.on('changed', changed);
}

module.exports = { registerLauncherIPC, isTrustedLauncherSender };
