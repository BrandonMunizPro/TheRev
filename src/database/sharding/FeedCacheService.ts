/**
 * Feed Cache Service
 * Redis based smart caching layer for feed aggregation.
 * Provides distributed caching across multiple service instances.
 */

import {
  RedisCacheManager,
  CacheInvalidationStrategy,
  CacheConfig,
} from '../../cache/redis/RedisCacheManager';
import { FeedResult, FeedQueryOptions } from './FeedService';

export interface FeedCacheConfig {
  redisCacheName: string;
  defaultTtlSeconds: number;
  maxEntries: number;
  enableWarmUp: boolean;
  prefetchUserIds: string[];
  invalidationEnabled: boolean;
  cacheKeyPrefix: string;
}

export interface FeedCacheStats {
  hits: number;
  misses: number;
  sets: number;
  invalidations: number;
  hitRate: number;
}

export class FeedCacheService {
  private cacheManager: RedisCacheManager;
  private config: FeedCacheConfig;
  private localStats: FeedCacheStats = {
    hits: 0,
    misses: 0,
    sets: 0,
    invalidations: 0,
    hitRate: 0,
  };

  constructor(
    cacheManager: RedisCacheManager,
    config?: Partial<FeedCacheConfig>
  ) {
    this.cacheManager = cacheManager;
    this.config = {
      redisCacheName: 'feed',
      defaultTtlSeconds: 30,
      maxEntries: 10000,
      enableWarmUp: false,
      prefetchUserIds: [],
      invalidationEnabled: true,
      cacheKeyPrefix: 'feed:',
      ...config,
    };
  }

  async initialize(): Promise<void> {
    const cacheConfig: CacheConfig = {
      name: this.config.redisCacheName,
      maxSize: this.config.maxEntries,
      defaultTTL: this.config.defaultTtlSeconds,
      invalidationStrategy: CacheInvalidationStrategy.TTL,
      compressionEnabled: false,
      serializationFormat: 'json',
      monitoringEnabled: true,
    };

    await this.cacheManager.initializeCache(cacheConfig);
  }

  async shutdown(): Promise<void> {
    await this.cacheManager.shutdown();
  }

  private buildCacheKey(
    userId: string,
    followingIds: string[],
    options: FeedQueryOptions
  ): string {
    const followingKey = [...followingIds].sort().join(',');
    const optionsKey = options.cursor
      ? `cursor:${options.cursor}`
      : `limit:${options.limit || 50}`;
    return `${this.config.cacheKeyPrefix}${userId}:${followingKey}:${optionsKey}`;
  }

  async getFeed(
    userId: string,
    followingIds: string[],
    options: FeedQueryOptions
  ): Promise<FeedResult | null> {
    if (!this.config.invalidationEnabled) {
      return null;
    }

    const cacheKey = this.buildCacheKey(userId, followingIds, options);

    try {
      const cached = await this.cacheManager.get<FeedResult>(
        this.config.redisCacheName,
        cacheKey
      );

      if (cached) {
        this.localStats.hits++;
        this.updateHitRate();
        return cached;
      }

      this.localStats.misses++;
      this.updateHitRate();
      return null;
    } catch (error) {
      console.error('[FeedCacheService] Cache get error:', error);
      this.localStats.misses++;
      this.updateHitRate();
      return null;
    }
  }

  async setFeed(
    userId: string,
    followingIds: string[],
    options: FeedQueryOptions,
    result: FeedResult,
    ttlSeconds?: number
  ): Promise<void> {
    if (!this.config.invalidationEnabled) {
      return;
    }

    const cacheKey = this.buildCacheKey(userId, followingIds, options);
    const ttl = ttlSeconds || this.config.defaultTtlSeconds;

    try {
      await this.cacheManager.set(
        this.config.redisCacheName,
        cacheKey,
        result,
        ttl
      );
      this.localStats.sets++;
    } catch (error) {
      console.error('[FeedCacheService] Cache set error:', error);
    }
  }

  async invalidateUserFeed(userId: string): Promise<number> {
    if (!this.config.invalidationEnabled) {
      return 0;
    }

    try {
      const pattern = `${this.config.cacheKeyPrefix}${userId}:*`;
      const count = await this.cacheManager.invalidateByPattern(
        this.config.redisCacheName,
        pattern
      );
      this.localStats.invalidations += count;
      return count;
    } catch (error) {
      console.error('[FeedCacheService] Cache invalidation error:', error);
      return 0;
    }
  }

  async invalidateUserFeedByFollowing(
    userId: string,
    followingIds: string[]
  ): Promise<number> {
    if (!this.config.invalidationEnabled) {
      return 0;
    }

    let totalInvalidated = 0;

    for (const followingId of followingIds) {
      const pattern = `*:${followingId}:*`;
      try {
        const count = await this.cacheManager.invalidateByPattern(
          this.config.redisCacheName,
          pattern
        );
        totalInvalidated += count;
      } catch (error) {
        console.error('[FeedCacheService] Cache invalidation error:', error);
      }
    }

    this.localStats.invalidations += totalInvalidated;
    return totalInvalidated;
  }

  async invalidateAllUserFeeds(userId: string): Promise<number> {
    if (!this.config.invalidationEnabled) {
      return 0;
    }

    try {
      const pattern = `*${userId}*`;
      const count = await this.cacheManager.invalidateByPattern(
        this.config.redisCacheName,
        pattern
      );
      this.localStats.invalidations += count;
      return count;
    } catch (error) {
      console.error('[FeedCacheService] Cache invalidation error:', error);
      return 0;
    }
  }

  async clearCache(): Promise<void> {
    try {
      await this.cacheManager.clear(this.config.redisCacheName);
      this.localStats = {
        hits: 0,
        misses: 0,
        sets: 0,
        invalidations: 0,
        hitRate: 0,
      };
    } catch (error) {
      console.error('[FeedCacheService] Cache clear error:', error);
    }
  }

  getStats(): FeedCacheStats {
    return { ...this.localStats };
  }

  getRedisStats() {
    return this.cacheManager.getStatistics(this.config.redisCacheName);
  }

  private updateHitRate(): void {
    const total = this.localStats.hits + this.localStats.misses;
    this.localStats.hitRate =
      total > 0 ? (this.localStats.hits / total) * 100 : 0;
  }

  getConfig(): FeedCacheConfig {
    return { ...this.config };
  }

  updateConfig(config: Partial<FeedCacheConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

export function createFeedCacheService(
  cacheManager: RedisCacheManager,
  config?: Partial<FeedCacheConfig>
): FeedCacheService {
  return new FeedCacheService(cacheManager, config);
}
