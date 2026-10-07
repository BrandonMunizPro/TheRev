const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {
  GameProfileStore,
  defaultProfile,
} = require('../../electron/launcher/GameProfileStore.cjs');

describe('Local game profile persistence', () => {
  let directory: string;
  let store: any;
  beforeEach(async () => {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), 'therev-profiles-'));
    store = new GameProfileStore(directory);
  });
  afterEach(async () => {
    const target = path.resolve(directory);
    if (
      path.dirname(target) !== path.resolve(os.tmpdir()) ||
      !path.basename(target).startsWith('therev-profiles-')
    ) {
      throw new Error('Unexpected fixture cleanup path');
    }
    await fs.rm(target, { recursive: true, force: true });
  });
  it('starts with an empty library and atomically replaces saved data', async () => {
    const data = await store.load();
    expect(data).toEqual({
      version: 1,
      settings: { steamRoot: null },
      games: [],
    });
    data.games.push({
      id: 'the-rev-game-id',
      title: 'Game',
      origin: 'external',
      integration: { adapterId: null },
      profile: defaultProfile(),
      installations: [
        {
          id: 'steam:10',
          providerId: 'steam',
          externalId: '10',
          installed: true,
          installPath: null,
          manifestPath: null,
        },
      ],
    });
    await store.save(data);
    data.games[0].profile.notes = 'Saved notes';
    await store.save(data);
    expect((await store.load()).games[0].profile.notes).toBe('Saved notes');
    expect(await fs.readdir(directory)).toEqual(['game-library.json']);
  });
  it('preserves invalid or newer-version files and refuses enabled game AI', async () => {
    await fs.writeFile(store.filePath, '{"version":2,"games":[]}');
    await expect(store.load()).rejects.toThrow('Unsupported');
    expect(await fs.readFile(store.filePath, 'utf8')).toBe(
      '{"version":2,"games":[]}'
    );
    await fs.writeFile(store.filePath, 'broken');
    await expect(store.load()).rejects.toThrow();
    expect(await fs.readFile(store.filePath, 'utf8')).toBe('broken');
    const data = {
      version: 1,
      settings: { steamRoot: null },
      games: [
        {
          id: 'game',
          title: 'Game',
          origin: 'external',
          integration: { adapterId: null },
          profile: { ...defaultProfile(), ai: { enabled: true } },
          installations: [
            {
              id: 'steam:10',
              providerId: 'steam',
              externalId: '10',
              installed: true,
              installPath: null,
              manifestPath: null,
            },
          ],
        },
      ],
    };
    await expect(store.save(data)).rejects.toThrow('Invalid game profile');
  });
});
