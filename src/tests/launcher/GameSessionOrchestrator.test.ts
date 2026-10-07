const {
  GameSessionOrchestrator,
} = require('../../electron/launcher/GameSessionOrchestrator.cjs');
const {
  defaultProfile,
} = require('../../electron/launcher/GameProfileStore.cjs');

describe('TheRev game sessions', () => {
  let context: any;
  let library: any;
  let sessions: any;
  beforeEach(() => {
    context = {
      game: {
        id: 'game-1',
        title: 'Test game',
        profile: defaultProfile(),
        integration: { adapterId: null },
      },
      installation: { id: 'steam:10' },
      settings: {},
      provider: {
        id: 'steam',
        launch: jest.fn().mockResolvedValue({ handoff: 'launch-requested' }),
      },
    };
    library = { getLaunchContext: jest.fn(async () => context) };
    sessions = new GameSessionOrchestrator({ library });
  });

  it('owns lifecycle around launch handoff without claiming a running or integrated game', async () => {
    const states: string[] = [];
    sessions.on('changed', (session: any) => states.push(session.state));
    const session = await sessions.launch('game-1');
    expect(states).toEqual(['preparing', 'launching', 'launch-requested']);
    expect(session).toMatchObject({
      gameId: 'game-1',
      providerId: 'steam',
      running: 'unknown',
      integrationState: 'disabled',
    });
    context.game.profile.notes = 'Later edit';
    expect(sessions.getSession().profile.notes).toBe('');
    expect(sessions.end(session.id).state).toBe('ended');
    expect(context.provider.launch).toHaveBeenCalledTimes(1);
    expect((await sessions.launch('game-1')).id).not.toBe(session.id);
  });

  it('reserves a session before asynchronous preparation and blocks duplicate launches', async () => {
    let resolve: any;
    library.getLaunchContext.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        })
    );
    const launch = sessions.launch('game-1');
    await expect(sessions.launch('game-1')).rejects.toThrow('End the current');
    expect(() => sessions.end(sessions.getSession().id)).toThrow('Wait');
    resolve(context);
    await launch;
    await expect(sessions.launch('game-1')).rejects.toThrow('End the current');
    expect(() => sessions.end('other-session')).toThrow('Session not found');
  });

  it('records launch failures and permits a later retry', async () => {
    context.provider.launch.mockRejectedValueOnce(new Error('Protocol failed'));
    await expect(sessions.launch('game-1')).rejects.toThrow('Protocol failed');
    expect(sessions.getSession()).toMatchObject({
      state: 'failed',
      error: 'Protocol failed',
    });
    expect((await sessions.launch('game-1')).state).toBe('launch-requested');
  });

  it('rejects unsupported integrations before handing off to the launch provider', async () => {
    context.game.integration.adapterId = 'future-integration';
    await expect(sessions.launch('game-1')).rejects.toThrow('not available');
    expect(context.provider.launch).not.toHaveBeenCalled();
  });

  it('ends TheRev state on shutdown and cancels preparation without launching software', async () => {
    let resolve: any;
    library.getLaunchContext.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        })
    );
    const launching = sessions.launch('game-1');
    sessions.dispose();
    resolve(context);
    await expect(launching).rejects.toThrow();
    expect(sessions.getSession().state).toBe('ended');
    expect(context.provider.launch).not.toHaveBeenCalled();
    await expect(sessions.launch('game-1')).rejects.toThrow('closed');
  });

  it('rejects malformed IDs before starting a session', async () => {
    await expect(sessions.launch('steam://rungameid/10')).rejects.toThrow(
      'Invalid game ID'
    );
    expect(sessions.getSession()).toBeNull();
  });
});
