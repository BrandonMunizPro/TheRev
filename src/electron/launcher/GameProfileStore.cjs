const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

function defaultProfile() {
  return { favorite: false, notes: '', ai: { enabled: false } };
}

function validateProfile(profile) {
  if (
    !profile ||
    typeof profile.favorite !== 'boolean' ||
    typeof profile.notes !== 'string' ||
    profile.notes.length > 1000 ||
    profile.ai?.enabled !== false ||
    Object.keys(profile.ai).length !== 1 ||
    Object.keys(profile).some(
      (key) => !['favorite', 'notes', 'ai'].includes(key)
    )
  ) {
    throw new Error(
      'Invalid game profile; game AI integration is not available'
    );
  }
}

function validateLibrary(data) {
  if (
    data?.version !== 1 ||
    !Array.isArray(data.games) ||
    !data.settings ||
    typeof data.settings !== 'object' ||
    (data.settings.steamRoot !== null &&
      typeof data.settings.steamRoot !== 'string')
  ) {
    throw new Error('Unsupported or invalid game library');
  }
  const ids = new Set();
  const installations = new Set();
  for (const game of data.games) {
    // This slice accepts external Steam entries only. Native/distributed games
    // will need a schema migration, not a Steam identity alias.
    if (
      !game ||
      typeof game.id !== 'string' ||
      !/^[\w-]{1,80}$/.test(game.id) ||
      ids.has(game.id) ||
      game.origin !== 'external' ||
      typeof game.title !== 'string' ||
      !game.title ||
      game.title.length > 300 ||
      game.integration?.adapterId !== null ||
      Object.keys(game.integration).length !== 1 ||
      !Array.isArray(game.installations) ||
      game.installations.length !== 1
    ) {
      throw new Error('Invalid game library entry');
    }
    ids.add(game.id);
    validateProfile(game.profile);
    for (const install of game.installations) {
      if (
        install?.providerId !== 'steam' ||
        !/^[1-9]\d{0,9}$/.test(install.externalId) ||
        install.id !== 'steam:' + install.externalId ||
        installations.has(install.id) ||
        typeof install.installed !== 'boolean' ||
        (install.installPath !== null &&
          typeof install.installPath !== 'string') ||
        (install.manifestPath !== null &&
          typeof install.manifestPath !== 'string')
      ) {
        throw new Error('Invalid game installation');
      }
      installations.add(install.id);
    }
  }
}

class GameProfileStore {
  constructor(userDataPath) {
    this.filePath = path.join(userDataPath, 'game-library.json');
  }

  async load() {
    let contents;
    try {
      contents = await fs.readFile(this.filePath, 'utf8');
    } catch (error) {
      if (error.code === 'ENOENT')
        return { version: 1, settings: { steamRoot: null }, games: [] };
      throw error;
    }
    const data = JSON.parse(contents);
    validateLibrary(data);
    return data;
  }

  async save(data) {
    validateLibrary(data);
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    const temporary = this.filePath + '.' + randomUUID() + '.tmp';
    try {
      await fs.writeFile(temporary, JSON.stringify(data, null, 2), {
        flag: 'wx',
      });
      await fs.rename(temporary, this.filePath);
    } finally {
      await fs.unlink(temporary).catch((error) => {
        if (error.code !== 'ENOENT')
          console.warn('[Games] Temporary file cleanup failed:', error.message);
      });
    }
  }
}

module.exports = { GameProfileStore, defaultProfile, validateProfile };
