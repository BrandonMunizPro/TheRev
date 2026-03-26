import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { ErrorHandler } from '../errors/ErrorHandler';

export interface SandboxConfig {
  maxMemoryMB: number;
  maxConcurrentTabs: number;
  maxSessionDurationMs: number;
  enableJavaScript: boolean;
  enableImages: boolean;
  enableCSS: boolean;
  userAgent?: string;
  viewport?: { width: number; height: number };
  proxy?: string;
  timeout: number;
}

export interface SandboxSession {
  id: string;
  createdAt: Date;
  lastActivityAt: Date;
  tabCount: number;
  memoryUsageMB: number;
  status: SessionStatus;
  metadata?: Record<string, any>;
}

export enum SessionStatus {
  ACTIVE = 'ACTIVE',
  IDLE = 'IDLE',
  TERMINATING = 'TERMINATING',
  TERMINATED = 'TERMINATED',
}

export enum BrowserEventType {
  SESSION_CREATED = 'session:created',
  SESSION_TERMINATED = 'session:terminated',
  TAB_CREATED = 'tab:created',
  TAB_CLOSED = 'tab:closed',
  RESOURCE_LIMIT_REACHED = 'resource:limit',
  MEMORY_WARNING = 'memory:warning',
  ERROR = 'error',
}

export interface BrowserMetrics {
  activeSessions: number;
  activeTabs: number;
  totalMemoryUsageMB: number;
  averageSessionDurationMs: number;
  requestsBlocked: number;
  jsErrors: number;
}

export interface ResourceLimit {
  type: 'memory' | 'cpu' | 'tabs' | 'session';
  current: number;
  max: number;
  reachedAt?: Date;
}

const DEFAULT_CONFIG: SandboxConfig = {
  maxMemoryMB: 512,
  maxConcurrentTabs: 10,
  maxSessionDurationMs: 3600000,
  enableJavaScript: true,
  enableImages: true,
  enableCSS: true,
  viewport: { width: 1920, height: 1080 },
  timeout: 30000,
};

export class BrowserSandbox extends EventEmitter {
  private config: SandboxConfig;
  private sessions: Map<string, SandboxSession> = new Map();
  private metrics: BrowserMetrics = {
    activeSessions: 0,
    activeTabs: 0,
    totalMemoryUsageMB: 0,
    averageSessionDurationMs: 0,
    requestsBlocked: 0,
    jsErrors: 0,
  };
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(config: Partial<SandboxConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.startCleanupScheduler();
  }

  createSession(metadata?: Record<string, any>): SandboxSession {
    if (this.sessions.size >= this.config.maxConcurrentTabs) {
      throw ErrorHandler.operationNotAllowed(
        `Maximum concurrent sessions (${this.config.maxConcurrentTabs}) reached`
      );
    }

    const session: SandboxSession = {
      id: uuidv4(),
      createdAt: new Date(),
      lastActivityAt: new Date(),
      tabCount: 0,
      memoryUsageMB: 0,
      status: SessionStatus.ACTIVE,
      metadata,
    };

    this.sessions.set(session.id, session);
    this.updateMetrics();

    this.emit(BrowserEventType.SESSION_CREATED, session);
    console.log(`Created sandbox session: ${session.id}`);

    return session;
  }

  async terminateSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw ErrorHandler.operationNotAllowed(`Session not found: ${sessionId}`);
    }

    session.status = SessionStatus.TERMINATING;
    this.sessions.delete(sessionId);
    this.updateMetrics();

    this.emit(BrowserEventType.SESSION_TERMINATED, session);
    console.log(`Terminated sandbox session: ${sessionId}`);
  }

  getSession(sessionId: string): SandboxSession | undefined {
    return this.sessions.get(sessionId);
  }

  getAllSessions(): SandboxSession[] {
    return Array.from(this.sessions.values());
  }

  updateSessionActivity(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.lastActivityAt = new Date();
      if (session.status === SessionStatus.IDLE) {
        session.status = SessionStatus.ACTIVE;
      }
    }
  }

  private updateMetrics(): void {
    this.metrics.activeSessions = this.sessions.size;
    this.metrics.activeTabs = Array.from(this.sessions.values()).reduce(
      (sum, s) => sum + s.tabCount,
      0
    );
    this.metrics.totalMemoryUsageMB = Array.from(this.sessions.values()).reduce(
      (sum, s) => sum + s.memoryUsageMB,
      0
    );
  }

  getMetrics(): BrowserMetrics {
    this.updateMetrics();
    return { ...this.metrics };
  }

  getResourceLimits(): ResourceLimit[] {
    const limits: ResourceLimit[] = [
      {
        type: 'memory',
        current: this.metrics.totalMemoryUsageMB,
        max: this.config.maxMemoryMB,
      },
      {
        type: 'tabs',
        current: this.metrics.activeTabs,
        max: this.config.maxConcurrentTabs,
      },
      {
        type: 'session',
        current: this.metrics.activeSessions,
        max: this.config.maxConcurrentTabs,
      },
    ];

    for (const limit of limits) {
      if (limit.current >= limit.max) {
        limit.reachedAt = new Date();
      }
    }

    return limits;
  }

  checkResourceLimits(): { allowed: boolean; reason?: string } {
    const limits = this.getResourceLimits();

    for (const limit of limits) {
      if (limit.current >= limit.max) {
        return {
          allowed: false,
          reason: `${limit.type} limit reached: ${limit.current}/${limit.max}`,
        };
      }
    }

    return { allowed: true };
  }

  private startCleanupScheduler(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanupIdleSessions();
    }, 60000);
  }

  private cleanupIdleSessions(): void {
    const now = Date.now();
    const idleThreshold = 300000;

    for (const [id, session] of this.sessions) {
      const idleTime = now - session.lastActivityAt.getTime();
      const sessionAge = now - session.createdAt.getTime();

      if (
        idleTime > idleThreshold ||
        sessionAge > this.config.maxSessionDurationMs
      ) {
        this.terminateSession(id).catch(console.error);
        console.log(`Cleaned up idle session: ${id}`);
      }
    }
  }

  async shutdown(): Promise<void> {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    const terminationPromises = Array.from(this.sessions.keys()).map((id) =>
      this.terminateSession(id)
    );
    await Promise.all(terminationPromises);

    console.log('Browser sandbox shutdown complete');
  }

  getConfig(): SandboxConfig {
    return { ...this.config };
  }

  updateConfig(config: Partial<SandboxConfig>): void {
    this.config = { ...this.config, ...config };
    console.log('Sandbox config updated:', this.config);
  }
}
