const fs = require('node:fs/promises');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { parseValveKeyValues } = require('../ValveKeyValues.cjs');

const executeFile = promisify(execFile);
const MAX_METADATA_BYTES = 1024 * 1024;

async function readMetadata(file) {
  const handle = await fs.open(file, 'r');
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > MAX_METADATA_BYTES)
      throw new Error('Invalid Steam metadata size');
    const buffer = Buffer.alloc(MAX_METADATA_BYTES + 1);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    if (bytesRead > MAX_METADATA_BYTES)
      throw new Error('Steam metadata is too large');
    return parseValveKeyValues(buffer.subarray(0, bytesRead).toString('utf8'));
  } finally {
    await handle.close();
  }
}

function contained(base, candidate) {
  const relative = path.relative(base, candidate);
  return (
    relative !== '' &&
    relative !== '..' &&
    !relative.startsWith('..' + path.sep) &&
    !path.isAbsolute(relative)
  );
}

class SteamLaunchProvider {
  constructor({
    shell,
    platform = process.platform,
    environment = process.env,
    registryQuery = executeFile,
  }) {
    this.id = 'steam';
    this.shell = shell;
    this.platform = platform;
    this.environment = environment;
    this.registryQuery = registryQuery;
  }

  async findRoot(override) {
    if (override) return this.validateRoot(override);
    const candidates = [];
    const registry = path.join(
      this.environment.SystemRoot || 'C:\\Windows',
      'System32',
      'reg.exe'
    );
    for (const [key, value] of [
      ['HKCU\\Software\\Valve\\Steam', 'SteamPath'],
      ['HKLM\\SOFTWARE\\WOW6432Node\\Valve\\Steam', 'InstallPath'],
      ['HKLM\\SOFTWARE\\Valve\\Steam', 'InstallPath'],
    ]) {
      try {
        const { stdout } = await this.registryQuery(
          registry,
          ['query', key, '/v', value],
          {
            windowsHide: true,
            timeout: 3000,
            maxBuffer: 64 * 1024,
          }
        );
        const match = stdout.match(
          new RegExp('^\\s*' + value + '\\s+REG_SZ\\s+(.+)$', 'im')
        );
        if (match) candidates.push(match[1].trim());
      } catch {
        /* Steam may not have this registry entry. */
      }
    }
    for (const base of [
      this.environment['ProgramFiles(x86)'],
      this.environment.ProgramFiles,
    ]) {
      if (base) candidates.push(path.join(base, 'Steam'));
    }
    for (const candidate of candidates) {
      try {
        return await this.validateRoot(candidate);
      } catch {
        /* Try next root. */
      }
    }
    return null;
  }

  async validateRoot(root) {
    if (this.platform !== 'win32')
      throw new Error('Steam discovery currently supports Windows');
    if (typeof root !== 'string' || !path.isAbsolute(root))
      throw new Error('Choose an absolute Steam installation folder');
    const resolved = await fs.realpath(root);
    if (!(await fs.stat(path.join(resolved, 'steam.exe'))).isFile())
      throw new Error('Steam executable not found');
    if (!(await fs.stat(path.join(resolved, 'steamapps'))).isDirectory())
      throw new Error('Steam library folder not found');
    return resolved;
  }

  async discover({ steamRoot = null } = {}) {
    if (this.platform !== 'win32')
      return {
        installations: [],
        warnings: ['Steam discovery currently supports Windows.'],
        status: 'unsupported',
      };
    let root;
    try {
      root = await this.findRoot(steamRoot);
    } catch {
      return {
        installations: [],
        warnings: [
          'The selected Steam folder is unavailable. Choose it again.',
        ],
        status: 'unavailable',
      };
    }
    if (!root)
      return {
        installations: [],
        warnings: ['Steam was not found. Choose its installation folder.'],
        status: 'not-found',
      };
    const warnings = [];
    const libraries = new Set([root]);
    try {
      const metadata = await readMetadata(
        path.join(root, 'steamapps', 'libraryfolders.vdf')
      );
      const folders = metadata.libraryfolders || metadata.LibraryFolders;
      if (!folders || typeof folders !== 'object')
        throw new Error('Missing library list');
      for (const [key, value] of Object.entries(folders)) {
        if (!/^\d+$/.test(key)) continue;
        const location = typeof value === 'string' ? value : value?.path;
        if (typeof location === 'string' && path.isAbsolute(location))
          libraries.add(location);
      }
    } catch {
      warnings.push(
        'Steam library locations could not be read; scanning the primary library only.'
      );
    }
    const installations = new Map();
    const visited = new Set();
    for (const location of libraries) {
      let library, files;
      try {
        library = await fs.realpath(location);
        const key = library.toLowerCase();
        if (visited.has(key)) continue;
        visited.add(key);
        files = await fs.readdir(path.join(library, 'steamapps'));
      } catch {
        warnings.push('A Steam library is unavailable or unreadable.');
        continue;
      }
      for (const file of files.sort()) {
        const match = file.match(/^appmanifest_([1-9]\d{0,9})\.acf$/i);
        if (!match) continue;
        try {
          const manifestPath = path.join(library, 'steamapps', file);
          const manifest = (await readMetadata(manifestPath)).AppState;
          if (
            !manifest ||
            manifest.appid !== match[1] ||
            typeof manifest.name !== 'string' ||
            !manifest.name.trim() ||
            manifest.name.length > 300 ||
            typeof manifest.installdir !== 'string' ||
            !manifest.installdir ||
            !/^\d+$/.test(manifest.StateFlags)
          )
            throw new Error('Invalid game manifest');
          // ACF files lack authoritative application-type metadata.
          if (
            manifest.appid === '228980' ||
            /^(Proton(?:\s|$)|Steam Linux Runtime(?:\s|$))/i.test(manifest.name)
          )
            continue;
          const common = path.join(library, 'steamapps', 'common');
          const installPath = path.resolve(common, manifest.installdir);
          if (!contained(common, installPath))
            throw new Error('Invalid installation path');
          let installed = false;
          try {
            const [realCommon, realInstall] = await Promise.all([
              fs.realpath(common),
              fs.realpath(installPath),
            ]);
            installed =
              contained(realCommon, realInstall) &&
              (await fs.stat(realInstall)).isDirectory() &&
              (Number(manifest.StateFlags) & 4) === 4;
          } catch {
            /* Missing installation is retained as unavailable. */
          }
          const record = {
            id: 'steam:' + manifest.appid,
            providerId: this.id,
            externalId: manifest.appid,
            title: manifest.name.trim(),
            installed,
            installPath,
            manifestPath,
          };
          const prior = installations.get(record.id);
          if (!prior || (!prior.installed && installed))
            installations.set(record.id, record);
        } catch {
          warnings.push(
            'Could not read ' + file + '; skipped this Steam entry.'
          );
        }
      }
    }
    return {
      installations: [...installations.values()],
      warnings,
      status: warnings.length ? 'partial' : 'ready',
    };
  }

  async launch(installation, settings, { signal } = {}) {
    if (
      installation.providerId !== this.id ||
      !/^[1-9]\d{0,9}$/.test(installation.externalId)
    ) {
      throw new Error('Invalid Steam installation');
    }
    // Re-resolve from current metadata, never renderer commands or saved paths.
    const current = await this.discover(settings);
    const found = current.installations.find(
      (item) => item.id === installation.id && item.installed
    );
    if (!found)
      throw new Error(
        'This game is no longer available. Refresh your library.'
      );
    signal?.throwIfAborted();
    await this.shell.openExternal('steam://rungameid/' + found.externalId);
    return { handoff: 'launch-requested', running: 'unknown' };
  }
}

module.exports = { SteamLaunchProvider };
