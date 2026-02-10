/**
 * Redis Integration Factory and Configuration
 * Factory for creating and configuring Redis components
 * Environment based configuration and setup utilities
 */

import { RedisClusterManager } from './RedisClusterManager';
import { AITaskQueueManager } from './AITaskQueueManager';
import { RedisCacheManager } from './RedisCacheManager';
import {
  RedisClusterConfig,
  RedisNode,
  RedisMonitoringConfig,
  RedisAlertThresholds,
  AITaskQueueConfig,
  CacheConfig,
  CacheInvalidationStrategy,
} from './RedisTypes';
import {
  ValidationError,
  INVALID_SHARD_CONFIGURATION,
} from '../../errors/AppError';

export class RedisIntegrationFactory {
  /**
   * Create Redis cluster from environment variables
   */
  static createClusterFromEnv(): RedisClusterManager {
    const config = this.getClusterConfigFromEnv();
    return new RedisClusterManager(config);
  }

  /**
   * Create AI task queue manager with default queues
   */
  static createTaskQueueManager(redis: any): AITaskQueueManager {
    const manager = new AITaskQueueManager(redis);
    // Register default queues with environment based configuration
    const defaultQueues = this.getDefaultQueueConfigs();

    return manager;
  }

  /**
   * Create cache manager with default caches
   */
  static createCacheManager(redis: any): RedisCacheManager {
    const manager = new RedisCacheManager(redis);

    // Initialize default caches with environment-based configuration
    const defaultCaches = this.getDefaultCacheConfigs();

    return manager;
  }

  /**
   * Create complete Redis integration setup
   */
  static async createRedisIntegration(): Promise<{
    cluster: RedisClusterManager;
    taskQueue: AITaskQueueManager;
    cache: RedisCacheManager;
  }> {
    const cluster = this.createClusterFromEnv();
    await cluster.initialize();

    // Use real Redis cluster
    const redis = cluster.getCluster();

    const taskQueue = this.createTaskQueueManager(redis);
    const cache = this.createCacheManager(redis);

    return {
      cluster,
      taskQueue,
      cache,
    };
  }

  /**
   * Get cluster configuration from environment
   */
  static getClusterConfigFromEnv(): RedisClusterConfig {
    const nodes = this.getRedisNodesFromEnv();

    if (nodes.length === 0) {
      nodes.push({
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        password: process.env.REDIS_PASSWORD,
        db: parseInt(process.env.REDIS_DB || '0'),
      });
    }

    return {
      nodes,
      options: {
        enableReadyCheck: process.env.REDIS_ENABLE_READY_CHECK !== 'false',
        maxRedirections: parseInt(process.env.REDIS_MAX_REDIRECTIONS || '16'),
        retryDelayOnFailover: parseInt(
          process.env.REDIS_RETRY_DELAY_FAILOVER || '100'
        ),
        retryDelayOnClusterDown: parseInt(
          process.env.REDIS_RETRY_DELAY_DOWN || '300'
        ),
        slotsRefreshTimeout: parseInt(
          process.env.REDIS_SLOTS_REFRESH_TIMEOUT || '1000'
        ),
        slotsRefreshInterval: parseInt(
          process.env.REDIS_SLOTS_REFRESH_INTERVAL || '5000'
        ),
      },
      monitoring: {
        enabled: process.env.REDIS_MONITORING_ENABLED !== 'false',
        healthCheckInterval: parseInt(
          process.env.REDIS_HEALTH_CHECK_INTERVAL || '30000'
        ),
        metricsCollectionInterval: parseInt(
          process.env.REDIS_METRICS_INTERVAL || '60000'
        ),
        alertThresholds: {
          memoryUsage: parseFloat(process.env.REDIS_ALERT_MEMORY_USAGE || '80'),
          cpuUsage: parseFloat(process.env.REDIS_ALERT_CPU_USAGE || '80'),
          connectionCount: parseInt(
            process.env.REDIS_ALERT_CONNECTIONS || '1000'
          ),
          queueDepth: parseInt(process.env.REDIS_ALERT_QUEUE_DEPTH || '1000'),
          responseTime: parseInt(
            process.env.REDIS_ALERT_RESPONSE_TIME || '1000'
          ),
          errorRate: parseFloat(process.env.REDIS_ALERT_ERROR_RATE || '5'),
        },
      },
    };
  }

  /**
   * Get Redis nodes from environment
   */
  static getRedisNodesFromEnv(): RedisNode[] {
    const nodes: RedisNode[] = [];
    let nodeIndex = 0;

    // Look for REDIS_NODE_0_HOST, REDIS_NODE_0_PORT, etc.
    while (true) {
      const host = process.env[`REDIS_NODE_${nodeIndex}_HOST`];
      const port = process.env[`REDIS_NODE_${nodeIndex}_PORT`];

      if (!host && !port) {
        break;
      }

      nodes.push({
        host: host || process.env.REDIS_HOST || 'localhost',
        port: parseInt(port || process.env.REDIS_PORT || '6379'),
        password:
          process.env[`REDIS_NODE_${nodeIndex}_PASSWORD`] ||
          process.env.REDIS_PASSWORD,
        db: parseInt(
          process.env[`REDIS_NODE_${nodeIndex}_DB`] ||
            process.env.REDIS_DB ||
            '0'
        ),
        maxRetriesPerRequest: parseInt(
          process.env[`REDIS_NODE_${nodeIndex}_MAX_RETRIES`] || '3'
        ),
        lazyConnect:
          process.env[`REDIS_NODE_${nodeIndex}_LAZY_CONNECT`] !== 'false',
        keepAlive: parseInt(
          process.env[`REDIS_NODE_${nodeIndex}_KEEP_ALIVE`] || '30000'
        ),
        family: 4 as 4 | 6,
      });

      nodeIndex++;
    }

    return nodes;
  }

  /**
   * Get default queue configurations
   */
  static getDefaultQueueConfigs(): AITaskQueueConfig[] {
    return [
      {
        name: 'ai-tasks-critical',
        maxRetries: parseInt(process.env.AI_TASK_CRITICAL_MAX_RETRIES || '5'),
        retryDelay: parseInt(
          process.env.AI_TASK_CRITICAL_RETRY_DELAY || '1000'
        ),
        visibilityTimeout: parseInt(
          process.env.AI_TASK_CRITICAL_TIMEOUT || '60000'
        ), // 1 minute
        messageRetention: parseInt(
          process.env.AI_TASK_CRITICAL_RETENTION || '864000'
        ), // 24 hours
        maxConcurrency: parseInt(
          process.env.AI_TASK_CRITICAL_CONCURRENCY || '10'
        ),
      },
      {
        name: 'ai-tasks-high',
        maxRetries: parseInt(process.env.AI_TASK_HIGH_MAX_RETRIES || '3'),
        retryDelay: parseInt(process.env.AI_TASK_HIGH_RETRY_DELAY || '5000'),
        visibilityTimeout: parseInt(
          process.env.AI_TASK_HIGH_TIMEOUT || '300000'
        ), // 5 minutes
        messageRetention: parseInt(
          process.env.AI_TASK_HIGH_RETENTION || '432000'
        ), // 12 hours
        maxConcurrency: parseInt(process.env.AI_TASK_HIGH_CONCURRENCY || '5'),
      },
      {
        name: 'ai-tasks-normal',
        maxRetries: parseInt(process.env.AI_TASK_NORMAL_MAX_RETRIES || '2'),
        retryDelay: parseInt(process.env.AI_TASK_NORMAL_RETRY_DELAY || '10000'),
        visibilityTimeout: parseInt(
          process.env.AI_TASK_NORMAL_TIMEOUT || '600000'
        ), // 10 minutes
        messageRetention: parseInt(
          process.env.AI_TASK_NORMAL_RETENTION || '216000'
        ), // 6 hours
        maxConcurrency: parseInt(process.env.AI_TASK_NORMAL_CONCURRENCY || '3'),
      },
      {
        name: 'ai-tasks-low',
        maxRetries: parseInt(process.env.AI_TASK_LOW_MAX_RETRIES || '1'),
        retryDelay: parseInt(process.env.AI_TASK_LOW_RETRY_DELAY || '30000'),
        visibilityTimeout: parseInt(
          process.env.AI_TASK_LOW_TIMEOUT || '1800000'
        ), // 30 minutes
        messageRetention: parseInt(
          process.env.AI_TASK_LOW_RETENTION || '3600000'
        ), // 1 hour
        maxConcurrency: parseInt(process.env.AI_TASK_LOW_CONCURRENCY || '1'),
      },
      {
        name: 'ai-tasks-bulk',
        maxRetries: parseInt(process.env.AI_TASK_BULK_MAX_RETRIES || '0'),
        retryDelay: parseInt(process.env.AI_TASK_BULK_RETRY_DELAY || '60000'),
        visibilityTimeout: parseInt(
          process.env.AI_TASK_BULK_TIMEOUT || '3600000'
        ), // 1 hour
        messageRetention: parseInt(
          process.env.AI_TASK_BULK_RETENTION || '7200000'
        ), // 2 hours
        maxConcurrency: parseInt(process.env.AI_TASK_BULK_CONCURRENCY || '1'),
      },
    ];
  }

  /**
   * Get default cache configurations
   */
  static getDefaultCacheConfigs(): CacheConfig[] {
    return [
      {
        name: 'user-sessions',
        maxSize: parseInt(process.env.CACHE_USER_SESSIONS_MAX_SIZE || '10000'),
        defaultTTL: parseInt(process.env.CACHE_USER_SESSIONS_TTL || '7200'), // 2 hours
        invalidationStrategy: CacheInvalidationStrategy.TTL,
        compressionEnabled:
          process.env.CACHE_USER_SESSIONS_COMPRESSION !== 'false',
        serializationFormat: 'json',
        monitoringEnabled:
          process.env.CACHE_USER_SESSIONS_MONITORING !== 'false',
      },
      {
        name: 'ai-results',
        maxSize: parseInt(process.env.CACHE_AI_RESULTS_MAX_SIZE || '5000'),
        defaultTTL: parseInt(process.env.CACHE_AI_RESULTS_TTL || '3600'), // 1 hour
        invalidationStrategy: CacheInvalidationStrategy.TTL,
        compressionEnabled:
          process.env.CACHE_AI_RESULTS_COMPRESSION !== 'false',
        serializationFormat: 'json',
        monitoringEnabled: process.env.CACHE_AI_RESULTS_MONITORING !== 'false',
      },
      {
        name: 'shard-routing',
        maxSize: parseInt(process.env.CACHE_SHARD_ROUTING_MAX_SIZE || '1000'),
        defaultTTL: parseInt(process.env.CACHE_SHARD_ROUTING_TTL || '1800'), // 30 minutes
        invalidationStrategy: CacheInvalidationStrategy.TTL,
        compressionEnabled:
          process.env.CACHE_SHARD_ROUTING_COMPRESSION !== 'false',
        serializationFormat: 'json',
        monitoringEnabled:
          process.env.CACHE_SHARD_ROUTING_MONITORING !== 'false',
      },
      {
        name: 'content-discovery',
        maxSize: parseInt(
          process.env.CACHE_CONTENT_DISCOVERY_MAX_SIZE || '20000'
        ),
        defaultTTL: parseInt(process.env.CACHE_CONTENT_DISCOVERY_TTL || '1800'), // 30 minutes
        invalidationStrategy: CacheInvalidationStrategy.LRU,
        compressionEnabled:
          process.env.CACHE_CONTENT_DISCOVERY_COMPRESSION === 'true',
        serializationFormat: 'json',
        monitoringEnabled:
          process.env.CACHE_CONTENT_DISCOVERY_MONITORING !== 'false',
      },
      {
        name: 'user-profiles',
        maxSize: parseInt(process.env.CACHE_USER_PROFILES_MAX_SIZE || '15000'),
        defaultTTL: parseInt(process.env.CACHE_USER_PROFILES_TTL || '3600'), // 1 hour
        invalidationStrategy: CacheInvalidationStrategy.WRITE_THROUGH,
        compressionEnabled:
          process.env.CACHE_USER_PROFILES_COMPRESSION !== 'false',
        serializationFormat: 'json',
        monitoringEnabled:
          process.env.CACHE_USER_PROFILES_MONITORING !== 'false',
      },
    ];
  }

  /**
   * Validate Redis integration configuration
   */
  static validateConfiguration(): void {
    // Validate cluster configuration
    const clusterConfig = this.getClusterConfigFromEnv();

    if (clusterConfig.nodes.length === 0) {
      throw new ValidationError('At least one Redis node must be configured', {
        field: 'nodes',
        value: 'empty',
      });
    }

    // Validate each node
    for (const node of clusterConfig.nodes) {
      if (!node.host || node.port < 1 || node.port > 65535) {
        throw new ValidationError(
          'Each Redis node must have valid host and port',
          { field: 'node', value: node }
        );
      }
    }

    // Validate queue configurations
    const queueConfigs = this.getDefaultQueueConfigs();
    for (const config of queueConfigs) {
      if (config.maxRetries < 0 || config.maxRetries > 10) {
        throw new ValidationError(
          'Queue max retries must be between 0 and 10',
          { field: 'maxRetries', value: config.maxRetries }
        );
      }

      if (config.visibilityTimeout < 1000) {
        throw new ValidationError(
          'Queue visibility timeout must be at least 1000ms',
          { field: 'visibilityTimeout', value: config.visibilityTimeout }
        );
      }
    }

    // Validate cache configurations
    const cacheConfigs = this.getDefaultCacheConfigs();
    for (const config of cacheConfigs) {
      if (config.maxSize <= 0) {
        throw new ValidationError('Cache max size must be greater than 0', {
          field: 'maxSize',
          value: config.maxSize,
        });
      }

      if (config.defaultTTL < 0) {
        throw new ValidationError('Cache default TTL must be non-negative', {
          field: 'defaultTTL',
          value: config.defaultTTL,
        });
      }
    }
  }

  /**
   * Get Redis connection string for a single node
   */
  static getConnectionString(node: RedisNode): string {
    const auth = node.password ? `:${node.password}@` : '';
    return `redis://${auth}${node.host}:${node.port}/${node.db || 0}`;
  }

  /**
   * Log Redis configuration for debugging
   */
  static logConfiguration(): void {
    const clusterConfig = this.getClusterConfigFromEnv();
    const queueConfigs = this.getDefaultQueueConfigs();
    const cacheConfigs = this.getDefaultCacheConfigs();

    console.log('Redis Configuration:');
    console.log(
      '  Cluster Nodes:',
      clusterConfig.nodes.map((node) => `${node.host}:${node.port}`)
    );
    console.log('  Health Monitoring:', clusterConfig.monitoring.enabled);
    console.log(
      '  Queues:',
      queueConfigs.map((config) => config.name)
    );
    console.log(
      '  Caches:',
      cacheConfigs.map((config) => config.name)
    );
  }
}
