/**
 * Shard Router Interface and Abstraction Layer
 * Provides abstraction for routing database operations to appropriate shards
 * based on different sharding strategies and entity types.
 */

export enum ShardEntityType {
  USER = 'user',
  CONTENT = 'content',
  AI_TASK = 'ai_task',
  USER_SESSION = 'user_session',
  USER_AI_ACCOUNT = 'user_ai_account',
}

export enum ShardType {
  USERS = 'users', // Shard 0: Primary user database
  CONTENT = 'content', // Shards 1-3: Content databases (co located with users)
  AI_TASKS = 'ai_tasks', // Shards 0-3: AI tasks (sharded by user_id)
  READ_REPLICA = 'read_replica', // Cross shard read replicas
}

export interface ShardInfo {
  shardId: number;
  shardKey: number;
  shardType: ShardType;
  connectionString: string;
  isActive: boolean;
  connectionPool?: any;
}

export interface ShardRouteResult {
  shardId: number;
  shardInfo: ShardInfo;
  entityType: ShardEntityType;
  entityKey: string;
}

export interface IShardRouter {
  /**
   * Route an entity to its appropriate shard
   * @param entityType - Type of entity being routed
   * @param entityKey - Primary key or routing key for the entity
   * @returns Shard routing information
   */
  routeToShard(
    entityType: ShardEntityType,
    entityKey: string
  ): Promise<ShardRouteResult>;

  /**
   * Get all shards for a given shard type
   * @param shardType - Type of shard to retrieve
   * @returns Array of shard information
   */
  getShardsByType(shardType: ShardType): Promise<ShardInfo[]>;

  /**
   * Get connection information for a specific shard
   * @param shardId - ID of the shard
   * @param shardType - Type of shard
   * @returns Shard connection information
   */
  getShardConnection(shardId: number, shardType: ShardType): Promise<ShardInfo>;

  /**
   * Check if a shard is healthy and available
   * @param shardId - ID of the shard
   * @param shardType - Type of shard
   * @returns True if shard is healthy
   */
  isShardHealthy(shardId: number, shardType: ShardType): Promise<boolean>;

  /**
   * Get total number of active shards for a type
   * @param shardType - Type of shard
   * @returns Number of active shards
   */
  getActiveShardCount(shardType: ShardType): Promise<number>;

  /**
   * Add a new shard to the routing table
   * @param shardInfo - Information about the new shard
   */
  addShard(shardInfo: ShardInfo): Promise<void>;

  /**
   * Remove a shard from routing (decommission)
   * @param shardId - ID of the shard to remove
   * @param shardType - Type of shard
   */
  removeShard(shardId: number, shardType: ShardType): Promise<void>;

  /**
   * Get health status of all shards
   * @returns Array of shard health information
   */
  getAllShardHealth(): Promise<
    Array<{
      shardId: number;
      shardType: ShardType;
      isHealthy: boolean;
      lastCheck: Date;
    }>
  >;

  /**
   * Initialize the shard router with configuration
   */
  initialize(): Promise<void>;

  /**
   * Clean up resources and shutdown
   */
  shutdown(): Promise<void>;
}

export interface ShardConfig {
  totalShards: number;
  shardType: ShardType;
  connectionStrings: string[];
  replicaConnectionStrings?: string[];
  healthCheckInterval?: number;
  maxRetries?: number;
  timeout?: number;
}

export interface ShardHealthMetrics {
  shardId: number;
  shardType: ShardType;
  isHealthy: boolean;
  responseTime: number;
  lastCheck: Date;
  consecutiveFailures: number;
  errorRate: number;
}

export interface IShardHealthMonitor {
  /**
   * Start monitoring all shards
   */
  startMonitoring(): void;

  /**
   * Stop monitoring
   */
  stopMonitoring(): void;

  /**
   * Get health metrics for all shards
   */
  getHealthMetrics(): Promise<ShardHealthMetrics[]>;

  /**
   * Get health metrics for specific shard
   */
  getShardMetrics(
    shardId: number,
    shardType: ShardType
  ): Promise<ShardHealthMetrics | null>;

  /**
   * Manually trigger health check for a shard
   */
  checkShardHealth(
    shardId: number,
    shardType: ShardType
  ): Promise<ShardHealthMetrics>;
}

export interface IShardConnectionManager {
  /**
   * Get connection pool for a specific shard
   */
  getConnection(shardId: number, shardType: ShardType): Promise<any>;

  /**
   * Release connection back to pool
   */
  releaseConnection(
    shardId: number,
    shardType: ShardType,
    connection: any
  ): Promise<void>;

  /**
   * Close all connections for a shard
   */
  closeConnections(shardId: number, shardType: ShardType): Promise<void>;

  /**
   * Get connection pool statistics
   */
  getConnectionStats(
    shardId: number,
    shardType: ShardType
  ): Promise<{
    active: number;
    idle: number;
    total: number;
    waiting: number;
  }>;
}

/**
 * Base abstract class for shard routers
 * Provides common functionality and utility methods
 */
export abstract class BaseShardRouter implements IShardRouter {
  protected shardConfigs: Map<ShardType, ShardConfig>;
  protected shardHealthMonitor: IShardHealthMonitor;
  protected connectionManager: IShardConnectionManager;
  protected isInitialized = false;

  constructor(
    healthMonitor: IShardHealthMonitor,
    connectionManager: IShardConnectionManager
  ) {
    this.shardConfigs = new Map();
    this.shardHealthMonitor = healthMonitor;
    this.connectionManager = connectionManager;
  }

  abstract routeToShard(
    entityType: ShardEntityType,
    entityKey: string
  ): Promise<ShardRouteResult>;

  async getShardsByType(shardType: ShardType): Promise<ShardInfo[]> {
    const config = this.shardConfigs.get(shardType);
    if (!config) {
      throw new Error(`No configuration found for shard type: ${shardType}`);
    }

    const shards: ShardInfo[] = [];
    for (let i = 0; i < config.totalShards; i++) {
      const isHealthy = await this.isShardHealthy(i, shardType);
      shards.push({
        shardId: i,
        shardKey: i,
        shardType,
        connectionString: config.connectionStrings[i],
        isActive: isHealthy,
      });
    }
    return shards;
  }

  async getShardConnection(
    shardId: number,
    shardType: ShardType
  ): Promise<ShardInfo> {
    const config = this.shardConfigs.get(shardType);
    if (!config) {
      throw new Error(`No configuration found for shard type: ${shardType}`);
    }

    if (shardId >= config.totalShards) {
      throw new Error(
        `Shard ID ${shardId} exceeds total shards ${config.totalShards}`
      );
    }

    const isHealthy = await this.isShardHealthy(shardId, shardType);
    return {
      shardId,
      shardKey: shardId,
      shardType,
      connectionString: config.connectionStrings[shardId],
      isActive: isHealthy,
    };
  }

  async isShardHealthy(
    shardId: number,
    shardType: ShardType
  ): Promise<boolean> {
    const metrics = await this.shardHealthMonitor.getShardMetrics(
      shardId,
      shardType
    );
    return metrics?.isHealthy ?? false;
  }

  async getActiveShardCount(shardType: ShardType): Promise<number> {
    const shards = await this.getShardsByType(shardType);
    return shards.filter((shard) => shard.isActive).length;
  }

  async addShard(shardInfo: ShardInfo): Promise<void> {
    const config = this.shardConfigs.get(shardInfo.shardType);
    if (!config) {
      throw new Error(
        `No configuration found for shard type: ${shardInfo.shardType}`
      );
    }

    // Update connection strings array
    if (shardInfo.shardId >= config.connectionStrings.length) {
      config.connectionStrings.length = shardInfo.shardId + 1;
    }
    config.connectionStrings[shardInfo.shardId] = shardInfo.connectionString;
    config.totalShards = Math.max(config.totalShards, shardInfo.shardId + 1);
  }

  async removeShard(shardId: number, shardType: ShardType): Promise<void> {
    const config = this.shardConfigs.get(shardType);
    if (!config) {
      throw new Error(`No configuration found for shard type: ${shardType}`);
    }

    // Mark shard as inactive by removing connection string
    if (shardId < config.connectionStrings.length) {
      config.connectionStrings[shardId] = '';
    }
  }

  async getAllShardHealth(): Promise<
    Array<{
      shardId: number;
      shardType: ShardType;
      isHealthy: boolean;
      lastCheck: Date;
    }>
  > {
    const allMetrics = await this.shardHealthMonitor.getHealthMetrics();
    return allMetrics.map((metric) => ({
      shardId: metric.shardId,
      shardType: metric.shardType,
      isHealthy: metric.isHealthy,
      lastCheck: metric.lastCheck,
    }));
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    // Initialize health monitoring
    this.shardHealthMonitor.startMonitoring();

    this.isInitialized = true;
  }

  async shutdown(): Promise<void> {
    if (!this.isInitialized) {
      return;
    }

    // Stop health monitoring
    this.shardHealthMonitor.stopMonitoring();

    // Close all connections
    for (const [shardType, config] of this.shardConfigs) {
      for (let i = 0; i < config.totalShards; i++) {
        await this.connectionManager.closeConnections(i, shardType);
      }
    }

    this.isInitialized = false;
  }

  /**
   * Utility method to generate hash from string key
   */
  protected generateHash(key: string): number {
    let hash = 0;
    for (let i = 0; i < key.length; i++) {
      const char = key.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }

  /**
   * Utility method to get shard configuration for entity type
   */
  protected getShardConfigForEntity(
    entityType: ShardEntityType
  ): ShardConfig | null {
    switch (entityType) {
      case ShardEntityType.USER:
      case ShardEntityType.USER_SESSION:
      case ShardEntityType.USER_AI_ACCOUNT:
        return this.shardConfigs.get(ShardType.USERS) || null;

      case ShardEntityType.CONTENT:
        return this.shardConfigs.get(ShardType.CONTENT) || null;

      case ShardEntityType.AI_TASK:
        return this.shardConfigs.get(ShardType.AI_TASKS) || null;

      default:
        return null;
    }
  }
}
