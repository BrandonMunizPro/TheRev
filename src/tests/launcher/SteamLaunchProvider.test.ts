const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const {
  SteamLaunchProvider,
} = require('../../electron/launcher/providers/SteamLaunchProvider.cjs');
const {
  parseValveKeyValues,
} = require('../../electron/launcher/ValveKeyValues.cjs');

const quote = (text: string) =>
  '"' + text.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';

describe('Steam launch provider', () => {
  let directory: string;
  let root: string;
  let secondary: string;
  let shell: any;
  let provider: any;

  beforeEach(async () => {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), 'therev-launcher-'));
    root = path.join(directory, 'Steam folder');
    secondary = path.join(directory, 'Second library');
    await fs.mkdir(path.join(root, 'steamapps', 'common'), { recursive: true });
    await fs.mkdir(path.join(secondary, 'steamapps', 'common'), {
      recursive: true,
    });
    await fs.writeFile(path.join(root, 'steam.exe'), '');
    await fs.writeFile(
      path.join(root, 'steamapps', 'libraryfolders.vdf'),
      '"libraryfolders" { "0" { "path" ' +
        quote(root) +
        ' } "1" { "path" ' +
        quote(secondary) +
        ' } "2" { "path" ' +
        quote(root) +
        ' } }'
    );
    shell = { openExternal: jest.fn().mockResolvedValue(undefined) };
    provider = new SteamLaunchProvider({
      shell,
      platform: 'win32',
      environment: {},
      registryQuery: jest
        .fn()
        .mockRejectedValue(new Error('Registry entry missing')),
    });
  });

  afterEach(async () => {
    const target = path.resolve(directory);
    if (
      path.dirname(target) !== path.resolve(os.tmpdir()) ||
      !path.basename(target).startsWith('therev-launcher-')
    ) {
      throw new Error('Unexpected fixture cleanup path');
    }
    await fs.rm(target, { recursive: true, force: true });
  });

  async function manifest(
    library: string,
    appId: string,
    name = 'Test game',
    folder = 'Test game',
    flags = '4',
    create = true
  ) {
    await fs.writeFile(
      path.join(library, 'steamapps', 'appmanifest_' + appId + '.acf'),
      '"AppState" { "appid" ' +
        quote(appId) +
        ' "name" ' +
        quote(name) +
        ' "installdir" ' +
        quote(folder) +
        ' "StateFlags" ' +
        quote(flags) +
        ' }'
    );
    if (create)
      await fs.mkdir(path.join(library, 'steamapps', 'common', folder), {
        recursive: true,
      });
  }

  it('parses nesting, comments, escaped quotes and Windows paths without prototype mutation', () => {
    const parsed = parseValveKeyValues(
      '// comment\n "outer" { "path" "C:\\\\Games" "name" "Game \\"name\\"" "__proto__" "safe" }'
    );
    expect(parsed.outer.path).toBe('C:\\Games');
    expect(parsed.outer.name).toBe('Game "name"');
    expect(parsed.outer.__proto__).toBe('safe');
    expect(Object.getPrototypeOf(parsed.outer)).toBeNull();
    for (const text of [
      '"x" {',
      '"x"',
      '"x" "a" "x" "b"',
      '}',
      '"x" "unfinished',
    ]) {
      expect(() => parseValveKeyValues(text)).toThrow();
    }
    expect(() => parseValveKeyValues('x'.repeat(1024 * 1024 + 1))).toThrow();
  });

  it('discovers secondary libraries and deduplicates libraries and app IDs', async () => {
    await manifest(root, '10', 'Primary');
    await manifest(secondary, '20', 'Secondary');
    await manifest(secondary, '10', 'Duplicate');
    const result = await provider.discover({ steamRoot: root });
    expect(result.status).toBe('ready');
    expect(result.installations.map((game: any) => game.externalId)).toEqual([
      '10',
      '20',
    ]);
    expect(result.installations.every((game: any) => game.installed)).toBe(
      true
    );
  });

  it('handles legacy library lists and registry-based custom Steam locations', async () => {
    await fs.writeFile(
      path.join(root, 'steamapps', 'libraryfolders.vdf'),
      '"LibraryFolders" { "1" ' + quote(secondary) + ' }'
    );
    await manifest(secondary, '20');
    provider.registryQuery.mockResolvedValue({
      stdout: ' SteamPath    REG_SZ    ' + root,
    });
    const result = await provider.discover();
    expect(result.installations[0].externalId).toBe('20');
    expect(provider.registryQuery.mock.calls[0][2]).toMatchObject({
      windowsHide: true,
      timeout: 3000,
    });
  });

  it('retains incomplete or missing installs as unavailable and excludes known support packages', async () => {
    await manifest(root, '10', 'Missing', 'Missing', '4', false);
    await manifest(root, '20', 'Downloading', 'Downloading', '1');
    await manifest(root, '228980', 'Steamworks Common Redistributables');
    const result = await provider.discover({ steamRoot: root });
    expect(
      result.installations.map((game: any) => [game.externalId, game.installed])
    ).toEqual([
      ['10', false],
      ['20', false],
    ]);
  });

  it('skips corrupt, oversized, mismatched and escaping manifests without losing valid games', async () => {
    await manifest(root, '10');
    await manifest(
      root,
      '30',
      'Escape',
      path.join('..', '..', 'outside'),
      '4',
      false
    );
    await fs.writeFile(
      path.join(root, 'steamapps', 'appmanifest_40.acf'),
      '"AppState" {'
    );
    await fs.writeFile(
      path.join(root, 'steamapps', 'appmanifest_50.acf'),
      'x'.repeat(1024 * 1024 + 1)
    );
    await fs.writeFile(
      path.join(root, 'steamapps', 'appmanifest_60.acf'),
      '"AppState" { "appid" "61" }'
    );
    const result = await provider.discover({ steamRoot: root });
    expect(result.installations.map((game: any) => game.externalId)).toEqual([
      '10',
    ]);
    expect(result.status).toBe('partial');
    expect(result.warnings).toHaveLength(4);
  });

  it('reports unreadable secondary libraries and still scans the primary library', async () => {
    await manifest(root, '10');
    await fs.rm(secondary, { recursive: true, force: true });
    const result = await provider.discover({ steamRoot: root });
    expect(result.installations).toHaveLength(1);
    expect(result.warnings).toHaveLength(1);
  });

  it('launches only a currently installed catalog entry using a fixed Steam URI', async () => {
    await manifest(root, '10');
    const installation = (await provider.discover({ steamRoot: root }))
      .installations[0];
    await provider.launch(installation, { steamRoot: root });
    expect(shell.openExternal).toHaveBeenCalledWith('steam://rungameid/10');
    shell.openExternal.mockClear();
    await fs.unlink(installation.manifestPath);
    await expect(
      provider.launch(installation, { steamRoot: root })
    ).rejects.toThrow('no longer available');
    expect(shell.openExternal).not.toHaveBeenCalled();
    await expect(
      provider.launch({ ...installation, externalId: '10/evil' }, {})
    ).rejects.toThrow('Invalid');
  });

  it('does not hand off after session cancellation and propagates protocol failures', async () => {
    await manifest(root, '10');
    const installation = (await provider.discover({ steamRoot: root }))
      .installations[0];
    const controller = new AbortController();
    controller.abort();
    await expect(
      provider.launch(
        installation,
        { steamRoot: root },
        { signal: controller.signal }
      )
    ).rejects.toThrow();
    expect(shell.openExternal).not.toHaveBeenCalled();
    shell.openExternal.mockRejectedValue(
      new Error('Steam protocol unavailable')
    );
    await expect(
      provider.launch(installation, { steamRoot: root })
    ).rejects.toThrow('protocol unavailable');
  });

  it('reports unsupported platforms and missing Steam without starting software', async () => {
    const other = new SteamLaunchProvider({ shell, platform: 'darwin' });
    expect((await other.discover()).status).toBe('unsupported');
    expect((await provider.discover()).status).toBe('not-found');
    await expect(provider.validateRoot(secondary)).rejects.toThrow();
    expect(shell.openExternal).not.toHaveBeenCalled();
  });
});
