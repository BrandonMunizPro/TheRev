/**
 * Read Replica Manager for Content Discovery
 * Provides read/write splitting: routes read queries to replicas,
 * writes to primary, with automatic fallback on replica failure.
 */

import { Pool, PoolClient, PoolConfig, QueryResultRow } from 'pg';

export enum LoadBalancingStrategy {
  ROUND_ROBIN = 'round_robin',
  LATENCY_BASED = 'latency_based',
  WEIGHTED_PRIORITY = 'weighted_priority',
}

export enum ConsistencyLevel {
  EVENTUAL = 'eventual', // Any replica - fastest, may have stale data
  BOUNDED = 'bounded', // Replica with lag < maxLagMs
  STRONG = 'strong', // Primary only - strongest consistency
}

export interface ReadOptions {
  consistency?: ConsistencyLevel;
  maxReplicationLagMs?: number;
  timeout?: number;
}

export interface ReadReplicaConfig {
  replicaId: string;
  connectionString: string;
  priority: number;
  maxConnections: number;
  maxReplicationLagMs?: number;
}

export interface ReplicaStatistics {
  replicaId: string;
  isHealthy: boolean;
  lastHealthCheck: Date;
  averageLatencyMs: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
  totalQueries: number;
  failedQueries: number;
  consecutiveFailures: number;
  isMarkedUnhealthy: boolean;
  recoveryCooldownUntil?: Date;
  replicationLagMs: number;
  activeConnections: number;
  idleConnections: number;
}

export interface QueryResult<T> {
  rows: T[];
  rowCount: number;
  latencyMs: number;
  fromReplica: boolean;
  replicaId?: string;
}

export interface ManagerMetrics {
  totalReadQueries: number;
  totalWriteQueries: number;
  totalPrimaryFallbacks: number;
  replicaSelections: Map<string, number>;
  averageLatencyMs: number;
  p95LatencyMs: number;
}

/**
 * Single read replica wrapper with production grade health tracking
 */
class ReadReplica {
  private readonly pool: Pool;
  private isHealthy = true;
  private lastHealthCheck = new Date();
  private averageLatencyMs = 0;
  private p50LatencyMs = 0;
  private p95LatencyMs = 0;
  private p99LatencyMs = 0;
  private latencyHistory: number[] = [];
  private readonly maxLatencyHistory = 1000;
  private totalQueries = 0;
  private failedQueries = 0;
  private consecutiveFailures = 0;
  private isMarkedUnhealthy = false;
  private recoveryCooldownUntil?: Date;
  private replicationLagMs = 0;
  private readonly failureThreshold = 3;
  private readonly recoveryCooldownMs = 30000;
  private readonly latencyEwmAlpha = 0.1;

  constructor(public readonly config: ReadReplicaConfig) {
    const poolConfig: PoolConfig = {
      connectionString: config.connectionString,
      max: config.maxConnections,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    };

    this.pool = new Pool(poolConfig);

    this.pool.on('error', (err: Error) => {
      console.error(
        `[ReadReplica] Pool error on replica ${config.replicaId}:`,
        err.message
      );
      this.recordFailure();
    });
  }

  async query<T extends QueryResultRow = any>(
    text: string,
    params?: any[]
  ): Promise<QueryResult<T>> {
    const startTime = Date.now();
    this.totalQueries++;

    try {
      const result = await this.pool.query<T>(text, params);
      const latencyMs = Date.now() - startTime;

      this.updateLatency(latencyMs);
      this.recordSuccess();
      this.lastHealthCheck = new Date();

      return {
        rows: result.rows,
        rowCount: result.rowCount || 0,
        latencyMs,
        fromReplica: true,
        replicaId: this.config.replicaId,
      };
    } catch (error) {
      this.failedQueries++;
      this.recordFailure();
      throw error;
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const startTime = Date.now();
      const client = await this.pool.connect();

      const lagResult = await client.query(
        'SELECT EXTRACT(EPOCH FROM (now() - pg_last_xact_replay_timestamp())) * 1000 AS lag'
      );
      const lagMs = parseFloat(lagResult.rows[0]?.lag) || 0;
      this.replicationLagMs = isNaN(lagMs) ? 0 : lagMs;

      await client.query('SELECT 1');
      client.release();

      const latencyMs = Date.now() - startTime;
      this.averageLatencyMs =
        this.averageLatencyMs * (1 - this.latencyEwmAlpha) +
        latencyMs * this.latencyEwmAlpha;

      this.isHealthy = true;
      this.lastHealthCheck = new Date();

      if (this.isMarkedUnhealthy && this.consecutiveFailures === 0) {
        const canRecover =
          !this.recoveryCooldownUntil ||
          new Date() >= this.recoveryCooldownUntil;
        if (canRecover) {
          this.isMarkedUnhealthy = false;
          console.log(
            `[ReadReplica] Replica ${this.config.replicaId} recovered`
          );
        }
      }

      return true;
    } catch (error) {
      this.isHealthy = false;
      return false;
    }
  }

  getStatistics(): ReplicaStatistics {
    return {
      replicaId: this.config.replicaId,
      isHealthy: this.isHealthy,
      lastHealthCheck: this.lastHealthCheck,
      averageLatencyMs: this.averageLatencyMs,
      p50LatencyMs: this.p50LatencyMs,
      p95LatencyMs: this.p95LatencyMs,
      p99LatencyMs: this.p99LatencyMs,
      totalQueries: this.totalQueries,
      failedQueries: this.failedQueries,
      consecutiveFailures: this.consecutiveFailures,
      isMarkedUnhealthy: this.isMarkedUnhealthy,
      recoveryCooldownUntil: this.recoveryCooldownUntil,
      replicationLagMs: this.replicationLagMs,
      activeConnections: this.pool.totalCount - this.pool.idleCount,
      idleConnections: this.pool.idleCount,
    };
  }

  canServeRequests(maxLagMs?: number): boolean {
    if (!this.isHealthy || this.isMarkedUnhealthy) {
      return false;
    }

    if (this.recoveryCooldownUntil && new Date() < this.recoveryCooldownUntil) {
      return false;
    }

    if (maxLagMs !== undefined && this.replicationLagMs > maxLagMs) {
      return false;
    }

    return true;
  }

  getAverageLatency(): number {
    return this.averageLatencyMs;
  }

  getReplicationLag(): number {
    return this.replicationLagMs;
  }

  private recordSuccess(): void {
    this.consecutiveFailures = 0;
    this.isHealthy = true;
  }

  private recordFailure(): void {
    this.consecutiveFailures++;
    this.isHealthy = false;

    if (
      this.consecutiveFailures >= this.failureThreshold &&
      !this.isMarkedUnhealthy
    ) {
      this.isMarkedUnhealthy = true;
      this.recoveryCooldownUntil = new Date(
        Date.now() + this.recoveryCooldownMs
      );
      console.warn(
        `[ReadReplica] Replica ${this.config.replicaId} marked unhealthy after ${this.consecutiveFailures} failures. ` +
          `Cooldown until ${this.recoveryCooldownUntil.toISOString()}`
      );
    }
  }

  private updateLatency(latencyMs: number): void {
    this.latencyHistory.push(latencyMs);
    if (this.latencyHistory.length > this.maxLatencyHistory) {
      this.latencyHistory.shift();
    }

    this.averageLatencyMs =
      this.averageLatencyMs * (1 - this.latencyEwmAlpha) +
      latencyMs * this.latencyEwmAlpha;

    if (this.latencyHistory.length > 10) {
      const sorted = [...this.latencyHistory].sort((a, b) => a - b);
      const len = sorted.length;
      this.p50LatencyMs = sorted[Math.floor(len * 0.5)];
      this.p95LatencyMs = sorted[Math.floor(len * 0.95)];
      this.p99LatencyMs = sorted[Math.floor(len * 0.99)];
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

/**
 *Read Replica Manager
 *Manages multiple read replicas for content discovery
 *Provides read/write splitting with automatic failover
 Production features:
 *Multiple load balancing strategies
 *Request level consistency control
 *Circuit breaker pattern with cooldown
 *Replication lag awareness
 *Comprehensive metrics
 */
export class ReadReplicaManager {
  private readonly replicas = new Map<string, ReadReplica>();
  private readonly primaryPool: Pool;
  private healthCheckInterval = 10000;
  private healthCheckTimer?: NodeJS.Timeout;
  private roundRobinIndex = 0;

  private loadBalancingStrategy: LoadBalancingStrategy =
    LoadBalancingStrategy.ROUND_ROBIN;

  private metrics = {
    totalReadQueries: 0,
    totalWriteQueries: 0,
    totalPrimaryFallbacks: 0,
    replicaSelections: new Map<string, number>(),
    readLatencies: [] as number[],
    maxLatencyHistory: 1000,
  };

  constructor(
    primaryConnectionString: string,
    private readonly maxConnectionsPerReplica: number = 10,
    strategy: LoadBalancingStrategy = LoadBalancingStrategy.ROUND_ROBIN
  ) {
    const primaryConfig: PoolConfig = {
      connectionString: primaryConnectionString,
      max: maxConnectionsPerReplica,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    };

    this.primaryPool = new Pool(primaryConfig);
    this.loadBalancingStrategy = strategy;

    console.log('[ReadReplica] Manager initialized with primary connection');
  }

  setLoadBalancingStrategy(strategy: LoadBalancingStrategy): void {
    this.loadBalancingStrategy = strategy;
    console.log(`[ReadReplica] Load balancing strategy set to ${strategy}`);
  }

  /**
   * Add a read replica
   */
  addReplica(config: ReadReplicaConfig): void {
    const replica = new ReadReplica(config);
    this.replicas.set(config.replicaId, replica);
    this.metrics.replicaSelections.set(config.replicaId, 0);
    console.log(
      `[ReadReplica] Added replica ${config.replicaId} with priority ${config.priority}`
    );
  }

  /**
   * Execute read query with configurable consistency
   */
  async read<T extends QueryResultRow = any>(
    text: string,
    params?: any[],
    options: ReadOptions = {}
  ): Promise<QueryResult<T>> {
    const consistency = options.consistency ?? ConsistencyLevel.EVENTUAL;
    const maxLagMs =
      options.maxReplicationLagMs ??
      (options.consistency === ConsistencyLevel.BOUNDED ? 2000 : undefined);

    if (consistency === ConsistencyLevel.STRONG) {
      return this.readFromPrimary<T>(text, params);
    }

    this.metrics.totalReadQueries++;

    const availableReplicas = this.getAvailableReplicas(maxLagMs);

    if (availableReplicas.length === 0) {
      console.warn(
        '[ReadReplica] No available replicas, falling back to primary'
      );
      this.metrics.totalPrimaryFallbacks++;
      return this.readFromPrimary<T>(text, params);
    }

    const replica = this.selectReplica(availableReplicas);
    this.metrics.replicaSelections.set(
      replica.config.replicaId,
      (this.metrics.replicaSelections.get(replica.config.replicaId) || 0) + 1
    );

    try {
      const result = await replica.query<T>(text, params);
      this.recordReadLatency(result.latencyMs);
      return result;
    } catch (error) {
      console.error(
        `[ReadReplica] Query failed on replica ${replica.config.replicaId}, trying fallback`
      );

      const fallbackReplicas = availableReplicas.filter((r) => r !== replica);

      if (fallbackReplicas.length === 0) {
        this.metrics.totalPrimaryFallbacks++;
        return this.readFromPrimary<T>(text, params);
      }

      const fallbackReplica = this.selectReplica(fallbackReplicas);
      this.metrics.replicaSelections.set(
        fallbackReplica.config.replicaId,
        (this.metrics.replicaSelections.get(fallbackReplica.config.replicaId) ||
          0) + 1
      );

      const fallbackResult = await fallbackReplica.query<T>(text, params);
      this.recordReadLatency(fallbackResult.latencyMs);
      return fallbackResult;
    }
  }

  /**
   * Execute write query on primary
   */
  async write<T extends QueryResultRow = any>(
    text: string,
    params?: any[]
  ): Promise<QueryResult<T>> {
    const startTime = Date.now();
    this.metrics.totalWriteQueries++;

    try {
      const result = await this.primaryPool.query<T>(text, params);

      return {
        rows: result.rows,
        rowCount: result.rowCount || 0,
        latencyMs: Date.now() - startTime,
        fromReplica: false,
      };
    } catch (error) {
      console.error('[ReadReplica] Write query failed:', error);
      throw error;
    }
  }

  async readFromPrimary<T extends QueryResultRow = any>(
    text: string,
    params?: any[]
  ): Promise<QueryResult<T>> {
    const startTime = Date.now();

    try {
      const result = await this.primaryPool.query<T>(text, params);

      return {
        rows: result.rows,
        rowCount: result.rowCount || 0,
        latencyMs: Date.now() - startTime,
        fromReplica: false,
      };
    } catch (error) {
      console.error('[ReadReplica] Primary read failed:', error);
      throw error;
    }
  }

  async getPrimaryClient(): Promise<PoolClient> {
    return this.primaryPool.connect();
  }

  getAllStatistics(): ReplicaStatistics[] {
    const stats: ReplicaStatistics[] = [];

    for (const replica of this.replicas.values()) {
      stats.push(replica.getStatistics());
    }

    return stats;
  }

  /**
   * Get aggregated manager metrics
   */
  getMetrics(): ManagerMetrics {
    const latencies = this.metrics.readLatencies;
    const sorted = [...latencies].sort((a, b) => a - b);
    const p95Index = Math.floor(sorted.length * 0.95);

    return {
      totalReadQueries: this.metrics.totalReadQueries,
      totalWriteQueries: this.metrics.totalWriteQueries,
      totalPrimaryFallbacks: this.metrics.totalPrimaryFallbacks,
      replicaSelections: new Map(this.metrics.replicaSelections),
      averageLatencyMs:
        sorted.length > 0
          ? sorted.reduce((a, b) => a + b, 0) / sorted.length
          : 0,
      p95LatencyMs: sorted.length > 0 ? sorted[p95Index] : 0,
    };
  }

  /**
   * Perform health check on all replicas
   */
  async performHealthCheck(): Promise<{
    healthy: number;
    unhealthy: number;
    replicas: Array<{
      replicaId: string;
      isHealthy: boolean;
      isMarkedUnhealthy: boolean;
      replicationLagMs: number;
    }>;
  }> {
    const results = {
      healthy: 0,
      unhealthy: 0,
      replicas: [] as Array<{
        replicaId: string;
        isHealthy: boolean;
        isMarkedUnhealthy: boolean;
        replicationLagMs: number;
      }>,
    };

    for (const [replicaId, replica] of this.replicas.entries()) {
      const isHealthy = await replica.healthCheck();
      const stats = replica.getStatistics();

      results.replicas.push({
        replicaId,
        isHealthy,
        isMarkedUnhealthy: stats.isMarkedUnhealthy,
        replicationLagMs: stats.replicationLagMs,
      });

      if (isHealthy && !stats.isMarkedUnhealthy) {
        results.healthy++;
      } else {
        results.unhealthy++;
      }
    }

    return results;
  }

  /**
   * Start periodic health monitoring
   */
  startHealthMonitoring(): void {
    this.healthCheckTimer = setInterval(async () => {
      const results = await this.performHealthCheck();

      if (results.unhealthy > 0) {
        console.warn(
          `[ReadReplica] ${results.unhealthy} replicas unhealthy:`,
          results.replicas
            .filter((r) => !r.isHealthy || r.isMarkedUnhealthy)
            .map(
              (r) => `${r.replicaId}(lag:${r.replicationLagMs.toFixed(0)}ms)`
            )
        );
      }
    }, this.healthCheckInterval);
  }

  stopHealthMonitoring(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = undefined;
    }
  }

  /**
   * Close all replica connections
   */
  async close(): Promise<void> {
    console.log('[ReadReplica] Closing all connections...');

    this.stopHealthMonitoring();

    const closePromises = Array.from(this.replicas.values()).map((r) =>
      r.close()
    );
    await Promise.all(closePromises);

    await this.primaryPool.end();

    this.replicas.clear();
    console.log('[ReadReplica] All connections closed');
  }

  private getAvailableReplicas(maxLagMs?: number): ReadReplica[] {
    const available: ReadReplica[] = [];

    for (const replica of this.replicas.values()) {
      if (replica.canServeRequests(maxLagMs)) {
        available.push(replica);
      }
    }

    return available;
  }

  private selectReplica(replicas: ReadReplica[]): ReadReplica {
    if (replicas.length === 1) {
      return replicas[0];
    }

    switch (this.loadBalancingStrategy) {
      case LoadBalancingStrategy.ROUND_ROBIN:
        return this.selectRoundRobin(replicas);

      case LoadBalancingStrategy.LATENCY_BASED:
        return this.selectLowestLatency(replicas);

      case LoadBalancingStrategy.WEIGHTED_PRIORITY:
        return this.selectWeightedPriority(replicas);

      default:
        return this.selectRoundRobin(replicas);
    }
  }

  private selectRoundRobin(replicas: ReadReplica[]): ReadReplica {
    const replica = replicas[this.roundRobinIndex % replicas.length];
    this.roundRobinIndex++;
    return replica;
  }

  private selectLowestLatency(replicas: ReadReplica[]): ReadReplica {
    if (replicas.length === 1) {
      return replicas[0];
    }

    const sorted = [...replicas].sort(
      (a, b) => a.getAverageLatency() - b.getAverageLatency()
    );

    const topN = Math.min(2, sorted.length);
    const candidates = sorted.slice(0, topN);
    const randomIndex = Math.floor(Math.random() * candidates.length);
    return candidates[randomIndex];
  }

  private selectWeightedPriority(replicas: ReadReplica[]): ReadReplica {
    const sorted = [...replicas].sort(
      (a, b) => a.config.priority - b.config.priority
    );

    const weighted: Array<{
      replica: ReadReplica;
      weight: number;
      min: number;
      max: number;
    }> = [];
    let cumulative = 0;

    for (let i = 0; i < sorted.length; i++) {
      const weight = sorted.length - i;
      const min = cumulative;
      cumulative += weight;
      weighted.push({ replica: sorted[i], weight, min, max: cumulative });
    }

    const random = Math.random() * cumulative;

    for (const item of weighted) {
      if (random >= item.min && random < item.max) {
        return item.replica;
      }
    }

    return sorted[0];
  }

  private recordReadLatency(latencyMs: number): void {
    this.metrics.readLatencies.push(latencyMs);
    if (this.metrics.readLatencies.length > this.metrics.maxLatencyHistory) {
      this.metrics.readLatencies.shift();
    }
  }
}
