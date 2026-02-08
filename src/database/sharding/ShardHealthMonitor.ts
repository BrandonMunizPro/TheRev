/**
 * Shard Health Monitor Implementation
 * Monitors health and availability of database shards
 * Provides metrics and failure detection for routing decisions
 */

import { EventEmitter } from 'events';
import {
  IShardHealthMonitor,
  ShardHealthMetrics,
  ShardType,
} from './IShardRouter';

export class ShardHealthMonitor
  extends EventEmitter
  implements IShardHealthMonitor
{
  private healthMetrics: Map<string, ShardHealthMetrics>;
  private monitoringInterval: NodeJS.Timeout | null = null;
  private isMonitoring = false;
  private checkInterval: number;
  private connectionTimeout: number;
  private maxRetries: number;

  constructor(
    checkInterval: number = 30000, // 30 seconds
    connectionTimeout: number = 5000, // 5 seconds
    maxRetries: number = 3
  ) {
    super();
    this.healthMetrics = new Map();
    this.checkInterval = checkInterval;
    this.connectionTimeout = connectionTimeout;
    this.maxRetries = maxRetries;
  }

  startMonitoring(): void {
    if (this.isMonitoring) {
      return;
    }

    this.isMonitoring = true;
    this.monitoringInterval = setInterval(() => {
      this.performHealthChecks();
    }, this.checkInterval);

    console.log('Shard health monitoring started');
    this.emit('monitoring:started');
  }

  stopMonitoring(): void {
    if (!this.isMonitoring) {
      return;
    }

    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }

    this.isMonitoring = false;
    console.log('Shard health monitoring stopped');
    this.emit('monitoring:stopped');
  }

  async getHealthMetrics(): Promise<ShardHealthMetrics[]> {
    return Array.from(this.healthMetrics.values());
  }

  async getShardMetrics(
    shardId: number,
    shardType: ShardType
  ): Promise<ShardHealthMetrics | null> {
    const key = this.getShardKey(shardId, shardType);
    return this.healthMetrics.get(key) || null;
  }

  async checkShardHealth(
    shardId: number,
    shardType: ShardType
  ): Promise<ShardHealthMetrics> {
    const key = this.getShardKey(shardId, shardType);
    const existingMetrics = this.healthMetrics.get(key);

    const startTime = Date.now();
    let isHealthy = false;
    let responseTime = 0;
    let error = null;

    try {
      // Perform health check (simple connection test)
      const connectionString = this.getConnectionString(shardId, shardType);
      responseTime = await this.testConnection(connectionString);
      isHealthy = responseTime >= 0 && responseTime < this.connectionTimeout;
    } catch (err: any) {
      error = err;
      isHealthy = false;
      console.warn(
        `❌ Health check failed for shard ${shardId}:${shardType}`,
        err.message
      );
    }

    const consecutiveFailures = isHealthy
      ? 0
      : (existingMetrics?.consecutiveFailures ?? 0) + 1;
    const errorRate = this.calculateErrorRate(existingMetrics, isHealthy);

    const metrics: ShardHealthMetrics = {
      shardId,
      shardType,
      isHealthy,
      responseTime,
      lastCheck: new Date(),
      consecutiveFailures,
      errorRate,
    };

    //Update stored metrics
    this.healthMetrics.set(key, metrics);

    // Emit events for state changes
    if (existingMetrics) {
      if (existingMetrics.isHealthy && !isHealthy) {
        this.emit('shard:down', { shardId, shardType, metrics });
      } else if (!existingMetrics.isHealthy && isHealthy) {
        this.emit('shard:up', { shardId, shardType, metrics });
      }
    } else if (isHealthy) {
      this.emit('shard:discovered', { shardId, shardType, metrics });
    }

    return metrics;
  }

  private async performHealthChecks(): Promise<void> {
    const allMetrics = Array.from(this.healthMetrics.values());
    const healthCheckPromises = allMetrics.map((metrics) =>
      this.checkShardHealth(metrics.shardId, metrics.shardType)
    );

    try {
      await Promise.allSettled(healthCheckPromises);
    } catch (error) {
      console.error('Error during batch health checks:', error);
    }
  }

  private async testConnection(connectionString: string): Promise<number> {
    // In a real implementation, this would test actual database connection
    // For now, simulate connection testing based on environment
    const startTime = Date.now();

    // Simulate connection test
    if (process.env.NODE_ENV === 'test') {
      // In test environment, always return fast response
      return 10;
    }

    // Simulate variable response times
    const simulatedResponseTime = Math.random() * 1000; // 0-1000ms

    // Simulate occasional failures
    if (Math.random() < 0.05) {
      // 5% failure rate
      throw new Error('Simulated connection failure');
    }

    await new Promise((resolve) => setTimeout(resolve, simulatedResponseTime));

    return Date.now() - startTime;
  }

  private getConnectionString(shardId: number, shardType: ShardType): string {
    // This woll later be replaced with actual connection string retrieval
    // For now, returning a simulated connection string
    const baseHost = process.env.DB_HOST || 'localhost';
    const basePort = process.env.DB_PORT || '5432';
    const baseDb = process.env.DB_DATABASE || 'therev';

    // Simulate different databases for different shards
    const shardSuffix =
      shardType === ShardType.USERS
        ? 'users'
        : shardType === ShardType.CONTENT
          ? `content_${shardId}`
          : `ai_tasks_${shardId}`;

    return `postgresql://user:pass@${baseHost}:${basePort}/${baseDb}_${shardSuffix}`;
  }

  private getShardKey(shardId: number, shardType: ShardType): string {
    return `${shardType}:${shardId}`;
  }

  private calculateErrorRate(
    existingMetrics: ShardHealthMetrics | undefined,
    isHealthy: boolean
  ): number {
    if (!existingMetrics) {
      return isHealthy ? 0 : 1;
    }

    // Simple moving average of error rate
    const alpha = 0.3; // smoothing factor
    const currentError = isHealthy ? 0 : 1;
    return alpha * currentError + (1 - alpha) * existingMetrics.errorRate;
  }

  /**
   * Initialize metrics for a new shard
   */
  public initializeShardMetrics(shardId: number, shardType: ShardType): void {
    const key = this.getShardKey(shardId, shardType);
    if (!this.healthMetrics.has(key)) {
      const metrics: ShardHealthMetrics = {
        shardId,
        shardType,
        isHealthy: false, // Start as unhealthy until first check
        responseTime: 0,
        lastCheck: new Date(),
        consecutiveFailures: 0,
        errorRate: 1, // Start with 100% error rate
      };
      this.healthMetrics.set(key, metrics);
    }
  }

  /**
   * Remove metrics for a decommissioned shard
   */
  public removeShardMetrics(shardId: number, shardType: ShardType): void {
    const key = this.getShardKey(shardId, shardType);
    this.healthMetrics.delete(key);
  }

  /**
   * Get unhealthy shards for potential alerting
   */
  public getUnhealthyShards(): ShardHealthMetrics[] {
    return Array.from(this.healthMetrics.values()).filter(
      (metrics) => !metrics.isHealthy
    );
  }

  /**
   * Get shards with high error rates (warning threshold)
   */
  public getShardsWithHighErrorRate(
    threshold: number = 0.1
  ): ShardHealthMetrics[] {
    return Array.from(this.healthMetrics.values()).filter(
      (metrics) => metrics.errorRate > threshold
    );
  }
}
