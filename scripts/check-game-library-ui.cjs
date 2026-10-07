// Isolated Games UI smoke test. No backend, AI services, store clients, or games
// are started. Uses the repository's existing Playwright dependency/browser.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { URL } = require('node:url');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const frontend = path.join(root, 'src/electron/frontend');
const profile = { favorite: false, notes: '', ai: { enabled: false } };
const game = {
  id: 'game-1',
  title: '<img src=x onerror=alert(1)> Test game',
  origin: 'external',
  integration: { adapterId: null },
  profile,
  installations: [{ providerId: 'steam', installed: true }],
};

async function main() {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({
      viewport: { width: 1280, height: 900 },
    });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('**/*', async (route) => {
      const url = new URL(route.request().url());
      const routes = {
        '/styles.css': ['styles.css', 'text/css'],
        '/launcher/GameLibrary.js': [
          'launcher/GameLibrary.js',
          'text/javascript',
        ],
      };
      if (url.origin !== 'http://therev.test') return route.abort();
      if (url.pathname === '/') {
        const html = fs
          .readFileSync(path.join(frontend, 'index.html'), 'utf8')
          .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
        return route.fulfill({ contentType: 'text/html', body: html });
      }
      const file = routes[url.pathname];
      if (!file) return route.abort();
      return route.fulfill({
        contentType: file[1],
        body: fs.readFileSync(path.join(frontend, file[0]), 'utf8'),
      });
    });
    await page.goto('http://therev.test/');
    await page.evaluate(async (fixture) => {
      document.getElementById('init-screen').remove();
      document.getElementById('login-page').style.display = 'none';
      document.getElementById('app').style.display = '';
      document
        .querySelectorAll('.content-section')
        .forEach((section) => section.classList.remove('active'));
      document.getElementById('games-section').classList.add('active');
      const { GameLibrary } = await import('/launcher/GameLibrary.js');
      window.fixture = fixture;
      window.session = null;
      window.launchCount = 0;
      window.failLaunch = false;
      window.savedPatch = null;
      const state = () => ({
        library: {
          games: [window.fixture],
          settings: { steamRoot: null },
          discovery: [],
        },
        session: window.session,
      });
      const ok = (data) => ({ success: true, data });
      const api = {
        getGames: async () => ok(state()),
        refreshGames: async () => ok(state()),
        updateGameProfile: async (_id, patch) => {
          window.savedPatch = patch;
          window.fixture.profile = { ...window.fixture.profile, ...patch };
          return ok(window.fixture);
        },
        launchGame: async (gameId) => {
          window.launchCount++;
          if (window.failLaunch)
            return { success: false, error: 'Steam protocol unavailable' };
          window.session = {
            id: 'session-1',
            gameId,
            title: window.fixture.title,
            state: 'launch-requested',
            running: 'unknown',
            integrationState: 'disabled',
          };
          window.sessionChanged(window.session);
          return ok(window.session);
        },
        endGameSession: async () => {
          window.session = { ...window.session, state: 'ended' };
          window.sessionChanged(window.session);
          return ok(window.session);
        },
        onGameSessionChanged: (callback) => {
          window.sessionChanged = callback;
          return () => {
            window.sessionChanged = null;
          };
        },
      };
      window.gamesUI = new GameLibrary({
        root: document.getElementById('games-section'),
        api,
      });
      await window.gamesUI.open();
    }, game);
    assert.equal(await page.locator('.game-card h3').textContent(), game.title);
    assert.equal(
      await page.locator('.game-card img').count(),
      0,
      'Manifest titles must be rendered as text'
    );
    await page.getByText('Game profile', { exact: true }).click();
    await page.locator('.game-card textarea').fill('Campaign notes');
    await page.locator('.game-card input[type=checkbox]').check();
    await page
      .getByRole('button', { name: 'Save profile', exact: true })
      .click();
    await page.waitForFunction(() => !window.gamesUI.busy);
    assert.deepEqual(await page.evaluate(() => window.savedPatch), {
      favorite: true,
      notes: 'Campaign notes',
    });
    await page
      .getByRole('button', { name: 'Refresh library', exact: true })
      .click();
    await page.waitForFunction(() => !window.gamesUI.busy);
    await page
      .getByRole('button', { name: 'Launch game', exact: true })
      .click();
    await page.waitForFunction(() => !window.gamesUI.busy);
    assert.match(
      await page.locator('#games-session').textContent(),
      /running status: unknown/
    );
    assert.equal(
      await page
        .getByRole('button', { name: 'Launch game', exact: true })
        .isDisabled(),
      true
    );
    assert.equal(await page.evaluate(() => window.launchCount), 1);
    await page.evaluate(async () => {
      const api = window.gamesUI.api;
      window.gamesUI.dispose();
      const { GameLibrary } = await import('/launcher/GameLibrary.js');
      window.gamesUI = new GameLibrary({
        root: document.getElementById('games-section'),
        api,
      });
      await window.gamesUI.open();
    });
    assert.equal(
      await page
        .getByRole('button', { name: 'Launch game', exact: true })
        .isDisabled(),
      true
    );
    assert.match(
      await page.locator('#games-session').textContent(),
      /Launch requested/
    );
    await page
      .getByRole('button', { name: 'End TheRev session', exact: true })
      .click();
    await page.waitForFunction(() => !window.gamesUI.busy);
    assert.equal(
      await page
        .getByRole('button', { name: 'Launch game', exact: true })
        .isEnabled(),
      true
    );
    await page.evaluate(() => {
      window.failLaunch = true;
    });
    await page
      .getByRole('button', { name: 'Launch game', exact: true })
      .click();
    await page.waitForFunction(() => !window.gamesUI.busy);
    assert.equal(
      await page.locator('#games-message').textContent(),
      'Steam protocol unavailable'
    );
    assert.equal(
      await page
        .getByRole('button', { name: 'Launch game', exact: true })
        .isEnabled(),
      true
    );
    await page.locator('#games-search').fill('No matching game');
    assert.equal(await page.locator('.game-card').count(), 0);
    await page.locator('#games-search').fill('');
    assert.equal(await page.locator('.game-card').count(), 1);
    await page.setViewportSize({ width: 640, height: 900 });
    assert.equal(
      await page
        .locator('.game-card')
        .evaluate((card) => card.scrollWidth <= card.clientWidth),
      true
    );
    if (process.env.THEREV_LAUNCHER_SCREENSHOT) {
      await page.screenshot({
        path: process.env.THEREV_LAUNCHER_SCREENSHOT,
        fullPage: true,
      });
    }
    await page.evaluate(() => window.gamesUI.dispose());
    assert.equal(await page.evaluate(() => window.sessionChanged), null);
    assert.deepEqual(errors, []);
    console.log(
      'Games UI smoke check passed: safe titles, profiles, refresh, launch/end, failure, search, responsive card, listener cleanup.'
    );
  } finally {
    await browser.close();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
