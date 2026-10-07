const { randomUUID } = require('node:crypto');
const { defaultProfile, validateProfile } = require('./GameProfileStore.cjs');

const copy = (value) => JSON.parse(JSON.stringify(value));

class GameLibraryService {
  constructor({ store, providers }) {
    this.store = store;
    this.providers = new Map(
      providers.map((provider) => [provider.id, provider])
    );
    this.data = null;
    this.scanned = false;
    this.discovery = [];
    this.queue = Promise.resolve();
  }

  // Serialize discovery/profile/settings writes so a refresh cannot overwrite
  // an edit. Commit in memory only after the atomic disk write succeeds.
  run(operation) {
    const pending = this.queue.then(operation);
    this.queue = pending.catch(() => {});
    return pending;
  }

  async ensureLoaded() {
    if (!this.data) this.data = await this.store.load();
  }

  snapshot() {
    return copy({
      games: this.data.games,
      discovery: this.discovery,
      settings: this.data.settings,
      platform: process.platform,
    });
  }

  getLibrary() {
    return this.run(async () => {
      await this.ensureLoaded();
      if (!this.scanned) await this.scan();
      return this.snapshot();
    });
  }

  refresh() {
    return this.run(async () => {
      await this.ensureLoaded();
      await this.scan();
      return this.snapshot();
    });
  }

  async scan() {
    const next = copy(this.data);
    const discovery = [];
    for (const provider of this.providers.values()) {
      let result;
      try {
        result = await provider.discover(next.settings);
      } catch {
        result = {
          installations: [],
          status: 'unavailable',
          warnings: ['Game discovery failed. Try refreshing.'],
        };
      }
      discovery.push({
        providerId: provider.id,
        status: result.status,
        warnings: result.warnings,
      });
      for (const game of next.games) {
        for (const installation of game.installations) {
          if (installation.providerId === provider.id)
            installation.installed = false;
        }
      }
      for (const discovered of result.installations) {
        let game = next.games.find((item) =>
          item.installations.some(
            (installation) => installation.id === discovered.id
          )
        );
        if (!game) {
          game = {
            id: randomUUID(),
            title: discovered.title,
            origin: 'external',
            integration: { adapterId: null },
            profile: defaultProfile(),
            installations: [],
          };
          next.games.push(game);
        }
        const installation = {
          id: discovered.id,
          providerId: provider.id,
          externalId: discovered.externalId,
          installed: discovered.installed,
          installPath: discovered.installPath,
          manifestPath: discovered.manifestPath,
        };
        const index = game.installations.findIndex(
          (item) => item.id === installation.id
        );
        if (index < 0) game.installations.push(installation);
        else game.installations[index] = installation;
        game.title = discovered.title;
      }
    }
    await this.store.save(next);
    this.data = next;
    this.discovery = discovery;
    this.scanned = true;
  }

  updateProfile(gameId, patch) {
    return this.run(async () => {
      await this.ensureLoaded();
      if (
        !patch ||
        typeof patch !== 'object' ||
        Array.isArray(patch) ||
        Object.keys(patch).some((key) => !['favorite', 'notes'].includes(key))
      ) {
        throw new Error(
          'Only favorite and notes can be edited in a game profile'
        );
      }
      const next = copy(this.data);
      const game = next.games.find((item) => item.id === gameId);
      if (!game) throw new Error('Game not found');
      game.profile = { ...game.profile, ...patch };
      validateProfile(game.profile);
      await this.store.save(next);
      this.data = next;
      return copy(game);
    });
  }

  setSteamRoot(root) {
    return this.run(async () => {
      await this.ensureLoaded();
      const provider = this.providers.get('steam');
      const validated =
        root === null ? null : await provider.validateRoot(root);
      const next = copy(this.data);
      next.settings.steamRoot = validated;
      await this.store.save(next);
      this.data = next;
      this.scanned = false;
    });
  }

  getLaunchContext(gameId) {
    return this.run(async () => {
      await this.ensureLoaded();
      if (!this.scanned) await this.scan();
      const game = this.data.games.find((item) => item.id === gameId);
      if (!game) throw new Error('Game not found');
      const installation = game.installations.find(
        (item) => item.installed && this.providers.has(item.providerId)
      );
      if (!installation)
        throw new Error('No available installation. Refresh your library.');
      return {
        game: copy(game),
        installation: copy(installation),
        settings: copy(this.data.settings),
        provider: this.providers.get(installation.providerId),
      };
    });
  }
}

module.exports = { GameLibraryService };
