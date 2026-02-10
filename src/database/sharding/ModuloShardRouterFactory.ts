/**
 * ModuloShardRouter Factory and Integration
 * Epic 1: Enterprise Database Foundation - Story 1.3
 *
 * Factory for creating configured ModuloShardRouter instances
 * Integration utilities and configuration management
 */

import { ModuloShardRouter } from './ModuloShardRouter';
import { ShardHealthMonitor } from './ShardHealthMonitor';
import { ShardConnectionManager } from './ShardConnectionManager';
import {
  IShardRouter,
  ShardConfig,
  ShardType,
  ShardEntityType,
} from './IShardRouter';

export interface ModuloShardRouterConfig {
  enableMetrics: boolean;
  healthCheckInterval: number;
  connectionTimeout: number;
  maxConnections: number;
  maxRetries: number;
  routingTimeout: number;
}

export class ModuloShardRouterFactory {
  /**
   * Create a ModuloShardRouter with custom configuration
   */
  static createRouterWithConfig(
    config: ModuloShardRouterConfig
  ): ModuloShardRouter {
    // Validate configuration before use
    this.validateConfig(config);

    const healthMonitor = new ShardHealthMonitor(
      config.healthCheckInterval,
      config.connectionTimeout,
      config.maxRetries
    );

    const connectionManager = new ShardConnectionManager(
      config.maxConnections,
      config.connectionTimeout
    );

    return new ModuloShardRouter(
      healthMonitor,
      connectionManager,
      config.enableMetrics
    );
  }

  /**
   * Create a ModuloShardRouter configured from environment variables
   */
  static createRouterFromEnv(): ModuloShardRouter {
    const config = this.getConfigFromEnv();
    return this.createRouterWithConfig(config);
  }

  /**
   * Get default configuration for ModuloShardRouter
   */
  static getDefaultConfig(): ModuloShardRouterConfig {
    return {
      enableMetrics: process.env.ENABLE_ROUTING_METRICS !== 'false',
      healthCheckInterval: parseInt(
        process.env.SHARD_HEALTH_CHECK_INTERVAL || '30000'
      ),
      connectionTimeout: parseInt(
        process.env.SHARD_CONNECTION_TIMEOUT || '5000'
      ),
      maxConnections: parseInt(process.env.SHARD_MAX_CONNECTIONS || '10'),
      maxRetries: parseInt(process.env.SHARD_MAX_RETRIES || '3'),
      routingTimeout: parseInt(process.env.SHARD_ROUTING_TIMEOUT || '1000'),
    };
  }

  /**
   * Load configuration from environment variables
   */
  static getConfigFromEnv(): ModuloShardRouterConfig {
    const config = {
      enableMetrics: process.env.ENABLE_ROUTING_METRICS !== 'false',
      healthCheckInterval: parseInt(
        process.env.SHARD_HEALTH_CHECK_INTERVAL || '30000'
      ),
      connectionTimeout: parseInt(
        process.env.SHARD_CONNECTION_TIMEOUT || '5000'
      ),
      maxConnections: parseInt(process.env.SHARD_MAX_CONNECTIONS || '10'),
      maxRetries: parseInt(process.env.SHARD_MAX_RETRIES || '3'),
      routingTimeout: parseInt(process.env.SHARD_ROUTING_TIMEOUT || '1000'),
    };

    // Validate environment-based configuration
    this.validateConfig(config);
    return config;
  }

  /**
   * Validate configuration parameters
   */
  static validateConfig(config: ModuloShardRouterConfig): void {
    if (config.healthCheckInterval < 1000) {
      throw new Error('Health check interval must be at least 1000ms');
    }

    if (config.connectionTimeout < 100) {
      throw new Error('Connection timeout must be at least 100ms');
    }

    if (config.maxConnections < 1 || config.maxConnections > 100) {
      throw new Error('Max connections must be between 1 and 100');
    }

    if (config.maxRetries < 0 || config.maxRetries > 10) {
      throw new Error('Max retries must be between 0 and 10');
    }

    if (config.routingTimeout < 10 || config.routingTimeout > 10000) {
      throw new Error('Routing timeout must be between 10ms and 10s');
    }
  }
}

/**
 * ModuloShardRouter Integration Utilities
 */
export class ModuloShardRouterUtils {
  /**
   * Initialize a ModuloShardRouter with shard configurations
   */
  static async initializeRouter(router: ModuloShardRouter): Promise<void> {
    try {
      await router.initialize();
      console.log('ModuloShardRouter initialized successfully');
    } catch (error) {
      console.error('Failed to initialize ModuloShardRouter:', error);
      throw error;
    }
  }

  /**
   * Gracefully shutdown a ModuloShardRouter
   */
  static async shutdownRouter(router: ModuloShardRouter): Promise<void> {
    try {
      await router.shutdown();
      console.log('ModuloShardRouter shutdown successfully');
    } catch (error) {
      console.error('Failed to shutdown ModuloShardRouter:', error);
      throw error;
    }
  }

  /**
   * Test ModuloShardRouter functionality
   */
  static async testRouter(router: ModuloShardRouter): Promise<boolean> {
    try {
      // Test routing for each entity type
      const testCases = [
        { entityType: ShardEntityType.USER, entityKey: 'test-user-123' },
        {
          entityType: ShardEntityType.CONTENT,
          entityKey: 'test-user-123:content-456',
        },
        { entityType: ShardEntityType.AI_TASK, entityKey: 'test-user-123' },
      ];

      for (const testCase of testCases) {
        const result = await router.routeToShard(
          testCase.entityType,
          testCase.entityKey
        );
        console.debug(
          `✅ Test route ${testCase.entityType}:${testCase.entityKey} -> shard ${result.shardId}`
        );
      }

      return true;
    } catch (error) {
      console.error('ModuloShardRouter test failed:', error);
      return false;
    }
  }

  /**
   * Get router health status
   */
  static async getRouterHealth(router: ModuloShardRouter): Promise<{
    isHealthy: boolean;
    shardCount: number;
    healthyShardCount: number;
    lastHealthCheck: Date;
  }> {
    try {
      const allHealth = await router.getAllShardHealth();
      const totalShards = allHealth.length;
      const healthyShards = allHealth.filter((h) => h.isHealthy).length;
      const lastHealthCheck = new Date(); // Would come from health monitor

      return {
        isHealthy: healthyShards === totalShards && totalShards > 0,
        shardCount: totalShards,
        healthyShardCount: healthyShards,
        lastHealthCheck,
      };
    } catch (error) {
      console.error('Failed to get router health:', error);
      return {
        isHealthy: false,
        shardCount: 0,
        healthyShardCount: 0,
        lastHealthCheck: new Date(),
      };
    }
  }

  /**
   * Create shard configuration for MVP deployment
   */
  static createMVPShardConfig(): Record<ShardType, ShardConfig> {
    return {
      [ShardType.USERS]: {
        totalShards: 1, // Single user shard for MVP
        shardType: ShardType.USERS,
        connectionStrings: [
          process.env.USERS_SHARD_0_CONNECTION ||
            'postgresql://localhost:5432/therev_users',
        ],
        healthCheckInterval: 30000,
        maxRetries: 3,
        timeout: 5000,
      },
      [ShardType.CONTENT]: {
        totalShards: 1, // Single content shard for MVP
        shardType: ShardType.CONTENT,
        connectionStrings: [
          process.env.CONTENT_SHARD_0_CONNECTION ||
            'postgresql://localhost:5432/therev_content_0',
        ],
        healthCheckInterval: 30000,
        maxRetries: 3,
        timeout: 5000,
      },
      [ShardType.AI_TASKS]: {
        totalShards: 1, // Single AI tasks shard for MVP
        shardType: ShardType.AI_TASKS,
        connectionStrings: [
          process.env.AI_TASKS_SHARD_0_CONNECTION ||
            'postgresql://localhost:5432/therev_ai_tasks_0',
        ],
        healthCheckInterval: 30000,
        maxRetries: 3,
        timeout: 5000,
      },
      [ShardType.READ_REPLICA]: {
        totalShards: 1, // Single read replica for MVP
        shardType: ShardType.READ_REPLICA,
        connectionStrings: [
          process.env.READ_REPLICA_0_CONNECTION ||
            'postgresql://localhost:5432/therev_read_replica',
        ],
        healthCheckInterval: 30000,
        maxRetries: 3,
        timeout: 5000,
      },
    };
  }

  /**
   * Log routing statistics for monitoring
   */
  static logRoutingStatistics(router: ModuloShardRouter): void {
    const stats = router.getRoutingStatistics();
    console.log('ModuloShardRouter Statistics:', {
      totalRoutes: stats.totalRoutes,
      routesByEntityType: stats.routesByEntityType,
      averageRoutingTime: stats.averageRoutingTime,
      errorRate: stats.errorRate,
      timestamp: new Date().toISOString(),
    });
  }
}
