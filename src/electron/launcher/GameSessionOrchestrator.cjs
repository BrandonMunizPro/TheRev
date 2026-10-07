const { EventEmitter } = require('node:events');
const { randomUUID } = require('node:crypto');

const copy = (value) => (value ? JSON.parse(JSON.stringify(value)) : null);
const LIVE_STATES = new Set(['preparing', 'launching', 'launch-requested']);

class GameSessionOrchestrator extends EventEmitter {
  constructor({ library }) {
    super();
    this.library = library;
    this.session = null;
    this.controller = null;
    this.disposed = false;
  }

  getSession() {
    return copy(this.session);
  }

  transition(state, details = {}) {
    Object.assign(this.session, details, {
      state,
      updatedAt: new Date().toISOString(),
    });
    this.emit('changed', this.getSession());
  }

  async launch(gameId) {
    if (this.disposed) throw new Error('Game launcher is closed');
    if (this.session && LIVE_STATES.has(this.session.state)) {
      throw new Error(
        'End the current TheRev session before launching another game'
      );
    }
    if (typeof gameId !== 'string' || !/^[\w-]{1,80}$/.test(gameId))
      throw new Error('Invalid game ID');
    this.controller = new AbortController();
    const signal = this.controller.signal;
    this.session = {
      id: randomUUID(),
      gameId,
      title: '',
      providerId: null,
      profile: null,
      state: 'preparing',
      running: 'unknown',
      integrationState: 'disabled',
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      endedAt: null,
      error: null,
    };
    this.emit('changed', this.getSession());
    try {
      const context = await this.library.getLaunchContext(gameId);
      signal.throwIfAborted();
      // Future game integration preparation belongs here, before launch handoff.
      // It must use authorized TheRev capabilities, never provider credentials.
      if (
        context.game.integration.adapterId !== null ||
        context.game.profile.ai.enabled
      ) {
        throw new Error(
          'Game AI integrations are not available in this version'
        );
      }
      this.transition('launching', {
        title: context.game.title,
        providerId: context.provider.id,
        profile: copy(context.game.profile),
      });
      await context.provider.launch(context.installation, context.settings, {
        signal,
      });
      signal.throwIfAborted();
      // Launch-provider handoff is independent from a future integration session
      // and supplies no evidence that the game process is running.
      this.transition('launch-requested');
      return this.getSession();
    } catch (error) {
      if (!this.disposed)
        this.transition('failed', {
          error: error.message,
          endedAt: new Date().toISOString(),
        });
      throw error;
    }
  }

  end(sessionId) {
    if (!this.session || this.session.id !== sessionId)
      throw new Error('Session not found');
    if (['preparing', 'launching'].includes(this.session.state)) {
      throw new Error('Wait for the launch request to finish');
    }
    if (this.session.state === 'ended') return this.getSession();
    // Dispose only session-owned resources here when integrations exist.
    // Shared Ollama/provider adapters and the external game are not owned here.
    this.transition('ended', { endedAt: new Date().toISOString() });
    return this.getSession();
  }

  dispose() {
    this.disposed = true;
    this.controller?.abort();
    if (this.session && LIVE_STATES.has(this.session.state)) {
      this.transition('ended', { endedAt: new Date().toISOString() });
    }
    this.removeAllListeners();
  }
}

module.exports = { GameSessionOrchestrator };
