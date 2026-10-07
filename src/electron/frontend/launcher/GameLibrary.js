const LIVE_STATES = new Set(['preparing', 'launching', 'launch-requested']);

export class GameLibrary {
  constructor({ root, api }) {
    this.root = root;
    this.api = api;
    this.games = [];
    this.session = null;
    this.busy = false;
    this.list = root.querySelector('#games-list');
    this.message = root.querySelector('#games-message');
    this.sessionPanel = root.querySelector('#games-session');
    this.search = root.querySelector('#games-search');
    this.onClick = (event) => this.handleClick(event);
    this.onSubmit = (event) => this.handleProfileSubmit(event);
    this.onSearch = () => this.renderGames();
    root.addEventListener('click', this.onClick);
    root.addEventListener('submit', this.onSubmit);
    this.search.addEventListener('input', this.onSearch);
    if (api?.onGameSessionChanged) {
      this.unsubscribe = api.onGameSessionChanged((session) => {
        this.session = session;
        this.renderSession();
        this.updateButtons();
      });
    }
  }

  dispose() {
    this.unsubscribe?.();
    this.root.removeEventListener('click', this.onClick);
    this.root.removeEventListener('submit', this.onSubmit);
    this.search.removeEventListener('input', this.onSearch);
  }

  showMessage(text, error = false) {
    this.message.textContent = text;
    this.message.classList.toggle('games-error', error);
  }

  async request(method, ...args) {
    if (!this.api?.[method])
      throw new Error('Games are available in the TheRev desktop app.');
    const result = await this.api[method](...args);
    if (!result.success)
      throw new Error(result.error || 'Game launcher request failed');
    return result.data;
  }

  async perform(operation) {
    if (this.busy) return;
    this.busy = true;
    this.updateButtons();
    try {
      await operation();
    } catch (error) {
      this.showMessage(error.message, true);
    } finally {
      this.busy = false;
      this.updateButtons();
    }
  }

  async open(forceRefresh = false) {
    await this.perform(async () => {
      this.showMessage(
        forceRefresh
          ? 'Refreshing your game library...'
          : 'Loading your game library...'
      );
      const state = await this.request(
        forceRefresh ? 'refreshGames' : 'getGames'
      );
      this.applyState(state);
    });
  }

  applyState(state) {
    this.games = state.library.games;
    this.session = state.session;
    this.root.querySelector('#games-steam-folder').textContent = state.library
      .settings.steamRoot
      ? 'Steam folder: ' + state.library.settings.steamRoot
      : 'Steam folder: automatic discovery';
    const warnings = state.library.discovery.flatMap(
      (provider) => provider.warnings
    );
    this.showMessage(
      warnings.length
        ? warnings.join(' ')
        : this.games.length +
            ' library ' +
            (this.games.length === 1 ? 'entry' : 'entries') +
            '.'
    );
    this.renderGames();
    this.renderSession();
  }

  async handleClick(event) {
    const button = event.target.closest('button[data-games-action]');
    if (!button || !this.root.contains(button)) return;
    const action = button.dataset.gamesAction;
    if (action === 'refresh') return this.open(true);
    await this.perform(async () => {
      if (action === 'choose-folder') {
        const result = await this.request('chooseSteamFolder');
        if (!result.canceled) this.applyState(result);
      } else if (action === 'reset-folder') {
        this.applyState(await this.request('resetSteamFolder'));
      } else if (action === 'launch') {
        this.showMessage('Preparing your TheRev session...');
        this.session = await this.request('launchGame', button.dataset.gameId);
        this.renderSession();
        this.showMessage(
          'Launch requested through Steam. Game running status is unknown.'
        );
      } else if (action === 'end-session') {
        this.session = await this.request('endGameSession', this.session.id);
        this.renderSession();
        this.showMessage('TheRev session ended.');
      }
    });
  }

  async handleProfileSubmit(event) {
    const form = event.target.closest('form[data-game-profile]');
    if (!form || !this.root.contains(form)) return;
    event.preventDefault();
    await this.perform(async () => {
      const game = await this.request(
        'updateGameProfile',
        form.dataset.gameProfile,
        {
          favorite: form.querySelector('input[type="checkbox"]').checked,
          notes: form.querySelector('textarea').value,
        }
      );
      this.games = this.games.map((item) =>
        item.id === game.id ? game : item
      );
      this.showMessage('Game profile saved.');
      this.renderGames();
    });
  }

  renderGames() {
    this.list.replaceChildren();
    const query = this.search.value.trim().toLowerCase();
    const games = this.games
      .filter((game) => game.title.toLowerCase().includes(query))
      .sort(
        (a, b) =>
          Number(b.profile.favorite) - Number(a.profile.favorite) ||
          a.title.localeCompare(b.title)
      );
    if (!games.length) {
      const empty = document.createElement('p');
      empty.className = 'games-empty';
      empty.textContent = query
        ? 'No games match your search.'
        : 'No games found yet. Refresh your library or choose your Steam installation folder.';
      this.list.append(empty);
    }
    for (const game of games) {
      const card = document.createElement('article');
      card.className = 'game-card';
      const title = document.createElement('h3');
      title.textContent = game.title;
      const status = document.createElement('p');
      const available = game.installations.some(
        (installation) => installation.installed
      );
      status.textContent =
        'External game | Steam | ' +
        (available ? 'Installed' : 'Installation unavailable');
      const launch = document.createElement('button');
      launch.type = 'button';
      launch.className = 'primary-btn';
      launch.dataset.gamesAction = 'launch';
      launch.dataset.gameId = game.id;
      launch.dataset.available = String(available);
      launch.textContent = 'Launch game';
      const details = document.createElement('details');
      const summary = document.createElement('summary');
      summary.textContent = 'Game profile';
      const form = document.createElement('form');
      form.dataset.gameProfile = game.id;
      const favoriteLabel = document.createElement('label');
      const favorite = document.createElement('input');
      favorite.type = 'checkbox';
      favorite.checked = game.profile.favorite;
      favoriteLabel.append(favorite, ' Favorite');
      const notesLabel = document.createElement('label');
      notesLabel.textContent = 'Notes';
      const notes = document.createElement('textarea');
      notes.maxLength = 1000;
      notes.rows = 3;
      notes.value = game.profile.notes;
      notesLabel.append(notes);
      const save = document.createElement('button');
      save.type = 'submit';
      save.className = 'secondary-btn';
      save.textContent = 'Save profile';
      form.append(favoriteLabel, notesLabel, save);
      details.append(summary, form);
      card.append(title, status, launch, details);
      this.list.append(card);
    }
    this.updateButtons();
  }

  renderSession() {
    this.sessionPanel.replaceChildren();
    if (!this.session) {
      this.sessionPanel.hidden = true;
      return;
    }
    this.sessionPanel.hidden = false;
    const heading = document.createElement('h3');
    heading.textContent =
      'TheRev session' + (this.session.title ? ': ' + this.session.title : '');
    const status = document.createElement('p');
    const labels = {
      preparing: 'Preparing launch...',
      launching: 'Requesting launch...',
      'launch-requested': 'Launch requested. Game running status: unknown.',
      failed: 'Launch failed: ' + this.session.error,
      ended: 'TheRev session ended.',
    };
    status.textContent = labels[this.session.state] || this.session.state;
    const integration = document.createElement('p');
    integration.textContent =
      'TheRev game AI integration is unavailable in this version.';
    this.sessionPanel.append(heading, status, integration);
    if (this.session.state === 'launch-requested') {
      const end = document.createElement('button');
      end.type = 'button';
      end.className = 'secondary-btn';
      end.dataset.gamesAction = 'end-session';
      end.textContent = 'End TheRev session';
      const note = document.createElement('small');
      note.textContent = 'This ends TheRev tracking. Your game stays open.';
      this.sessionPanel.append(end, note);
    }
    this.updateButtons();
  }

  updateButtons() {
    const live = this.session && LIVE_STATES.has(this.session.state);
    this.root.setAttribute('aria-busy', String(this.busy));
    this.root.querySelectorAll('button').forEach((button) => {
      button.disabled =
        this.busy ||
        !this.api ||
        (button.dataset.gamesAction === 'launch' &&
          (live || button.dataset.available !== 'true'));
    });
  }
}
