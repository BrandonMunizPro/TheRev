/**
 * Shard Connection Manager Implementation
 * Manages database connection pools for all shards
 * Provides connection pooling, health checks, and resource management
 */

import { DataSource } from 'typeorm';
import { IShardConnectionManager, ShardType } from './IShardRouter';

interface ConnectionPool {
  dataSource: DataSource;
  active: number;
  idle: number;
  total: number;
  waiting: number;
  lastUsed: Date;
}

export class ShardConnectionManager implements IShardConnectionManager {
  private connectionPools: Map<string, ConnectionPool>;
  private maxConnections: number;
  private connectionTimeout: number;
  private idleTimeout: number;

  constructor(
    maxConnections: number = 10,
    connectionTimeout: number = 30000,
    idleTimeout: number = 300000 // 5 minutes will simmer down after scaling
  ) {
    this.connectionPools = new Map();
    this.maxConnections = maxConnections;
    this.connectionTimeout = connectionTimeout;
    this.idleTimeout = idleTimeout;

    // Start cleanup interval for idle connections
    this.startIdleConnectionCleanup();
  }

  async getConnection(
    shardId: number,
    shardType: ShardType
  ): Promise<DataSource> {
    const key = this.getShardKey(shardId, shardType);
    let pool = this.connectionPools.get(key);

    if (!pool) {
      pool = await this.createConnectionPool(shardId, shardType);
      this.connectionPools.set(key, pool);
    }

    // Check if pool is healthy
    if (!pool.dataSource.isInitialized) {
      await pool.dataSource.initialize();
    }

    // Update pool statistics
    pool.active++;
    pool.lastUsed = new Date();

    return pool.dataSource;
  }

  async releaseConnection(
    shardId: number,
    shardType: ShardType,
    connection: DataSource
  ): Promise<void> {
    const key = this.getShardKey(shardId, shardType);
    const pool = this.connectionPools.get(key);

    if (!pool) {
      console.warn(`Attempted to release connection to unknown shard: ${key}`);
      return;
    }

    // Update pool statistics
    pool.active = Math.max(0, pool.active - 1);
    pool.idle++;
  }

  async closeConnections(shardId: number, shardType: ShardType): Promise<void> {
    const key = this.getShardKey(shardId, shardType);
    const pool = this.connectionPools.get(key);

    if (!pool) {
      return;
    }

    if (pool.dataSource.isInitialized) {
      await pool.dataSource.destroy();
    }

    this.connectionPools.delete(key);
    console.log(`Closed connections for shard: ${key}`);
  }

  async getConnectionStats(
    shardId: number,
    shardType: ShardType
  ): Promise<{
    active: number;
    idle: number;
    total: number;
    waiting: number;
  }> {
    const key = this.getShardKey(shardId, shardType);
    const pool = this.connectionPools.get(key);

    if (!pool) {
      return {
        active: 0,
        idle: 0,
        total: 0,
        waiting: 0,
      };
    }

    return {
      active: pool.active,
      idle: pool.idle,
      total: pool.total,
      waiting: pool.waiting,
    };
  }

  private async createConnectionPool(
    shardId: number,
    shardType: ShardType
  ): Promise<ConnectionPool> {
    const connectionString = this.getShardConnectionString(shardId, shardType);
    const isTest = process.env.NODE_ENV === 'test';
    const isDevelopment = process.env.NODE_ENV === 'development';

    const dataSource = new DataSource({
      type: 'postgres',
      host: connectionString.host,
      port: connectionString.port,
      username: connectionString.username,
      password: connectionString.password,
      database: connectionString.database,
      synchronize: isTest,
      logging: isDevelopment,
      entities: this.getEntitiesForShardType(shardType),
      migrations: isTest ? undefined : ['./src/migrations/*.ts'],
      subscribers: [],
      extra: {
        connectionLimit: this.maxConnections,
        acquireTimeout: this.connectionTimeout,
        timeout: this.connectionTimeout,
        // SSL configuration for production
        ssl:
          process.env.NODE_ENV === 'production'
            ? { rejectUnauthorized: false }
            : false,
      },
    });

    // Initialize the connection
    await dataSource.initialize();

    const pool: ConnectionPool = {
      dataSource,
      active: 0,
      idle: this.maxConnections,
      total: this.maxConnections,
      waiting: 0,
      lastUsed: new Date(),
    };

    console.log(
      `Created connection pool for shard: ${this.getShardKey(shardId, shardType)}`
    );
    return pool;
  }

  private getShardConnectionString(
    shardId: number,
    shardType: ShardType
  ): {
    host: string;
    port: number;
    username: string;
    password: string;
    database: string;
  } {
    //production these would come from configuration/environment
    const host = process.env.DB_HOST || 'localhost';
    const port = parseInt(process.env.DB_PORT || '5432');
    const username = process.env.DB_USERNAME || 'postgres';
    const password = process.env.DB_PASSWORD || 'password';

    let database = process.env.DB_DATABASE || 'therev';

    // Append shard identifier based on shard type
    switch (shardType) {
      case ShardType.USERS:
        database += '_users';
        break;
      case ShardType.CONTENT:
        database += `_content_${shardId}`;
        break;
      case ShardType.AI_TASKS:
        database += `_ai_tasks_${shardId}`;
        break;
      case ShardType.READ_REPLICA:
        database += '_read_replica';
        break;
    }

    return { host, port, username, password, database };
  }

  private getEntitiesForShardType(shardType: ShardType): string[] {
    //Return entity paths based on shard type
    switch (shardType) {
      case ShardType.USERS:
        return ['./src/entities/User.ts', './src/entities/AuthResponse.ts'];
      case ShardType.CONTENT:
        return ['./src/entities/Thread.ts', './src/entities/Post.ts'];
      case ShardType.AI_TASKS:
        return ['./src/entities/AITask.ts', './src/entities/AITaskLog.ts'];
      case ShardType.READ_REPLICA:
        return ['./src/entities/*.ts']; //All entities for read replica
      default:
        return ['./src/entities/*.ts'];
    }
  }

  private getShardKey(shardId: number, shardType: ShardType): string {
    return `${shardType}:${shardId}`;
  }

  private startIdleConnectionCleanup(): void {
    setInterval(() => {
      this.cleanupIdleConnections();
    }, this.idleTimeout);
  }

  private async cleanupIdleConnections(): Promise<void> {
    const now = new Date();
    const idleThreshold = this.idleTimeout;

    for (const [key, pool] of this.connectionPools) {
      const timeSinceLastUsed = now.getTime() - pool.lastUsed.getTime();

      if (timeSinceLastUsed > idleThreshold && pool.active === 0) {
        console.log(`🧹 Cleaning up idle connection pool: ${key}`);
        await pool.dataSource.destroy();
        this.connectionPools.delete(key);
      }
    }
  }

  /**
   * Get statistics for all connection pools
   */
  public getAllConnectionStats(): Array<{
    shardKey: string;
    stats: {
      active: number;
      idle: number;
      total: number;
      waiting: number;
      lastUsed: Date;
    };
  }> {
    const stats = [];

    for (const [key, pool] of this.connectionPools) {
      stats.push({
        shardKey: key,
        stats: {
          active: pool.active,
          idle: pool.idle,
          total: pool.total,
          waiting: pool.waiting,
          lastUsed: pool.lastUsed,
        },
      });
    }

    return stats;
  }

  /**
   * Close all connection pools (for shutdown)
   */
  public async closeAllConnections(): Promise<void> {
    const closePromises = [];

    for (const [key, pool] of this.connectionPools) {
      if (pool.dataSource.isInitialized) {
        closePromises.push(pool.dataSource.destroy());
      }
    }

    await Promise.allSettled(closePromises);
    this.connectionPools.clear();
    console.log('🔌 All connection pools closed');
  }

  /**
   * Test connection to a specific shard
   */
  public async testShardConnection(
    shardId: number,
    shardType: ShardType
  ): Promise<boolean> {
    try {
      const connection = await this.getConnection(shardId, shardType);
      await connection.query('SELECT 1');
      await this.releaseConnection(shardId, shardType, connection);
      return true;
    } catch (error) {
      console.error(
        `Connection test failed for shard ${shardId}:${shardType}`,
        error
      );
      return false;
    }
  }
}
