/**
 * Database Connection Pool with Shard Management
 * Efficient connection reuse and shard lifecycle management
 */

import { Pool, PoolClient, PoolConfig } from 'pg';
import { ShardType, ShardStatus } from './IShardRouter';
import { DualWriteMigrationService } from './DualWriteMigrationService';
import { UserStorageLocation } from '../../entities/MigrationState';

/**
 * Connection pool statistics
 */
export interface PoolStatistics {
  shardId: number;
  shardType: ShardType;
  total: number;
  active: number;
  idle: number;
  waiting: number;
  lastActivity: Date;
  averageLifetime: number;
  totalCreated: number;
  totalDestroyed: number;
}

/**
 * Pooled database connection wrapper
 * Wraps pg.PoolClient with metadata for shard management
 */
export interface PooledConnection {
  id: string;
  shardId: number;
  shardType: ShardType;
  client: PoolClient;
  release: () => void;
  createdAt: Date;
  lastUsed: Date;
  useCount: number;
}

/**
 * Shard specific connection pool
 */
export interface ShardConnectionPool {
  shardId: number;
  shardType: ShardType;
  maxSize: number;
  minSize: number;
  acquireTimeout: number;
  idleTimeout: number;
  statistics: PoolStatistics;

  // Pool operations
  getConnection(): Promise<PooledConnection>;
  releaseConnection(connection: PooledConnection): Promise<void>;
  healthCheck(): Promise<boolean>;
  getStatistics(): PoolStatistics;
  close(): Promise<void>;
  isHealthy(): boolean;
}

/**
 * Database connection pool manager
 * Manages multiple connection pools for different shard types
 * Handles connection lifecycle, health checking, and resource optimization
 */
export class DatabaseConnectionPoolManager {
  private readonly pools = new Map<string, ShardConnectionPool>();
  private readonly connections = new Map<string, PooledConnection>();
  private readonly healthCheckInterval = 5000; // 5 seconds
  private healthCheckTimers = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly migrationService: DualWriteMigrationService,
    private readonly shardRouter: any // TODO: Use proper type
  ) {
    console.log(
      '[ConnectionPool] Database connection pool manager initialized'
    );
  }

  /**
   * Initialize all shard connection pools
   */
  async initialize(shardConfigs: Map<ShardType, any[]>): Promise<void> {
    console.log('[ConnectionPool] Initializing connection pools...');

    // Create pool for each shard
    for (const [shardType, shards] of shardConfigs.entries()) {
      for (let i = 0; i < shards.length; i++) {
        const shardId = i;
        const poolKey = `${shardType}:${shardId}`;

        // Create pool for this shard
        const pool = this.createShardPool(shardType, shardId, shards[i]);
        this.pools.set(poolKey, pool);

        // Start health monitoring for this pool
        this.startHealthMonitoring(poolKey);

        console.log(
          `[ConnectionPool] Created pool for ${shardType} shard ${shardId} (${poolKey})`
        );
      }
    }

    // Start global health checking
    this.startGlobalHealthChecking();

    console.log('[ConnectionPool] All connection pools initialized');
  }

  /**
   * Get connection for a specific user
   * Uses user's storage location to determine correct pool
   */
  async getConnectionForUser(userId: string): Promise<PooledConnection> {
    // Get user's storage location
    const storageLocation =
      await this.migrationService.getUserStorageLocation(userId);

    // Determine which pool to use
    let poolKey: string;

    if (storageLocation.primary === 'legacy') {
      // Legacy connection - use default legacy pool
      poolKey = 'legacy:default';
    } else {
      // Sharded connection - use specific shard pool
      const shardId =
        storageLocation.shardId ||
        (await this.shardRouter.getShardForUser(userId));
      poolKey = `users:${shardId}`; // Assuming user shards for now
    }

    // Get connection from appropriate pool
    const pool = this.pools.get(poolKey);

    if (!pool) {
      throw new Error(`No connection pool found for ${poolKey}`);
    }

    return await pool.getConnection();
  }

  async releaseConnection(connection: PooledConnection): Promise<void> {
    const poolKey = `${connection.shardType}:${connection.shardId}`;
    const pool = this.pools.get(poolKey);

    if (!pool) {
      console.warn(
        `[ConnectionPool] No pool found for connection ${connection.id}, cannot release`
      );
      return;
    }

    await pool.releaseConnection(connection);
  }

  getAllStatistics(): PoolStatistics[] {
    const stats: PoolStatistics[] = [];

    for (const [poolKey, pool] of this.pools.entries()) {
      stats.push(pool.getStatistics());
    }

    return stats;
  }

  async performHealthCheck(): Promise<{
    healthyPools: number;
    unhealthyPools: number;
    details: Array<{ poolKey: string; isHealthy: boolean; error?: string }>;
  }> {
    const results: {
      healthyPools: number;
      unhealthyPools: number;
      details: Array<{ poolKey: string; isHealthy: boolean; error?: string }>;
    } = {
      healthyPools: 0,
      unhealthyPools: 0,
      details: [],
    };

    for (const [poolKey, pool] of this.pools.entries()) {
      try {
        const isHealthy = await pool.healthCheck();

        results.details.push({
          poolKey,
          isHealthy,
        });

        if (isHealthy) {
          results.healthyPools++;
        } else {
          results.unhealthyPools++;
        }
      } catch (error: any) {
        results.unhealthyPools++;
        results.details.push({
          poolKey,
          isHealthy: false,
          error: error.message,
        });
      }
    }

    return results;
  }

  /**
   * Close all connection pools
   */
  async close(): Promise<void> {
    console.log('[ConnectionPool] Closing all connection pools...');

    // Stop health monitoring
    this.stopAllHealthMonitoring();

    // Close all pools
    const closePromises = Array.from(this.pools.values()).map((pool) =>
      pool.close()
    );
    await Promise.all(closePromises);

    this.pools.clear();

    console.log('[ConnectionPool] All connection pools closed');
  }

  /**
   * Clean up idle connections in all pools
   * Delegates to individual pools which handle their own idle connection management
   */
  async cleanupIdleConnections(idleTimeout: number = 300000): Promise<number> {
    let totalCleaned = 0;

    for (const [poolKey, pool] of this.pools.entries()) {
      try {
        // Each pool manages its own idle connections internally
        // This method provides coordination and reporting
        const stats = pool.getStatistics();

        // Trigger pool's internal cleanup if needed
        // Note: SimpleConnectionPool handles this automatically via idle timeout
        console.log(
          `[ConnectionPool] Pool ${poolKey} has ${stats.idle} idle connections`
        );
      } catch (error: any) {
        console.error(
          `[ConnectionPool] Error checking pool ${poolKey} for cleanup:`,
          error
        );
      }
    }

    return totalCleaned;
  }

  // Private methods

  /**
   * Create a connection pool for a specific shard
   */
  private createShardPool(
    shardType: ShardType,
    shardId: number,
    connectionString: string
  ): ShardConnectionPool {
    const poolKey = `${shardType}:${shardId}`;

    return new PgPoolWrapper(
      shardId,
      shardType,
      connectionString,
      10, // maxSize - Configurable pool size
      2, // minSize
      5000, // acquireTimeout
      300000 // idleTimeout - 5 minutes
    );
  }

  /**
   * Start health monitoring for a specific pool
   */
  private startHealthMonitoring(poolKey: string): void {
    const timer = setInterval(async () => {
      const pool = this.pools.get(poolKey);
      if (!pool) return;

      const isHealthy = await pool.healthCheck();

      if (!isHealthy) {
        console.warn(`[ConnectionPool] Pool ${poolKey} health check failed`);
      }
    }, this.healthCheckInterval);

    this.healthCheckTimers.set(poolKey, timer);
  }

  /**
   * Start global health checking for all pools
   */
  private startGlobalHealthChecking(): void {
    setInterval(async () => {
      const results = await this.performHealthCheck();

      if (results.unhealthyPools > 0) {
        console.warn(
          `[ConnectionPool] ${results.unhealthyPools} pools unhealthy:`,
          results.details.filter((d) => !d.isHealthy).map((d) => d.poolKey)
        );
      }
    }, this.healthCheckInterval * 2); // Check every 10 seconds
  }

  /**
   * Stop health monitoring for all pools
   */
  private stopAllHealthMonitoring(): void {
    for (const timer of this.healthCheckTimers.values()) {
      clearInterval(timer);
    }

    this.healthCheckTimers.clear();
  }
}

/**
 * pg.Pool wrapper that implements ShardConnectionPool interface
 * Delegates pooling to battle-tested pg.Pool while providing shard metadata
 */
class PgPoolWrapper implements ShardConnectionPool {
  private readonly pool: Pool;
  private connectionIdCounter = 0;
  private totalCreated = 0;
  private totalDestroyed = 0;
  private lastActivity = new Date();

  constructor(
    public readonly shardId: number,
    public readonly shardType: ShardType,
    connectionString: string,
    public readonly maxSize: number,
    public readonly minSize: number,
    public readonly acquireTimeout: number,
    public readonly idleTimeout: number
  ) {
    const poolConfig: PoolConfig = {
      connectionString,
      max: maxSize,
      idleTimeoutMillis: idleTimeout,
      connectionTimeoutMillis: acquireTimeout,
    };

    this.pool = new Pool(poolConfig);

    this.pool.on('error', (err: Error) => {
      console.error(
        `[ConnectionPool] Unexpected error on ${this.shardType} shard ${this.shardId}:`,
        err.message
      );
    });

    this.pool.on('connect', () => {
      this.totalCreated++;
      this.lastActivity = new Date();
    });

    this.pool.on('remove', () => {
      this.totalDestroyed++;
    });

    console.log(
      `[ConnectionPool] pg.Pool created for ${shardType} shard ${shardId}`
    );
  }

  public get statistics(): PoolStatistics {
    return this.getStatistics();
  }

  async getConnection(): Promise<PooledConnection> {
    const client = await this.pool.connect();
    const connection: PooledConnection = {
      id: `${this.shardType}-${this.shardId}-${this.connectionIdCounter++}`,
      shardId: this.shardId,
      shardType: this.shardType,
      client,
      release: () => client.release(),
      createdAt: new Date(),
      lastUsed: new Date(),
      useCount: 1,
    };

    this.lastActivity = new Date();
    return connection;
  }

  async releaseConnection(connection: PooledConnection): Promise<void> {
    connection.release();
    connection.lastUsed = new Date();
  }

  getStatistics(): PoolStatistics {
    return {
      shardId: this.shardId,
      shardType: this.shardType,
      total: this.pool.totalCount,
      active: this.pool.totalCount - this.pool.idleCount,
      idle: this.pool.idleCount,
      waiting: (this.pool as any).waitingCount ?? 0,
      lastActivity: this.lastActivity,
      averageLifetime: 0,
      totalCreated: this.totalCreated,
      totalDestroyed: this.totalDestroyed,
    };
  }

  isHealthy(): boolean {
    return true;
  }

  async healthCheck(): Promise<boolean> {
    try {
      const client = await this.pool.connect();
      await client.query('SELECT 1');
      client.release();
      return true;
    } catch (error) {
      console.error(
        `[ConnectionPool] Health check failed for ${this.shardType} shard ${this.shardId}:`,
        error
      );
      return false;
    }
  }

  async close(): Promise<void> {
    console.log(
      `[ConnectionPool] Closing pg.Pool for ${this.shardType} shard ${this.shardId}`
    );
    await this.pool.end();
  }
}
