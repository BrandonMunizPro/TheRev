import { TranscriptSessionManager } from '../../ai/technical-copilot/TranscriptSession';

describe('TranscriptSessionManager', () => {
  let manager: TranscriptSessionManager;

  beforeEach(() => {
    manager = new TranscriptSessionManager({
      maxContextFragments: 5,
      sessionTimeoutMs: 60 * 1000,
    });
  });

  afterEach(() => {
    manager.destroy();
  });

  describe('Session Creation', () => {
    it('should create a session for a user', () => {
      const session = manager.createSession('user-1');
      expect(session).toBeDefined();
      expect(session.id).toBeTruthy();
      expect(session.userId).toBe('user-1');
      expect(session.isActive).toBe(true);
      expect(session.fragments).toHaveLength(0);
    });

    it('should reuse an existing active session for the same user', () => {
      const first = manager.createSession('user-1');
      const second = manager.createSession('user-1');
      expect(second.id).toBe(first.id);
    });

    it('should create separate sessions for different users', () => {
      const first = manager.createSession('user-1');
      const second = manager.createSession('user-2');
      expect(first.id).not.toBe(second.id);
    });
  });

  describe('Rolling Context Window', () => {
    it('should add fragments to a session', () => {
      const session = manager.createSession('user-1');
      const updated = manager.addFragment(session.id, 'Hello there');
      expect(updated).not.toBeNull();
      expect(updated!.fragments).toHaveLength(1);
      expect(updated!.fragments[0].text).toBe('Hello there');
    });

    it('should enforce a bounded rolling window', () => {
      const session = manager.createSession('user-1');
      for (let i = 0; i < 20; i++) {
        manager.addFragment(session.id, `fragment-${i}`);
      }

      const current = manager.getSession(session.id);
      expect(current!.fragments).toHaveLength(5);
      expect(current!.fragments[0].text).toBe('fragment-15');
      expect(current!.fragments[4].text).toBe('fragment-19');
    });

    it('should retrieve a bounded slice of recent fragments', () => {
      const session = manager.createSession('user-1');
      for (let i = 0; i < 10; i++) {
        manager.addFragment(session.id, `fragment-${i}`);
      }

      const recent = manager.getRecentFragments(session.id, 3);
      expect(recent).toHaveLength(3);
      expect(recent[0].text).toBe('fragment-7');
    });
  });

  describe('Multiple Rapid Updates', () => {
    it('should handle many rapid fragment submissions without dropping sessions', () => {
      const session = manager.createSession('user-1');

      for (let i = 0; i < 50; i++) {
        const result = manager.addFragment(
          session.id,
          `rapid fragment ${i}`,
          'speaker-a'
        );
        expect(result).not.toBeNull();
      }

      const current = manager.getSession(session.id);
      expect(current).not.toBeNull();
      expect(current!.fragments.length).toBeLessThanOrEqual(5);
    });
  });

  describe('Session Lifecycle', () => {
    it('should close a session', () => {
      const session = manager.createSession('user-1');
      expect(manager.closeSession(session.id)).toBe(true);
      expect(manager.getSession(session.id)).toBeNull();
    });

    it('should not allow adding fragments to a closed session', () => {
      const session = manager.createSession('user-1');
      manager.closeSession(session.id);
      const result = manager.addFragment(session.id, 'should fail');
      expect(result).toBeNull();
    });

    it('should return null for an unknown session id', () => {
      expect(manager.getSession('unknown-id')).toBeNull();
      expect(manager.addFragment('unknown-id', 'text')).toBeNull();
    });
  });
});