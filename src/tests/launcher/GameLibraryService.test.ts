const {
  GameLibraryService,
} = require('../../electron/launcher/GameLibraryService.cjs');
const {
  defaultProfile,
} = require('../../electron/launcher/GameProfileStore.cjs');

const clone = (value: any) => JSON.parse(JSON.stringify(value));
const installation = {
  id: 'steam:10',
  providerId: 'steam',
  externalId: '10',
  title: 'Test game',
  installed: true,
  installPath: 'C:\\Steam\\Game',
  manifestPath: 'C:\\Steam\\manifest',
};

describe('TheRev game library', () => {
  let data: any;
  let store: any;
  let provider: any;
  let library: any;
  beforeEach(() => {
    data = { version: 1, games: [], settings: { steamRoot: null } };
    store = {
      load: jest.fn(async () => clone(data)),
      save: jest.fn(async (next: any) => {
        data = clone(next);
      }),
    };
    provider = {
      id: 'steam',
      discover: jest.fn(async () => ({
        installations: [installation],
        warnings: [],
        status: 'ready',
      })),
      validateRoot: jest.fn(async (root: string) => root),
    };
    library = new GameLibraryService({ store, providers: [provider] });
  });

  it('owns identity separately from origin, launch provider and integration support', async () => {
    const game = (await library.getLibrary()).games[0];
    expect(game.id).not.toBe('steam:10');
    expect(game).toMatchObject({
      origin: 'external',
      integration: { adapterId: null },
      profile: defaultProfile(),
    });
    expect(game.installations[0].id).toBe('steam:10');
    const restarted = new GameLibraryService({ store, providers: [provider] });
    expect((await restarted.getLibrary()).games[0].id).toBe(game.id);
  });

  it('preserves profiles and identities across disappearance and rediscovery', async () => {
    const game = (await library.getLibrary()).games[0];
    await library.updateProfile(game.id, {
      favorite: true,
      notes: 'My campaign',
    });
    provider.discover.mockResolvedValueOnce({
      installations: [],
      warnings: [],
      status: 'ready',
    });
    const missing = (await library.refresh()).games[0];
    expect(missing.id).toBe(game.id);
    expect(missing.installations[0].installed).toBe(false);
    expect(missing.profile.notes).toBe('My campaign');
    const returned = (await library.refresh()).games[0];
    expect(returned.id).toBe(game.id);
    expect(returned.profile.favorite).toBe(true);
    expect(returned.installations[0].installed).toBe(true);
  });

  it('serializes refreshes and profile edits and serves cached discovery on navigation', async () => {
    const game = (await library.getLibrary()).games[0];
    await Promise.all([
      library.refresh(),
      library.updateProfile(game.id, { notes: 'Keep this' }),
    ]);
    expect((await library.getLibrary()).games[0].profile.notes).toBe(
      'Keep this'
    );
    expect(provider.discover).toHaveBeenCalledTimes(2);
  });

  it('never commits failed writes or overwrites a corrupt library', async () => {
    const game = (await library.getLibrary()).games[0];
    store.save.mockRejectedValueOnce(new Error('Disk full'));
    await expect(
      library.updateProfile(game.id, { favorite: true })
    ).rejects.toThrow('Disk full');
    expect((await library.getLibrary()).games[0].profile.favorite).toBe(false);
    store.load.mockRejectedValue(new Error('Corrupt library'));
    const broken = new GameLibraryService({ store, providers: [provider] });
    store.save.mockClear();
    await expect(broken.getLibrary()).rejects.toThrow('Corrupt library');
    expect(store.save).not.toHaveBeenCalled();
  });

  it('rejects AI settings, arbitrary targets and invalid profile data', async () => {
    const game = (await library.getLibrary()).games[0];
    await expect(
      library.updateProfile(game.id, { ai: { enabled: true } })
    ).rejects.toThrow();
    await expect(
      library.updateProfile(game.id, { executable: 'bad.exe' })
    ).rejects.toThrow();
    await expect(
      library.updateProfile(game.id, { favorite: 'yes' })
    ).rejects.toThrow();
    await expect(
      library.updateProfile(game.id, { notes: 'x'.repeat(1001) })
    ).rejects.toThrow();
    await expect(library.getLaunchContext('unknown')).rejects.toThrow(
      'Game not found'
    );
    provider.discover.mockRejectedValueOnce(new Error('Unreadable'));
    await library.refresh();
    await expect(library.getLaunchContext(game.id)).rejects.toThrow(
      'No available installation'
    );
  });

  it('uses only validated Steam folder overrides', async () => {
    await library.setSteamRoot('C:\\Custom Steam');
    expect(data.settings.steamRoot).toBe('C:\\Custom Steam');
    provider.validateRoot.mockRejectedValueOnce(new Error('Invalid root'));
    await expect(library.setSteamRoot('C:\\Wrong')).rejects.toThrow();
    expect(data.settings.steamRoot).toBe('C:\\Custom Steam');
    await library.setSteamRoot(null);
    expect(data.settings.steamRoot).toBeNull();
  });
});
