/**
 * Redis Cache Manager Implementation
 * Provides caching layer for user sessions, AI results, and shard routing
 * Supports TTL, cache invalidation, and performance monitoring
 */

import { EventEmitter } from 'events';
import { RedisCacheMetrics, RedisHealthMetrics } from './RedisTypes';
import { v4 as uuidv4 } from 'uuid';
import {
  SystemError,
  ValidationError,
  DATABASE_ERROR,
} from '../../errors/AppError';

/**
 * Cache entry with metadata
 */
export interface CacheEntry<T = any> {
  key: string;
  value: T;
  ttl: number; // TTL in seconds
  createdAt: Date;
  accessCount: number;
  lastAccessed: Date;
  version?: string;
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

export interface CacheConfig {
  name: string;
  maxSize: number; // Maximum number of entries
  defaultTTL: number; // Default TTL in seconds
  invalidationStrategy: CacheInvalidationStrategy;
  compressionEnabled: boolean;
  serializationFormat: 'json' | 'binary';
  monitoringEnabled: boolean;
}

export interface CacheStatistics {
  name: string;
  hits: number;
  misses: number;
  sets: number;
  deletes: number;
  evictions: number;
  hitRate: number;
  missRate: number;
  currentSize: number;
  memoryUsage: number;
}

export class RedisCacheManager extends EventEmitter {
  private redis: any;
  private caches: Map<string, CacheConfig> = new Map();
  private localCache: Map<string, CacheEntry> = new Map();
  private metrics: Map<string, CacheStatistics> = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(redis: any) {
    super();
    this.redis = redis;
  }

  /**
   * Initialize a cache with configuration
   */
  async initializeCache(config: CacheConfig): Promise<void> {
    try {
      this.validateCacheConfig(config);

      // Initialize cache statistics
      this.initializeStatistics(config.name);

      // Store cache configuration
      this.caches.set(config.name, config);

      // Start cleanup interval for TTL-based caches
      if (config.invalidationStrategy === CacheInvalidationStrategy.TTL) {
        this.startCleanupInterval(config.name);
      }

      console.log(`Initialized cache: ${config.name}`);
      this.emit('cache:initialized', { config });
    } catch (error: unknown) {
      throw new SystemError(
        `Failed to initialize cache ${config.name}: ${error instanceof Error ? error.message : String(error)}`,
        DATABASE_ERROR,
        {
          field: 'cacheName',
          value: config.name,
          action: 'initializeCache',
          originalError: error instanceof Error ? error.message : String(error),
        }
      );
    }
  }

  /**
   * Get value from cache
   */
  async get<T = any>(cacheName: string, key: string): Promise<T | null> {
    try {
      this.validateCacheExists(cacheName);

      const config = this.caches.get(cacheName)!;
      const cacheKey = this.buildCacheKey(cacheName, key);

      // Try local cache first (for performance)
      const localEntry = this.localCache.get(cacheKey);
      if (localEntry && !this.isExpired(localEntry)) {
        this.updateAccessInfo(localEntry);
        this.updateMetrics(cacheName, 'hit');
        return localEntry.value;
      }

      // Try Redis cache
      const redisValue = await this.redis.get(cacheKey);
      if (redisValue) {
        const entry: CacheEntry<T> = JSON.parse(redisValue);

        // Update local cache
        this.localCache.set(cacheKey, entry);
        this.updateAccessInfo(entry);
        this.updateMetrics(cacheName, 'hit');

        return entry.value;
      }

      // Cache miss
      this.updateMetrics(cacheName, 'miss');
      return null;
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(
        `Cache get failed for ${cacheName}:${key}:`,
        errorMessage
      );
      this.updateMetrics(cacheName, 'miss');
      return null;
    }
  }

  /**
   * Set value in cache
   */
  async set<T = any>(
    cacheName: string,
    key: string,
    value: T,
    ttl?: number
  ): Promise<void> {
    try {
      this.validateCacheExists(cacheName);

      const config = this.caches.get(cacheName)!;
      const cacheKey = this.buildCacheKey(cacheName, key);
      const effectiveTTL = ttl || config.defaultTTL;

      const entry: CacheEntry<T> = {
        key: cacheKey,
        value,
        ttl: effectiveTTL,
        createdAt: new Date(),
        accessCount: 1,
        lastAccessed: new Date(),
        version: uuidv4(),
      };

      // Set in Redis with TTL
      const serializedEntry = JSON.stringify(entry);
      await this.redis.setex(cacheKey, effectiveTTL, serializedEntry);

      // Update local cache
      this.localCache.set(cacheKey, entry);

      this.updateMetrics(cacheName, 'set');

      console.debug(
        `Cache set: ${cacheName}:${key} (TTL: ${effectiveTTL}s)`
      );
      this.emit('cache:set', { cacheName, key, ttl: effectiveTTL });
    } catch (error: unknown) {
      throw new SystemError(
        `Failed to set cache ${cacheName}:${key}: ${error instanceof Error ? error.message : String(error)}`,
        DATABASE_ERROR,
        {
          field: 'cacheKey',
          value: key,
          action: 'setCache',
          originalError: error instanceof Error ? error.message : String(error),
        }
      );
    }
  }

  /**
   * Delete value from cache
   */
  async delete(cacheName: string, key: string): Promise<boolean> {
    try {
      this.validateCacheExists(cacheName);

      const cacheKey = this.buildCacheKey(cacheName, key);

      // Remove from Redis
      const redisResult = await this.redis.del(cacheKey);

      // Remove from local cache
      this.localCache.delete(cacheKey);

      this.updateMetrics(cacheName, 'delete');

      console.debug(`Cache delete: ${cacheName}:${key}`);
      this.emit('cache:deleted', { cacheName, key });

      return redisResult > 0;
    } catch (error: unknown) {
      throw new SystemError(
        `Failed to delete cache ${cacheName}:${key}: ${error instanceof Error ? error.message : String(error)}`,
        DATABASE_ERROR,
        {
          field: 'cacheKey',
          value: key,
          action: 'deleteCache',
          originalError: error instanceof Error ? error.message : String(error),
        }
      );
    }
  }

  /**
   * Clear entire cache
   */
  async clear(cacheName: string): Promise<void> {
    try {
      this.validateCacheExists(cacheName);

      const pattern = this.buildCacheKey(cacheName, '*');
      const keys = await this.redis.keys(pattern);

      if (keys.length > 0) {
        await this.redis.del(...keys);
      }

      // Clear local cache for this cache
      const keysToDelete = Array.from(this.localCache.keys()).filter((key) =>
        key.startsWith(`${cacheName}:`)
      );

      for (const key of keysToDelete) {
        this.localCache.delete(key);
      }

      // Reset metrics
      this.initializeStatistics(cacheName);

      console.log(`Cache cleared: ${cacheName} (${keys.length} keys)`);
      this.emit('cache:cleared', { cacheName, keyCount: keys.length });
    } catch (error: unknown) {
      throw new SystemError(
        `Failed to clear cache ${cacheName}: ${error instanceof Error ? error.message : String(error)}`,
        DATABASE_ERROR,
        {
          field: 'cacheName',
          value: cacheName,
          action: 'clearCache',
          originalError: error instanceof Error ? error.message : String(error),
        }
      );
    }
  }

  /**
   * Invalidate cache entries by pattern
   */
  async invalidateByPattern(
    cacheName: string,
    pattern: string
  ): Promise<number> {
    try {
      this.validateCacheExists(cacheName);

      const fullPattern = this.buildCacheKey(cacheName, pattern);
      const keys = await this.redis.keys(fullPattern);

      if (keys.length > 0) {
        await this.redis.del(...keys);

        // Remove from local cache
        for (const key of keys) {
          this.localCache.delete(key);
        }

        // Update metrics
        this.updateMetrics(cacheName, 'delete');
      }

      console.log(
        `Cache invalidated: ${cacheName} pattern ${pattern} (${keys.length} keys)`
      );
      this.emit('cache:invalidated', {
        cacheName,
        pattern,
        keyCount: keys.length,
      });

      return keys.length;
    } catch (error: unknown) {
      throw new SystemError(
        `Failed to invalidate cache ${cacheName}: ${error instanceof Error ? error.message : String(error)}`,
        DATABASE_ERROR,
        {
          field: 'cacheName',
          value: cacheName,
          action: 'invalidateCache',
          originalError: error instanceof Error ? error.message : String(error),
        }
      );
    }
  }

  /**
   * Get cache statistics
   */
  getStatistics(cacheName: string): CacheStatistics | null {
    return this.metrics.get(cacheName) || null;
  }

  getAllStatistics(): Map<string, CacheStatistics> {
    return new Map(this.metrics);
  }

  /**
   * Warm up cache with initial data
   */
  async warmUp<T = any>(
    cacheName: string,
    data: Map<string, { value: T; ttl?: number }>
  ): Promise<void> {
    try {
      this.validateCacheExists(cacheName);

      const warmUpPromises = Array.from(data.entries(), async ([key, item]) => {
        await this.set(cacheName, key, item.value, item.ttl);
      });

      await Promise.allSettled(warmUpPromises);

      console.log(`🔥Cache warmed up: ${cacheName} (${data.size} entries)`);
      this.emit('cache:warmed-up', { cacheName, entryCount: data.size });
    } catch (error: unknown) {
      throw new SystemError(
        `Failed to warm up cache ${cacheName}: ${error instanceof Error ? error.message : String(error)}`,
        DATABASE_ERROR,
        {
          field: 'cacheName',
          value: cacheName,
          action: 'warmUpCache',
          originalError: error instanceof Error ? error.message : String(error),
        }
      );
    }
  }

  /**
   * Build cache key with namespace
   */
  private buildCacheKey(cacheName: string, key: string): string {
    return `${cacheName}:${key}`;
  }

  /**
   * Check if cache entry is expired
   */
  private isExpired(entry: CacheEntry): boolean {
    if (entry.ttl === 0) return false; // No expiration

    const age = (Date.now() - entry.createdAt.getTime()) / 1000;
    return age > entry.ttl;
  }

  /**
   * Update access information for cache entry
   */
  private updateAccessInfo(entry: CacheEntry): void {
    entry.accessCount++;
    entry.lastAccessed = new Date();
  }

  /**
   * Update cache metrics
   */
  private updateMetrics(
    cacheName: string,
    operation: 'hit' | 'miss' | 'set' | 'delete' | 'eviction'
  ): void {
    const stats = this.metrics.get(cacheName);
    if (!stats) return;

    switch (operation) {
      case 'hit':
        stats.hits++;
        break;
      case 'miss':
        stats.misses++;
        break;
      case 'set':
        stats.sets++;
        break;
      case 'delete':
        stats.deletes++;
        break;
      case 'eviction':
        stats.evictions++;
        break;
    }

    // Update rates
    const total = stats.hits + stats.misses;
    stats.hitRate = total > 0 ? (stats.hits / total) * 100 : 0;
    stats.missRate = total > 0 ? (stats.misses / total) * 100 : 0;
    stats.currentSize = this.localCache.size;
  }

  /**
   * Initialize statistics for a cache
   */
  private initializeStatistics(cacheName: string): void {
    this.metrics.set(cacheName, {
      name: cacheName,
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      evictions: 0,
      hitRate: 0,
      missRate: 0,
      currentSize: 0,
      memoryUsage: 0,
    });
  }

  /**
   * Start cleanup interval for expired entries
   */
  private startCleanupInterval(cacheName: string): void {
    const config = this.caches.get(cacheName);
    if (!config) return;

    // Check for expired entries every minute
    const interval = setInterval(async () => {
      await this.cleanupExpiredEntries(cacheName);
    }, 60000);

    // Store interval reference for cleanup
    this.cleanupInterval = interval;
  }

  /**
   * Clean up expired entries
   */
  private async cleanupExpiredEntries(cacheName: string): Promise<void> {
    try {
      const config = this.caches.get(cacheName);
      if (!config) return;

      const expiredKeys: string[] = [];

      for (const [key, entry] of this.localCache) {
        if (this.isExpired(entry)) {
          expiredKeys.push(key);
        }
      }

      // Remove expired entries from local cache
      for (const key of expiredKeys) {
        this.localCache.delete(key);
        this.updateMetrics(cacheName, 'eviction');
      }

      if (expiredKeys.length > 0) {
        console.debug(
          `Cleaned up ${expiredKeys.length} expired entries from ${cacheName}`
        );
      }
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(`Cleanup failed for ${cacheName}:`, errorMessage);
    }
  }

  /**
   * Validate cache configuration
   */
  private validateCacheConfig(config: CacheConfig): void {
    if (!config.name || config.name.trim().length === 0) {
      throw new ValidationError('Cache name is required', {
        field: 'name',
        value: config.name,
        action: 'validateCacheConfig',
      });
    }

    if (config.maxSize <= 0) {
      throw new ValidationError('Max size must be greater than 0', {
        field: 'maxSize',
        value: config.maxSize,
        action: 'validateCacheConfig',
      });
    }

    if (config.defaultTTL < 0) {
      throw new ValidationError('Default TTL must be non-negative', {
        field: 'defaultTTL',
        value: config.defaultTTL,
        action: 'validateCacheConfig',
      });
    }
  }

  /**
   * Validate cache exists
   */
  private validateCacheExists(cacheName: string): void {
    if (!this.caches.has(cacheName)) {
      throw new ValidationError(`Cache not found: ${cacheName}`, {
        field: 'cacheName',
        value: cacheName,
        action: 'validateCacheExists',
      });
    }
  }

  /**
   * Gracefully shutdown cache manager
   */
  async shutdown(): Promise<void> {
    console.log('Shutting down Redis cache manager...');

    // Clear cleanup interval
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    // Clear local caches
    this.localCache.clear();
    console.log('Redis cache manager shutdown complete');
  }
}
