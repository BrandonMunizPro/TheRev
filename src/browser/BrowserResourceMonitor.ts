import { EventEmitter } from 'events';
import { BrowserSandbox } from './BrowserSandbox';

export interface BrowserResourceStats {
  sessionId: string;
  memoryUsageMB: number;
  cpuUsage: number;
  tabCount: number;
  networkRequests: number;
  jsHeapSize: number;
  timestamp: Date;
}

export interface ResourceAlert {
  type: 'memory' | 'cpu' | 'tab' | 'session';
  severity: 'warning' | 'critical';
  sessionId?: string;
  current: number;
  threshold: number;
  message: string;
  timestamp: Date;
}

const MEMORY_WARNING_THRESHOLD_MB = 400;
const MEMORY_CRITICAL_THRESHOLD_MB = 480;
const CPU_WARNING_THRESHOLD = 70;
const CPU_CRITICAL_THRESHOLD = 90;

export class BrowserResourceMonitor extends EventEmitter {
  private sandbox: BrowserSandbox;
  private statsHistory: Map<string, BrowserResourceStats[]> = new Map();
  private maxHistorySize = 100;
  private monitorInterval: NodeJS.Timeout | null = null;

  constructor(sandbox: BrowserSandbox) {
    super();
    this.sandbox = sandbox;
  }

  start(intervalMs: number = 5000): void {
    if (this.monitorInterval) return;

    console.log(
      `Starting browser resource monitor (interval: ${intervalMs}ms)`
    );
    this.monitorInterval = setInterval(() => {
      this.collectAndAnalyze();
    }, intervalMs);
  }

  stop(): void {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
      console.log('Browser resource monitor stopped');
    }
  }

  private async collectAndAnalyze(): Promise<void> {
    const sessions = this.sandbox.getAllSessions();
    const metrics = this.sandbox.getMetrics();

    for (const session of sessions) {
      const stats: BrowserResourceStats = {
        sessionId: session.id,
        memoryUsageMB:
          session.memoryUsageMB ||
          metrics.totalMemoryUsageMB / Math.max(sessions.length, 1),
        cpuUsage: 0,
        tabCount: session.tabCount,
        networkRequests: 0,
        jsHeapSize: 0,
        timestamp: new Date(),
      };

      this.recordStats(session.id, stats);
      this.checkThresholds(session.id, stats);
    }
  }

  private recordStats(sessionId: string, stats: BrowserResourceStats): void {
    let history = this.statsHistory.get(sessionId);
    if (!history) {
      history = [];
      this.statsHistory.set(sessionId, history);
    }

    history.push(stats);

    if (history.length > this.maxHistorySize) {
      history.shift();
    }
  }

  private checkThresholds(
    sessionId: string,
    stats: BrowserResourceStats
  ): void {
    if (stats.memoryUsageMB >= MEMORY_CRITICAL_THRESHOLD_MB) {
      this.emit(
        'alert',
        this.createAlert(
          'memory',
          'critical',
          sessionId,
          stats.memoryUsageMB,
          MEMORY_CRITICAL_THRESHOLD_MB
        )
      );
    } else if (stats.memoryUsageMB >= MEMORY_WARNING_THRESHOLD_MB) {
      this.emit(
        'alert',
        this.createAlert(
          'memory',
          'warning',
          sessionId,
          stats.memoryUsageMB,
          MEMORY_WARNING_THRESHOLD_MB
        )
      );
    }

    if (stats.cpuUsage >= CPU_CRITICAL_THRESHOLD) {
      this.emit(
        'alert',
        this.createAlert(
          'cpu',
          'critical',
          sessionId,
          stats.cpuUsage,
          CPU_CRITICAL_THRESHOLD
        )
      );
    } else if (stats.cpuUsage >= CPU_WARNING_THRESHOLD) {
      this.emit(
        'alert',
        this.createAlert(
          'cpu',
          'warning',
          sessionId,
          stats.cpuUsage,
          CPU_WARNING_THRESHOLD
        )
      );
    }

    if (stats.tabCount >= 8) {
      this.emit(
        'alert',
        this.createAlert('tab', 'warning', sessionId, stats.tabCount, 8)
      );
    }
  }

  private createAlert(
    type: 'memory' | 'cpu' | 'tab' | 'session',
    severity: 'warning' | 'critical',
    sessionId: string,
    current: number,
    threshold: number
  ): ResourceAlert {
    return {
      type,
      severity,
      sessionId,
      current,
      threshold,
      message: `${type.toUpperCase()} ${severity}: ${current.toFixed(1)} / ${threshold}`,
      timestamp: new Date(),
    };
  }

  getStatsHistory(sessionId: string, limit?: number): BrowserResourceStats[] {
    const history = this.statsHistory.get(sessionId) || [];
    return limit ? history.slice(-limit) : history;
  }

  getAverageStats(sessionId: string):
    | {
        memoryUsageMB: number;
        cpuUsage: number;
        tabCount: number;
        networkRequests: number;
        jsHeapSize: number;
      }
    | {} {
    const history = this.statsHistory.get(sessionId) || [];
    if (history.length === 0) return {};

    const sum = history.reduce(
      (acc, stats) => ({
        memoryUsageMB: acc.memoryUsageMB + stats.memoryUsageMB,
        cpuUsage: acc.cpuUsage + stats.cpuUsage,
        tabCount: acc.tabCount + stats.tabCount,
        networkRequests: acc.networkRequests + stats.networkRequests,
        jsHeapSize: acc.jsHeapSize + stats.jsHeapSize,
      }),
      {
        memoryUsageMB: 0,
        cpuUsage: 0,
        tabCount: 0,
        networkRequests: 0,
        jsHeapSize: 0,
      }
    );

    return {
      memoryUsageMB: sum.memoryUsageMB / history.length,
      cpuUsage: sum.cpuUsage / history.length,
      tabCount: sum.tabCount / history.length,
      networkRequests: sum.networkRequests / history.length,
      jsHeapSize: sum.jsHeapSize / history.length,
    };
  }

  getPeakStats(sessionId: string):
    | {
        memoryUsageMB: number;
        cpuUsage: number;
        tabCount: number;
        networkRequests: number;
        jsHeapSize: number;
      }
    | {} {
    const history = this.statsHistory.get(sessionId) || [];
    if (history.length === 0) return {};

    return history.reduce(
      (
        peak: {
          memoryUsageMB: number;
          cpuUsage: number;
          tabCount: number;
          networkRequests: number;
          jsHeapSize: number;
        },
        stats
      ) => ({
        memoryUsageMB: Math.max(peak.memoryUsageMB || 0, stats.memoryUsageMB),
        cpuUsage: Math.max(peak.cpuUsage || 0, stats.cpuUsage),
        tabCount: Math.max(peak.tabCount || 0, stats.tabCount),
        networkRequests: Math.max(
          peak.networkRequests || 0,
          stats.networkRequests
        ),
        jsHeapSize: Math.max(peak.jsHeapSize || 0, stats.jsHeapSize),
      }),
      {
        memoryUsageMB: 0,
        cpuUsage: 0,
        tabCount: 0,
        networkRequests: 0,
        jsHeapSize: 0,
      }
    );
  }

  clearHistory(sessionId?: string): void {
    if (sessionId) {
      this.statsHistory.delete(sessionId);
    } else {
      this.statsHistory.clear();
    }
  }
}
