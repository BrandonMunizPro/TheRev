import {
  CopilotSession,
  TranscriptFragment,
  SessionConfig,
  DEFAULT_SESSION_CONFIG,
} from './types';

export class TranscriptSessionManager {
  private sessions: Map<string, CopilotSession> = new Map();
  private config: SessionConfig;
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor(config: Partial<SessionConfig> = {}) {
    this.config = { ...DEFAULT_SESSION_CONFIG, ...config };
    this.startCleanupTimer();
  }

  createSession(userId: string): CopilotSession {
    const existing = this.findActiveSession(userId);
    if (existing) {
      return existing;
    }

    const session: CopilotSession = {
      id: this.generateSessionId(),
      userId,
      startedAt: Date.now(),
      lastActivityAt: Date.now(),
      fragments: [],
      isActive: true,
    };

    this.sessions.set(session.id, session);
    console.log(
      `[CopilotSession] Created session ${session.id} for user ${userId}`
    );
    return session;
  }

  addFragment(sessionId: string, text: string, speaker?: string): CopilotSession | null {
    const session = this.sessions.get(sessionId);
    if (!session || !session.isActive) return null;

    const fragment: TranscriptFragment = {
      text,
      timestamp: Date.now(),
      speaker,
    };

    session.fragments.push(fragment);
    session.lastActivityAt = Date.now();

    if (session.fragments.length > this.config.maxContextFragments) {
      session.fragments = session.fragments.slice(-this.config.maxContextFragments);
    }

    return session;
  }

  getSession(sessionId: string): CopilotSession | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    if (!session.isActive) return null;

    if (this.isSessionExpired(session)) {
      this.closeSession(sessionId);
      return null;
    }

    return session;
  }

  findActiveSession(userId: string): CopilotSession | null {
    for (const session of this.sessions.values()) {
      if (session.userId === userId && session.isActive) {
        if (this.isSessionExpired(session)) {
          this.closeSession(session.id);
          continue;
        }
        return session;
      }
    }
    return null;
  }

  closeSession(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    // Sessions are fully removed so closed/expired state never accumulates in
    // memory across long-lived listening sessions.
    this.sessions.delete(sessionId);
    console.log(`[CopilotSession] Closed session ${sessionId}`);
    return true;
  }

  getRecentFragments(sessionId: string, count?: number): TranscriptFragment[] {
    const session = this.sessions.get(sessionId);
    if (!session) return [];

    const limit = count || this.config.maxContextFragments;
    return session.fragments.slice(-limit);
  }

  getActiveSessions(): CopilotSession[] {
    return [...this.sessions.values()].filter((s) => s.isActive);
  }

  getUserSessionCount(userId: string): number {
    return [...this.sessions.values()].filter(
      (s) => s.userId === userId && s.isActive
    ).length;
  }

  private isSessionExpired(session: CopilotSession): boolean {
    return Date.now() - session.lastActivityAt > this.config.sessionTimeoutMs;
  }

  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanupExpiredSessions();
    }, 60_000);
    this.cleanupTimer.unref?.();
  }

  private cleanupExpiredSessions(): void {
    for (const [id, session] of this.sessions.entries()) {
      if (this.isSessionExpired(session)) {
        console.log(`[CopilotSession] Cleaning up expired session ${id}`);
        this.sessions.delete(id);
      }
    }
  }

  private generateSessionId(): string {
    return `copilot-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.sessions.clear();
  }
}
