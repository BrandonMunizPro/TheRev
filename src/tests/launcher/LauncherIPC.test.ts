const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { EventEmitter } = require('node:events');
const {
  registerLauncherIPC,
} = require('../../electron/launcher/registerLauncherIPC.cjs');

describe('Game launcher IPC boundary', () => {
  let handlers: Map<string, any>;
  let window: any;
  let event: any;
  let library: any;
  let sessions: any;
  let dialog: any;
  beforeEach(() => {
    handlers = new Map();
    const frontendPath = path.resolve('src/electron/frontend/index.html');
    const mainFrame = { url: pathToFileURL(frontendPath).href };
    window = {
      isDestroyed: () => false,
      webContents: {
        mainFrame,
        isDestroyed: () => false,
        getURL: () => mainFrame.url,
        send: jest.fn(),
      },
    };
    event = { sender: window.webContents, senderFrame: mainFrame };
    library = {
      getLibrary: jest.fn(async () => ({ games: [] })),
      refresh: jest.fn(async () => ({ games: [] })),
      updateProfile: jest.fn(),
      setSteamRoot: jest.fn(),
    };
    sessions = Object.assign(new EventEmitter(), {
      getSession: jest.fn(() => null),
      launch: jest.fn(),
      end: jest.fn(),
    });
    dialog = {
      showOpenDialog: jest.fn(async () => ({ canceled: true, filePaths: [] })),
    };
    registerLauncherIPC({
      ipcMain: {
        handle: (name: string, handler: any) => handlers.set(name, handler),
      },
      dialog,
      getMainWindow: () => window,
      frontendPath,
      library,
      sessions,
    });
  });

  it('rejects browser windows, subframes and a main window navigated to remote content', async () => {
    for (const untrusted of [
      { ...event, sender: {} },
      { ...event, senderFrame: { url: event.senderFrame.url } },
      { ...event, senderFrame: null },
    ]) {
      expect(
        (await handlers.get('games:launch')(untrusted, 'game-1')).success
      ).toBe(false);
    }
    event.senderFrame.url = 'https://example.com';
    expect((await handlers.get('games:launch')(event, 'game-1')).success).toBe(
      false
    );
    expect(sessions.launch).not.toHaveBeenCalled();
    expect(library.getLibrary).not.toHaveBeenCalled();
  });

  it('returns library/session state and forwards only IDs and constrained profile patches', async () => {
    expect(await handlers.get('games:get-library')(event)).toEqual({
      success: true,
      data: { library: { games: [] }, session: null },
    });
    await handlers.get('games:launch')(event, 'game-1');
    expect(sessions.launch).toHaveBeenCalledWith('game-1');
    sessions.launch.mockRejectedValueOnce(new Error('Unknown game'));
    expect(await handlers.get('games:launch')(event, 'unknown')).toEqual({
      success: false,
      error: 'Unknown game',
    });
  });

  it('does not change configuration when folder selection is canceled', async () => {
    expect(await handlers.get('games:choose-steam-folder')(event)).toEqual({
      success: true,
      data: { canceled: true },
    });
    expect(library.setSteamRoot).not.toHaveBeenCalled();
    dialog.showOpenDialog.mockResolvedValueOnce({
      canceled: false,
      filePaths: ['C:\\Steam'],
    });
    expect(
      (await handlers.get('games:choose-steam-folder')(event)).success
    ).toBe(true);
    expect(library.setSteamRoot).toHaveBeenCalledWith('C:\\Steam');
    expect(library.refresh).toHaveBeenCalled();
  });

  it('sends session events only to the trusted local main window', () => {
    sessions.emit('changed', { state: 'launching' });
    expect(window.webContents.send).toHaveBeenCalledWith(
      'games:session-changed',
      { state: 'launching' }
    );
    window.webContents.send.mockClear();
    event.senderFrame.url = 'https://example.com';
    sessions.emit('changed', { state: 'launch-requested' });
    expect(window.webContents.send).not.toHaveBeenCalled();
  });
});
