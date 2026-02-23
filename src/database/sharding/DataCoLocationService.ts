/**
 * Data Co-location Service
 * Ensures user content is stored on the same shard as the user
 * to minimize cross-shard queries for feed aggregation.
 */

import {
  IShardRouter,
  ShardEntityType,
  ShardRouteResult,
  ShardType,
} from './IShardRouter';

export interface CoLocationConfig {
  enableContentColocation: boolean;
  enableCrossShardFallback: boolean;
  cacheUserShardMapping: boolean;
  cacheTtlMs: number;
  cacheCleanupIntervalMs: number;
}

export interface ContentShardResult extends ShardRouteResult {
  ownerUserId: string;
  colocatedWithUser: boolean;
  routingStrategy: 'direct' | 'derived' | 'fallback';
}

interface CacheEntry {
  shardId: number;
  timestamp: number;
}

export class DataCoLocationService {
  private shardRouter: IShardRouter;
  private config: CoLocationConfig;
  private userShardCache: Map<string, CacheEntry> = new Map();
  private reverseIndex: Map<number, Set<string>> = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;
  private isShuttingDown = false;

  constructor(shardRouter: IShardRouter, config?: Partial<CoLocationConfig>) {
    this.shardRouter = shardRouter;
    this.config = {
      enableContentColocation: true,
      enableCrossShardFallback: true,
      cacheUserShardMapping: true,
      cacheTtlMs: 300000,
      cacheCleanupIntervalMs: 60000,
      ...config,
    };
  }

  async initialize(): Promise<void> {
    if (
      this.config.cacheUserShardMapping &&
      this.config.cacheCleanupIntervalMs > 0
    ) {
      this.startCacheCleanup();
    }
  }

  async shutdown(): Promise<void> {
    this.isShuttingDown = true;
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  private startCacheCleanup(): void {
    this.cleanupInterval = setInterval(() => {
      this.sweepExpiredEntries();
    }, this.config.cacheCleanupIntervalMs);

    this.cleanupInterval.unref();
  }

  private sweepExpiredEntries(): void {
    const now = Date.now();
    let expiredCount = 0;

    for (const [userId, entry] of this.userShardCache.entries()) {
      if (now - entry.timestamp > this.config.cacheTtlMs) {
        const oldShardId = entry.shardId;
        this.userShardCache.delete(userId);
        this.reverseIndex.get(oldShardId)?.delete(userId);
        expiredCount++;
      }
    }

    for (const [shardId, userSet] of this.reverseIndex.entries()) {
      if (userSet.size === 0) {
        this.reverseIndex.delete(shardId);
      }
    }

    if (expiredCount > 0) {
      console.debug(
        `[DataCoLocation] Swept ${expiredCount} expired cache entries`
      );
    }
  }

  async getShardForUserContent(
    ownerUserId: string,
    contentId?: string
  ): Promise<ContentShardResult> {
    if (!this.config.enableContentColocation) {
      const result = await this.shardRouter.routeToShard(
        ShardEntityType.CONTENT,
        contentId || ownerUserId
      );

      return {
        ...result,
        ownerUserId,
        colocatedWithUser: false,
        routingStrategy: 'fallback',
      };
    }

    const shardId = await this.getShardIdForUser(ownerUserId);

    const shardInfo = await this.shardRouter.getShardConnection(
      shardId,
      ShardType.CONTENT
    );

    return {
      shardId,
      shardInfo,
      entityType: ShardEntityType.CONTENT,
      entityKey: contentId || ownerUserId,
      ownerUserId,
      colocatedWithUser: true,
      routingStrategy: 'direct',
    };
  }

  async getShardIdForUser(userId: string): Promise<number> {
    if (this.config.cacheUserShardMapping) {
      const cached = this.userShardCache.get(userId);
      if (cached && Date.now() - cached.timestamp < this.config.cacheTtlMs) {
        return cached.shardId;
      }
    }

    const result = await this.shardRouter.routeToShard(
      ShardEntityType.USER,
      userId
    );

    if (this.config.cacheUserShardMapping) {
      const existingCache = this.userShardCache.get(userId);
      if (existingCache && existingCache.shardId !== result.shardId) {
        this.reverseIndex.get(existingCache.shardId)?.delete(userId);
      }

      this.userShardCache.set(userId, {
        shardId: result.shardId,
        timestamp: Date.now(),
      });

      if (!this.reverseIndex.has(result.shardId)) {
        this.reverseIndex.set(result.shardId, new Set());
      }
      this.reverseIndex.get(result.shardId)!.add(userId);
    }

    return result.shardId;
  }

  async getShardsForUserIds(userIds: string[]): Promise<Map<string, number>> {
    const results = new Map<string, number>();

    const uncachedIds = userIds.filter((id) => {
      const cached = this.userShardCache.get(id);
      if (cached && Date.now() - cached.timestamp < this.config.cacheTtlMs) {
        results.set(id, cached.shardId);
        return false;
      }
      return true;
    });

    if (uncachedIds.length > 0) {
      const shardPromises = uncachedIds.map(async (userId) => {
        const shardId = await this.getShardIdForUser(userId);
        return { userId, shardId };
      });

      const shardResults = await Promise.all(shardPromises);
      for (const { userId, shardId } of shardResults) {
        results.set(userId, shardId);
      }
    }

    return results;
  }

  async groupUserIdsByShard(userIds: string[]): Promise<Map<number, string[]>> {
    const shardToUsers = new Map<number, string[]>();
    const shardMap = await this.getShardsForUserIds(userIds);

    for (const [userId, shardId] of shardMap) {
      if (!shardToUsers.has(shardId)) {
        shardToUsers.set(shardId, []);
      }
      shardToUsers.get(shardId)!.push(userId);
    }

    return shardToUsers;
  }

  async getCoLocatedShardsForFeed(
    userId: string,
    followingIds: string[]
  ): Promise<number[]> {
    const allUserIds = [userId, ...followingIds];
    const shardMap = await this.getShardsForUserIds(allUserIds);

    const shards = new Set<number>();
    for (const uid of allUserIds) {
      const shardId = shardMap.get(uid);
      if (shardId !== undefined) {
        shards.add(shardId);
      }
    }

    return Array.from(shards);
  }

  async getContentOwnersForShard(shardId: number): Promise<string[]> {
    const users = this.reverseIndex.get(shardId);
    return users ? Array.from(users) : [];
  }

  invalidateCache(userId?: string): void {
    if (userId) {
      const cached = this.userShardCache.get(userId);
      if (cached) {
        this.reverseIndex.get(cached.shardId)?.delete(userId);
      }
      this.userShardCache.delete(userId);
    } else {
      this.userShardCache.clear();
      this.reverseIndex.clear();
    }
  }

  getCacheStats(): {
    totalEntries: number;
    shardDistribution: Record<number, number>;
    oldestEntry: number | null;
    newestEntry: number | null;
  } {
    const timestamps: number[] = [];
    const shardCounts: Record<number, number> = {};

    for (const [userId, entry] of this.userShardCache.entries()) {
      timestamps.push(entry.timestamp);
      shardCounts[entry.shardId] = (shardCounts[entry.shardId] || 0) + 1;
    }

    return {
      totalEntries: this.userShardCache.size,
      shardDistribution: shardCounts,
      oldestEntry: timestamps.length > 0 ? Math.min(...timestamps) : null,
      newestEntry: timestamps.length > 0 ? Math.max(...timestamps) : null,
    };
  }

  getConfig(): CoLocationConfig {
    return { ...this.config };
  }

  updateConfig(config: Partial<CoLocationConfig>): void {
    const needsRestartCleanup =
      config.cacheCleanupIntervalMs !== undefined &&
      config.cacheCleanupIntervalMs !== this.config.cacheCleanupIntervalMs &&
      this.cleanupInterval !== null;

    this.config = { ...this.config, ...config };

    if (needsRestartCleanup) {
      if (this.cleanupInterval) {
        clearInterval(this.cleanupInterval);
      }
      if (
        this.config.cacheUserShardMapping &&
        this.config.cacheCleanupIntervalMs > 0
      ) {
        this.startCacheCleanup();
      }
    }
  }
}

export function createDataCoLocationService(
  shardRouter: IShardRouter,
  config?: Partial<CoLocationConfig>
): DataCoLocationService {
  return new DataCoLocationService(shardRouter, config);
}
