/**
 * Redis Cluster Configuration and Management
 * Provides Redis cluster support for AI task queues and caching layer
 * Supports high availability, automatic failover, and comprehensive monitoring
 */

import { v4 as uuidv4 } from 'uuid';

export interface RedisClusterConfig {
  nodes: RedisNode[];
  options: RedisClusterOptions;
  monitoring: RedisMonitoringConfig;
}

export interface RedisNode {
  host: string;
  port: number;
  password?: string;
  db?: number;
  maxRetriesPerRequest?: number;
  lazyConnect?: boolean;
  keepAlive?: number;
  family?: 4 | 6;
}

export interface RedisClusterOptions {
  enableReadyCheck?: boolean;
  redisOptions?: any;
  maxRedirections?: number;
  retryDelayOnFailover?: number;
  retryDelayOnClusterDown?: number;
  slotsRefreshTimeout?: number;
  slotsRefreshInterval?: number;
}

export interface RedisMonitoringConfig {
  enabled: boolean;
  healthCheckInterval: number;
  metricsCollectionInterval: number;
  alertThresholds: RedisAlertThresholds;
}

export interface RedisAlertThresholds {
  memoryUsage: number; // percentage
  cpuUsage: number; // percentage
  connectionCount: number;
  queueDepth: number;
  responseTime: number; // milliseconds
  errorRate: number; // percentage
}

export interface RedisHealthMetrics {
  nodeId: string;
  isHealthy: boolean;
  lastHealthCheck: Date;
  responseTime: number;
  memoryUsage: number;
  connectionCount: number;
  errorCount: number;
  uptime: number;
}

export interface RedisQueueMetrics {
  queueName: string;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  averageProcessingTime: number;
  throughput: number; // tasks per second
}

export interface RedisCacheMetrics {
  cacheName: string;
  hitRate: number; // percentage
  missRate: number; // percentage
  keyCount: number;
  memoryUsage: number;
  evictionCount: number;
}

/**
 * Redis Node Status
 */
export enum RedisNodeStatus {
  HEALTHY = 'healthy',
  UNHEALTHY = 'unhealthy',
  DISCONNECTED = 'disconnected',
  FAILING_OVER = 'failing_over',
  RECOVERING = 'recovering',
}

/**
 * Redis Queue Priority Levels
 */
export enum RedisQueuePriority {
  CRITICAL = 0, // User-interactive AI tasks
  HIGH = 1, // Important AI processing
  NORMAL = 2, // Standard AI tasks
  LOW = 3, // Background processing
  BULK = 4, // Bulk operations
}

/**
 * AI Task Queue Configuration
 */
export interface AITaskQueueConfig {
  name: string;
  maxRetries: number;
  retryDelay: number;
  deadLetterQueue?: string;
  visibilityTimeout: number;
  messageRetention: number;
  maxConcurrency: number;
}

/**
 * Cache invalidation strategy
 */
export enum CacheInvalidationStrategy {
  TTL = 'ttl', // Time-based expiration
  LRU = 'lru', // Least Recently Used
  LFU = 'lfu', // Least Frequently Used
  MANUAL = 'manual', // Explicit invalidation
  WRITE_THROUGH = 'write-through', // Sync with database
}

/**
 * Cache configuration
 */
export interface CacheConfig {
  name: string;
  maxSize: number; // Maximum number of entries
  defaultTTL: number; // Default TTL in seconds
  invalidationStrategy: CacheInvalidationStrategy;
  compressionEnabled: boolean;
  serializationFormat: 'json' | 'binary';
  monitoringEnabled: boolean;
}
