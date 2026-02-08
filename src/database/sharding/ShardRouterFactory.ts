/**
 * Shard Router Factory and Utilities
 * Factory for creating shard routers and utility functions
 */

import {
  IShardRouter,
  ShardConfig,
  ShardType,
  ShardEntityType,
} from './IShardRouter';
import { ShardHealthMonitor } from './ShardHealthMonitor';
import { ShardConnectionManager } from './ShardConnectionManager';

export class ShardRouterFactory {
  /**
   * Create a shard router with default health monitoring and connection management
   */
  static createShardRouter(): IShardRouter {
    const healthMonitor = new ShardHealthMonitor();
    const connectionManager = new ShardConnectionManager();

    // Will be replaced by ModuloShardRouter in Story 1.3
    // For now, return a basic implementation
    return new BasicShardRouter(healthMonitor, connectionManager);
  }

  /**
   * Create a shard router with custom configuration
   */
  static createShardRouterWithConfig(config: {
    healthCheckInterval?: number;
    connectionTimeout?: number;
    maxConnections?: number;
    maxRetries?: number;
  }): IShardRouter {
    const healthMonitor = new ShardHealthMonitor(
      config.healthCheckInterval,
      config.connectionTimeout,
      config.maxRetries
    );
    const connectionManager = new ShardConnectionManager(
      config.maxConnections,
      config.connectionTimeout
    );

    return new BasicShardRouter(healthMonitor, connectionManager);
  }

  /**
   * Create shard configuration from environment variables
   */
  static createShardConfigFromEnv(shardType: ShardType): ShardConfig {
    const totalShards = parseInt(
      process.env[`${shardType.toUpperCase()}_SHARD_COUNT`] || '4'
    );

    // Build connection strings array based on environment
    const connectionStrings: string[] = [];
    for (let i = 0; i < totalShards; i++) {
      const shardEnvVar = `${shardType.toUpperCase()}_SHARD_${i}_CONNECTION`;
      const connectionString =
        process.env[shardEnvVar] ||
        this.getDefaultConnectionString(i, shardType);
      connectionStrings.push(connectionString);
    }

    return {
      totalShards,
      shardType,
      connectionStrings,
      replicaConnectionStrings: this.getReplicaConnectionStrings(shardType),
      healthCheckInterval: parseInt(
        process.env.HEALTH_CHECK_INTERVAL || '30000'
      ),
      maxRetries: parseInt(process.env.SHARD_MAX_RETRIES || '3'),
      timeout: parseInt(process.env.SHARD_TIMEOUT || '5000'),
    };
  }

  private static getDefaultConnectionString(
    shardId: number,
    shardType: ShardType
  ): string {
    const host = process.env.DB_HOST || 'localhost';
    const port = process.env.DB_PORT || '5432';
    const username = process.env.DB_USERNAME || 'postgres';
    const password = process.env.DB_PASSWORD || 'password';
    const baseDb = process.env.DB_DATABASE || 'therev';

    // Create shard specific database name
    let database = baseDb;
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

    return `postgresql://${username}:${password}@${host}:${port}/${database}`;
  }

  private static getReplicaConnectionStrings(shardType: ShardType): string[] {
    const replicaCount = parseInt(
      process.env[`${shardType.toUpperCase()}_REPLICA_COUNT`] || '0'
    );
    const replicaStrings: string[] = [];

    for (let i = 0; i < replicaCount; i++) {
      const replicaEnvVar = `${shardType.toUpperCase()}_REPLICA_${i}_CONNECTION`;
      const connectionString = process.env[replicaEnvVar];
      if (connectionString) {
        replicaStrings.push(connectionString);
      }
    }

    return replicaStrings;
  }
}

/**
 * Basic implementation of IShardRouter for 1.2
 * Will be replaced by ModuloShardRouter in 1.3
 */
import { BaseShardRouter, ShardRouteResult, ShardInfo } from './IShardRouter';

class BasicShardRouter extends BaseShardRouter {
  constructor(
    healthMonitor: ShardHealthMonitor,
    connectionManager: ShardConnectionManager
  ) {
    super(healthMonitor, connectionManager);
    this.initializeDefaultConfigs();
  }

  async routeToShard(
    entityType: ShardEntityType,
    entityKey: string
  ): Promise<ShardRouteResult> {
    const config = this.getShardConfigForEntity(entityType);
    if (!config) {
      throw new Error(
        `No shard configuration found for entity type: ${entityType}`
      );
    }

    // Simple routing logic for now
    const shardId = this.generateHash(entityKey) % config.totalShards;
    const shardInfo = await this.getShardConnection(shardId, config.shardType);

    return {
      shardId,
      shardInfo,
      entityType,
      entityKey,
    };
  }

  private initializeDefaultConfigs(): void {
    // Initialize default configurations for all shard types
    const usersConfig = ShardRouterFactory.createShardConfigFromEnv(
      ShardType.USERS
    );
    const contentConfig = ShardRouterFactory.createShardConfigFromEnv(
      ShardType.CONTENT
    );
    const aiTasksConfig = ShardRouterFactory.createShardConfigFromEnv(
      ShardType.AI_TASKS
    );
    const readReplicaConfig = ShardRouterFactory.createShardConfigFromEnv(
      ShardType.READ_REPLICA
    );

    this.shardConfigs.set(ShardType.USERS, usersConfig);
    this.shardConfigs.set(ShardType.CONTENT, contentConfig);
    this.shardConfigs.set(ShardType.AI_TASKS, aiTasksConfig);
    this.shardConfigs.set(ShardType.READ_REPLICA, readReplicaConfig);

    // Initialize health monitoring for all configured shards
    for (const [shardType, config] of this.shardConfigs) {
      for (let i = 0; i < config.totalShards; i++) {
        (this.shardHealthMonitor as any).initializeShardMetrics(i, shardType);
      }
    }
  }
}

/**
 * Utility functions for shard routing and management
 */
export class ShardUtils {
  /**
   * Extract user ID from various entity keys
   */
  static extractUserIdFromKey(
    entityType: ShardEntityType,
    entityKey: string
  ): string {
    switch (entityType) {
      case ShardEntityType.USER:
      case ShardEntityType.USER_SESSION:
      case ShardEntityType.USER_AI_ACCOUNT:
      case ShardEntityType.AI_TASK:
        // These are already user-based
        return entityKey;

      case ShardEntityType.CONTENT:
        // For content, we need to extract author_id from the entity
        // This would typically involve a database lookup
        // For now, return the content ID and let the calling layer handle it
        return entityKey;

      default:
        throw new Error(
          `Cannot extract user ID from entity type: ${entityType}`
        );
    }
  }

  /**
   * Validate shard ID is within valid range
   */
  static validateShardId(shardId: number, totalShards: number): void {
    if (shardId < 0 || shardId >= totalShards) {
      throw new Error(
        `Invalid shard ID ${shardId}. Must be between 0 and ${totalShards - 1}`
      );
    }
  }

  /**
   * Generate consistent hash from string
   */
  static generateConsistentHash(key: string, totalShards: number): number {
    let hash = 0;
    for (let i = 0; i < key.length; i++) {
      const char = key.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash) % totalShards;
  }

  /**
   * Check if routing is cross-shard for given entity type
   */
  static isCrossShardOperation(
    entityType: ShardEntityType,
    operation: 'read' | 'write'
  ): boolean {
    switch (entityType) {
      case ShardEntityType.USER:
      case ShardEntityType.USER_SESSION:
      case ShardEntityType.USER_AI_ACCOUNT:
      case ShardEntityType.AI_TASK:
        // These are user-based, so they're single-shard for both read and write
        return false;

      case ShardEntityType.CONTENT:
        // Content reads can be cross-shard (search, discovery)
        // Content writes are single-shard (co-located with author)
        return operation === 'read';

      default:
        return false;
    }
  }

  /**
   * Get shard type for entity type
   */
  static getShardTypeForEntity(entityType: ShardEntityType): ShardType {
    switch (entityType) {
      case ShardEntityType.USER:
      case ShardEntityType.USER_SESSION:
      case ShardEntityType.USER_AI_ACCOUNT:
        return ShardType.USERS;

      case ShardEntityType.CONTENT:
        return ShardType.CONTENT;

      case ShardEntityType.AI_TASK:
        return ShardType.AI_TASKS;

      default:
        throw new Error(`Unknown entity type: ${entityType}`);
    }
  }

  /**
   * Create shard key for logging and monitoring
   */
  static createShardKey(shardId: number, shardType: ShardType): string {
    return `${shardType}:${shardId}`;
  }

  /**
   * Parse shard key back into components
   */
  static parseShardKey(shardKey: string): {
    shardId: number;
    shardType: ShardType;
  } {
    const [shardType, shardIdStr] = shardKey.split(':');
    const shardId = parseInt(shardIdStr);

    if (!shardType || isNaN(shardId)) {
      throw new Error(`Invalid shard key format: ${shardKey}`);
    }

    return {
      shardId,
      shardType: shardType as ShardType,
    };
  }
}
