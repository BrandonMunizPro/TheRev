/**
 * Shard Metrics Collector
 * Collects and aggregates metrics across all shards.
 * Provides comprehensive monitoring for shard health and performance.
 */

import { EventEmitter } from 'events';
import { ShardHealthMonitor } from './ShardHealthMonitor';
import { IShardRouter, ShardType } from './IShardRouter';

export interface ShardMetrics {
  shardId: number;
  shardType: ShardType;
  timestamp: Date;
  health: {
    isHealthy: boolean;
    responseTime: number;
    errorRate: number;
    consecutiveFailures: number;
    lastCheck: Date;
  };
  throughput: {
    queriesPerMinute: number;
    readsPerMinute: number;
    writesPerMinute: number;
  };
  performance: {
    avgLatencyMs: number;
    p50LatencyMs: number;
    p95LatencyMs: number;
    p99LatencyMs: number;
    maxLatencyMs: number;
  };
  resources: {
    activeConnections: number;
    idleConnections: number;
    connectionUtilization: number;
  };
}

export interface AggregatedMetrics {
  totalShards: number;
  healthyShards: number;
  unhealthyShards: number;
  avgResponseTime: number;
  avgErrorRate: number;
  totalQueriesPerMinute: number;
  totalReadsPerMinute: number;
  totalWritesPerMinute: number;
  timestamp: Date;
}

export interface MetricsCollectionConfig {
  collectionIntervalMs: number;
  metricsWindowMs: number;
  enableLatencyTracking: boolean;
  enableThroughputTracking: boolean;
  maxLatencySamples: number;
  alertThresholdErrorRate: number;
  alertThresholdLatencyMs: number;
}

interface LatencySample {
  timestamp: number;
  latencyMs: number;
}

interface ThroughputSample {
  timestamp: number;
  reads: number;
  writes: number;
}

export class ShardMetricsCollector extends EventEmitter {
  private healthMonitor: ShardHealthMonitor;
  private shardRouter: IShardRouter;
  private config: MetricsCollectionConfig;
  private latencySamples: Map<string, LatencySample[]> = new Map();
  private throughputSamples: Map<string, ThroughputSample[]> = new Map();
  private collectionInterval: NodeJS.Timeout | null = null;
  private isCollecting = false;

  constructor(
    healthMonitor: ShardHealthMonitor,
    shardRouter: IShardRouter,
    config?: Partial<MetricsCollectionConfig>
  ) {
    super();
    this.healthMonitor = healthMonitor;
    this.shardRouter = shardRouter;
    this.config = {
      collectionIntervalMs: 60000,
      metricsWindowMs: 300000,
      enableLatencyTracking: true,
      enableThroughputTracking: true,
      maxLatencySamples: 1000,
      alertThresholdErrorRate: 0.1,
      alertThresholdLatencyMs: 5000,
      ...config,
    };
  }

  startCollection(): void {
    if (this.isCollecting) {
      return;
    }

    this.isCollecting = true;
    this.collectionInterval = setInterval(() => {
      this.collectMetrics();
    }, this.config.collectionIntervalMs);

    this.collectionInterval.unref();
    console.log('Shard metrics collection started');
    this.emit('collection:started');
  }

  stopCollection(): void {
    if (!this.isCollecting) {
      return;
    }

    if (this.collectionInterval) {
      clearInterval(this.collectionInterval);
      this.collectionInterval = null;
    }

    this.isCollecting = false;
    console.log('Shard metrics collection stopped');
    this.emit('collection:stopped');
  }

  recordLatency(
    shardId: number,
    shardType: ShardType,
    latencyMs: number
  ): void {
    if (!this.config.enableLatencyTracking) {
      return;
    }

    const key = this.getShardKey(shardId, shardType);
    const samples = this.latencySamples.get(key) || [];

    samples.push({
      timestamp: Date.now(),
      latencyMs,
    });

    const cutoff = Date.now() - this.config.metricsWindowMs;
    const filtered = samples.filter((s) => s.timestamp > cutoff);

    if (filtered.length > this.config.maxLatencySamples) {
      filtered.splice(0, filtered.length - this.config.maxLatencySamples);
    }

    this.latencySamples.set(key, filtered);
  }

  recordThroughput(
    shardId: number,
    shardType: ShardType,
    reads: number = 0,
    writes: number = 0
  ): void {
    if (!this.config.enableThroughputTracking) {
      return;
    }

    const key = this.getShardKey(shardId, shardType);
    const samples = this.throughputSamples.get(key) || [];

    samples.push({
      timestamp: Date.now(),
      reads,
      writes,
    });

    const cutoff = Date.now() - this.config.metricsWindowMs;
    const filtered = samples.filter((s) => s.timestamp > cutoff);

    this.throughputSamples.set(key, filtered);
  }

  async collectMetrics(): Promise<ShardMetrics[]> {
    const healthMetrics = await this.healthMonitor.getHealthMetrics();
    const shards = await this.shardRouter.getShardsByType(ShardType.CONTENT);
    const allShards = [
      ...shards,
      ...(await this.shardRouter.getShardsByType(ShardType.USERS)),
      ...(await this.shardRouter.getShardsByType(ShardType.AI_TASKS)),
    ];

    const uniqueShards = new Map<
      string,
      { shardId: number; shardType: ShardType }
    >();
    for (const shard of allShards) {
      const key = this.getShardKey(shard.shardId, shard.shardType);
      uniqueShards.set(key, {
        shardId: shard.shardId,
        shardType: shard.shardType,
      });
    }

    const metrics: ShardMetrics[] = [];

    for (const [, shard] of uniqueShards) {
      const health = await this.healthMonitor.getShardMetrics(
        shard.shardId,
        shard.shardType
      );
      const latencyStats = this.calculateLatencyStats(
        shard.shardId,
        shard.shardType
      );
      const throughputStats = this.calculateThroughputStats(
        shard.shardId,
        shard.shardType
      );

      const shardMetrics: ShardMetrics = {
        shardId: shard.shardId,
        shardType: shard.shardType,
        timestamp: new Date(),
        health: {
          isHealthy: health?.isHealthy ?? false,
          responseTime: health?.responseTime ?? 0,
          errorRate: health?.errorRate ?? 0,
          consecutiveFailures: health?.consecutiveFailures ?? 0,
          lastCheck: health?.lastCheck ?? new Date(),
        },
        throughput: {
          queriesPerMinute: throughputStats.queriesPerMinute,
          readsPerMinute: throughputStats.readsPerMinute,
          writesPerMinute: throughputStats.writesPerMinute,
        },
        performance: {
          avgLatencyMs: latencyStats.avg,
          p50LatencyMs: latencyStats.p50,
          p95LatencyMs: latencyStats.p95,
          p99LatencyMs: latencyStats.p99,
          maxLatencyMs: latencyStats.max,
        },
        resources: {
          activeConnections: 0,
          idleConnections: 0,
          connectionUtilization: 0,
        },
      };

      metrics.push(shardMetrics);

      this.checkAlerts(shardMetrics);
    }

    this.emit('metrics:collected', metrics);
    return metrics;
  }

  async getAggregatedMetrics(): Promise<AggregatedMetrics> {
    const metrics = await this.collectMetrics();

    const healthyShards = metrics.filter((m) => m.health.isHealthy);
    const totalQueries = metrics.reduce(
      (sum, m) => sum + m.throughput.queriesPerMinute,
      0
    );
    const totalReads = metrics.reduce(
      (sum, m) => sum + m.throughput.readsPerMinute,
      0
    );
    const totalWrites = metrics.reduce(
      (sum, m) => sum + m.throughput.writesPerMinute,
      0
    );

    return {
      totalShards: metrics.length,
      healthyShards: healthyShards.length,
      unhealthyShards: metrics.length - healthyShards.length,
      avgResponseTime:
        metrics.length > 0
          ? metrics.reduce((sum, m) => sum + m.health.responseTime, 0) /
            metrics.length
          : 0,
      avgErrorRate:
        metrics.length > 0
          ? metrics.reduce((sum, m) => sum + m.health.errorRate, 0) /
            metrics.length
          : 0,
      totalQueriesPerMinute: totalQueries,
      totalReadsPerMinute: totalReads,
      totalWritesPerMinute: totalWrites,
      timestamp: new Date(),
    };
  }

  async getShardMetrics(
    shardId: number,
    shardType: ShardType
  ): Promise<ShardMetrics | null> {
    const health = await this.healthMonitor.getShardMetrics(shardId, shardType);
    const latencyStats = this.calculateLatencyStats(shardId, shardType);
    const throughputStats = this.calculateThroughputStats(shardId, shardType);

    return {
      shardId,
      shardType,
      timestamp: new Date(),
      health: {
        isHealthy: health?.isHealthy ?? false,
        responseTime: health?.responseTime ?? 0,
        errorRate: health?.errorRate ?? 0,
        consecutiveFailures: health?.consecutiveFailures ?? 0,
        lastCheck: health?.lastCheck ?? new Date(),
      },
      throughput: {
        queriesPerMinute: throughputStats.queriesPerMinute,
        readsPerMinute: throughputStats.readsPerMinute,
        writesPerMinute: throughputStats.writesPerMinute,
      },
      performance: {
        avgLatencyMs: latencyStats.avg,
        p50LatencyMs: latencyStats.p50,
        p95LatencyMs: latencyStats.p95,
        p99LatencyMs: latencyStats.p99,
        maxLatencyMs: latencyStats.max,
      },
      resources: {
        activeConnections: 0,
        idleConnections: 0,
        connectionUtilization: 0,
      },
    };
  }

  private calculateLatencyStats(
    shardId: number,
    shardType: ShardType
  ): { avg: number; p50: number; p95: number; p99: number; max: number } {
    const key = this.getShardKey(shardId, shardType);
    const samples = this.latencySamples.get(key) || [];

    if (samples.length === 0) {
      return { avg: 0, p50: 0, p95: 0, p99: 0, max: 0 };
    }

    const latencies = samples.map((s) => s.latencyMs).sort((a, b) => a - b);

    return {
      avg: latencies.reduce((a, b) => a + b, 0) / latencies.length,
      p50: this.percentile(latencies, 50),
      p95: this.percentile(latencies, 95),
      p99: this.percentile(latencies, 99),
      max: Math.max(...latencies),
    };
  }

  private calculateThroughputStats(
    shardId: number,
    shardType: ShardType
  ): {
    queriesPerMinute: number;
    readsPerMinute: number;
    writesPerMinute: number;
  } {
    const key = this.getShardKey(shardId, shardType);
    const samples = this.throughputSamples.get(key) || [];

    if (samples.length === 0) {
      return { queriesPerMinute: 0, readsPerMinute: 0, writesPerMinute: 0 };
    }

    const windowMinutes = this.config.metricsWindowMs / 60000;
    const totalReads = samples.reduce((sum, s) => sum + s.reads, 0);
    const totalWrites = samples.reduce((sum, s) => sum + s.writes, 0);

    return {
      queriesPerMinute: (totalReads + totalWrites) / windowMinutes,
      readsPerMinute: totalReads / windowMinutes,
      writesPerMinute: totalWrites / windowMinutes,
    };
  }

  private percentile(sortedArr: number[], p: number): number {
    const index = Math.ceil((p / 100) * sortedArr.length) - 1;
    return sortedArr[Math.max(0, index)];
  }

  private checkAlerts(metrics: ShardMetrics): void {
    if (metrics.health.errorRate > this.config.alertThresholdErrorRate) {
      this.emit('alert:highErrorRate', {
        shardId: metrics.shardId,
        shardType: metrics.shardType,
        errorRate: metrics.health.errorRate,
        threshold: this.config.alertThresholdErrorRate,
        timestamp: new Date(),
      });
    }

    if (
      metrics.performance.avgLatencyMs > this.config.alertThresholdLatencyMs
    ) {
      this.emit('alert:highLatency', {
        shardId: metrics.shardId,
        shardType: metrics.shardType,
        avgLatency: metrics.performance.avgLatencyMs,
        threshold: this.config.alertThresholdLatencyMs,
        timestamp: new Date(),
      });
    }

    if (!metrics.health.isHealthy) {
      this.emit('alert:shardUnhealthy', {
        shardId: metrics.shardId,
        shardType: metrics.shardType,
        consecutiveFailures: metrics.health.consecutiveFailures,
        timestamp: new Date(),
      });
    }
  }

  private getShardKey(shardId: number, shardType: ShardType): string {
    return `${shardType}:${shardId}`;
  }

  getConfig(): MetricsCollectionConfig {
    return { ...this.config };
  }

  updateConfig(config: Partial<MetricsCollectionConfig>): void {
    this.config = { ...this.config, ...config };
  }

  clearSamples(): void {
    this.latencySamples.clear();
    this.throughputSamples.clear();
  }
}

export function createShardMetricsCollector(
  healthMonitor: ShardHealthMonitor,
  shardRouter: IShardRouter,
  config?: Partial<MetricsCollectionConfig>
): ShardMetricsCollector {
  return new ShardMetricsCollector(healthMonitor, shardRouter, config);
}
