/**
 * Feed Service
 * Aggregates feed content from multiple shards using async cross-shard queries.
 * Leverages DataCoLocationService to minimize cross-shard queries.
 */

import { DataCoLocationService } from './DataCoLocationService';
import { IShardRouter, ShardType } from './IShardRouter';

export interface FeedItem {
  id: string;
  authorId: string;
  contentType: 'post' | 'thread' | 'reply';
  content: string;
  createdAt: Date;
  updatedAt: Date;
  metadata?: Record<string, unknown>;
}

export interface FeedQueryOptions {
  limit?: number;
  cursor?: string;
  contentTypes?: Array<'post' | 'thread' | 'reply'>;
  since?: Date;
  until?: Date;
}

export interface FeedResult {
  items: FeedItem[];
  shardResults: Map<number, FeedItem[]>;
  totalCount: number;
  shardsQueried: number[];
  queryTimeMs: number;
  nextCursor?: string;
  truncated?: boolean;
}

export interface FeedConfig {
  maxShardsToQuery: number;
  timeoutMs: number;
  enableSmartShardRouting: boolean;
  cacheFeedResults: boolean;
  cacheTtlMs: number;
  maxItemsPerShard: number;
  maxCacheEntries: number;
}

interface CacheEntry {
  result: FeedResult;
  timestamp: number;
}

interface HeapNode {
  item: FeedItem;
  shardIndex: number;
  itemIndex: number;
}

export class FeedService {
  private coLocationService: DataCoLocationService;
  private shardRouter: IShardRouter;
  private config: FeedConfig;
  private feedCache: Map<string, CacheEntry> = new Map();
  private cacheAccessOrder: string[] = [];
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(
    coLocationService: DataCoLocationService,
    shardRouter: IShardRouter,
    config?: Partial<FeedConfig>
  ) {
    this.coLocationService = coLocationService;
    this.shardRouter = shardRouter;
    this.config = {
      maxShardsToQuery: 8,
      timeoutMs: 5000,
      enableSmartShardRouting: true,
      cacheFeedResults: true,
      cacheTtlMs: 30000,
      maxItemsPerShard: 100,
      maxCacheEntries: 1000,
      ...config,
    };
  }

  async initialize(): Promise<void> {
    if (this.config.cacheFeedResults && this.config.cacheTtlMs > 0) {
      this.startCacheCleanup();
    }
  }

  async shutdown(): Promise<void> {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.feedCache.clear();
    this.cacheAccessOrder = [];
  }

  private startCacheCleanup(): void {
    const intervalMs = Math.max(this.config.cacheTtlMs, 60000);
    this.cleanupInterval = setInterval(() => {
      this.sweepExpiredFeedCache();
    }, intervalMs);
    this.cleanupInterval.unref();
  }

  private sweepExpiredFeedCache(): void {
    const now = Date.now();
    const keysToRemove: string[] = [];

    for (const [key, entry] of this.feedCache.entries()) {
      if (now - entry.timestamp > this.config.cacheTtlMs) {
        keysToRemove.push(key);
      }
    }

    for (const key of keysToRemove) {
      this.removeFromCache(key);
    }

    while (this.feedCache.size > this.config.maxCacheEntries) {
      const oldestKey = this.cacheAccessOrder.shift();
      if (oldestKey) {
        this.feedCache.delete(oldestKey);
      } else {
        break;
      }
    }

    if (keysToRemove.length > 0) {
      console.debug(
        `[FeedService] Swept ${keysToRemove.length} expired feed cache entries`
      );
    }
  }

  private addToCache(key: string, entry: CacheEntry): void {
    if (this.feedCache.size >= this.config.maxCacheEntries) {
      const oldestKey = this.cacheAccessOrder.shift();
      if (oldestKey) {
        this.feedCache.delete(oldestKey);
      }
    }

    this.feedCache.set(key, entry);
    this.cacheAccessOrder.push(key);
  }

  private removeFromCache(key: string): void {
    this.feedCache.delete(key);
    const idx = this.cacheAccessOrder.indexOf(key);
    if (idx >= 0) {
      this.cacheAccessOrder.splice(idx, 1);
    }
  }

  private touchCache(key: string): void {
    const idx = this.cacheAccessOrder.indexOf(key);
    if (idx >= 0) {
      this.cacheAccessOrder.splice(idx, 1);
      this.cacheAccessOrder.push(key);
    }
  }

  private getCacheKey(
    userId: string,
    followingIds: string[],
    options: FeedQueryOptions
  ): string {
    return `${userId}:${[...followingIds].sort().join(',')}:${JSON.stringify(options)}`;
  }

  private encodeCursor(item: FeedItem): string {
    const timestamp = new Date(item.createdAt).getTime();
    return Buffer.from(`${timestamp}:${item.id}`).toString('base64');
  }

  private decodeCursor(
    cursor: string
  ): { timestamp: number; id: string } | null {
    try {
      const decoded = Buffer.from(cursor, 'base64').toString('utf-8');
      const [timestamp, id] = decoded.split(':');
      return { timestamp: parseInt(timestamp, 10), id };
    } catch {
      return null;
    }
  }

  async getFeedForUser(
    userId: string,
    followingIds: string[],
    options: FeedQueryOptions = {}
  ): Promise<FeedResult> {
    const startTime = Date.now();
    const limit = options.limit || 50;

    const cacheKey = this.getCacheKey(userId, followingIds, options);

    if (this.config.cacheFeedResults && !options.cursor) {
      const cached = this.feedCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < this.config.cacheTtlMs) {
        this.touchCache(cacheKey);
        return {
          ...cached.result,
          queryTimeMs: Date.now() - startTime,
        };
      }
    }

    const shardsToQuery = await this.determineShardsToQuery(
      userId,
      followingIds
    );

    if (shardsToQuery.length === 0) {
      return {
        items: [],
        shardResults: new Map(),
        totalCount: 0,
        shardsQueried: [],
        queryTimeMs: Date.now() - startTime,
      };
    }

    const truncated = shardsToQuery.length > this.config.maxShardsToQuery;
    const limitedShards = shardsToQuery.slice(0, this.config.maxShardsToQuery);

    if (truncated) {
      console.warn(
        `[FeedService] Truncating ${shardsToQuery.length - this.config.maxShardsToQuery} shards for user ${userId}. ` +
          `Consider increasing maxShardsToQuery or implementing shard prioritization.`
      );
    }

    const shardResults = await this.queryMultipleShards(limitedShards, options);

    const allItems = this.kWayMerge(shardResults, limit, options.cursor);

    let nextCursor: string | undefined;
    if (allItems.length > limit) {
      const cursorItem = allItems[limit - 1];
      nextCursor = this.encodeCursor(cursorItem);
    }

    const resultItems = allItems.slice(0, limit);

    const result: FeedResult = {
      items: resultItems,
      shardResults,
      totalCount: resultItems.length,
      shardsQueried: limitedShards,
      queryTimeMs: Date.now() - startTime,
      nextCursor,
      truncated,
    };

    if (this.config.cacheFeedResults && !options.cursor) {
      this.addToCache(cacheKey, {
        result,
        timestamp: Date.now(),
      });
    }

    return result;
  }

  private async determineShardsToQuery(
    userId: string,
    followingIds: string[]
  ): Promise<number[]> {
    if (this.config.enableSmartShardRouting) {
      return this.coLocationService.getCoLocatedShardsForFeed(
        userId,
        followingIds
      );
    }

    const allUserIds = [userId, ...followingIds];
    const shardMap =
      await this.coLocationService.getShardsForUserIds(allUserIds);
    return Array.from(new Set(shardMap.values()));
  }

  private async queryMultipleShards(
    shardIds: number[],
    options: FeedQueryOptions
  ): Promise<Map<number, FeedItem[]>> {
    const results = new Map<number, FeedItem[]>();

    const limit = options.limit || this.config.maxItemsPerShard;

    interface QueryResult {
      shardId: number;
      items: FeedItem[];
      error: unknown;
    }

    const queryPromises = shardIds.map(
      async (shardId): Promise<QueryResult> => {
        try {
          const items = await this.queryShardWithTimeout(shardId, {
            ...options,
            limit,
          });
          return { shardId, items, error: null };
        } catch (error) {
          console.error(
            `[FeedService] Error querying shard ${shardId}:`,
            error
          );
          return { shardId, items: [], error };
        }
      }
    );

    const settledResults = await Promise.allSettled(queryPromises);

    for (const result of settledResults) {
      if (
        result.status === 'fulfilled' &&
        result.value &&
        result.value.items.length > 0
      ) {
        results.set(result.value.shardId, result.value.items);
      }
    }

    return results;
  }

  private async queryShardWithTimeout(
    shardId: number,
    options: FeedQueryOptions
  ): Promise<FeedItem[]> {
    let timeoutHandle: NodeJS.Timeout | null = null;

    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(
        () => reject(new Error(`Shard ${shardId} timeout`)),
        this.config.timeoutMs
      );
    });

    try {
      return await Promise.race([
        this.queryShard(shardId, options),
        timeoutPromise,
      ]);
    } finally {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
    }
  }

  private async queryShard(
    shardId: number,
    options: FeedQueryOptions
  ): Promise<FeedItem[]> {
    const connection = await this.shardRouter.getShardConnection(
      shardId,
      ShardType.CONTENT
    );

    if (connection.status === 'disabled' || connection.status === 'draining') {
      console.debug(`[FeedService] Skipping disabled shard ${shardId}`);
      return [];
    }

    const items = await this.fetchContentFromShard(
      connection.connectionString,
      options
    );
    return items;
  }

  private async fetchContentFromShard(
    connectionString: string,
    options: FeedQueryOptions
  ): Promise<FeedItem[]> {
    const mockItems: FeedItem[] = [];
    return mockItems;
  }

  private kWayMerge(
    shardResults: Map<number, FeedItem[]>,
    limit: number,
    cursor?: string
  ): FeedItem[] {
    const arrays: Array<{ items: FeedItem[]; index: number }> = [];

    for (const [shardId, items] of shardResults.entries()) {
      const sortedItems = [...items].sort((a, b) => {
        const dateA = new Date(a.createdAt).getTime();
        const dateB = new Date(b.createdAt).getTime();
        return dateB - dateA;
      });
      arrays.push({ items: sortedItems, index: 0 });
    }

    if (arrays.length === 0) {
      return [];
    }

    let cursorThreshold: { timestamp: number; id: string } | null = null;
    if (cursor) {
      cursorThreshold = this.decodeCursor(cursor);
    }

    const result: FeedItem[] = [];
    const heap: HeapNode[] = [];

    for (let i = 0; i < arrays.length; i++) {
      if (arrays[i].items.length > 0) {
        heap.push({
          item: arrays[i].items[0],
          shardIndex: i,
          itemIndex: 0,
        });
      }
    }

    const siftDown = (heap: HeapNode[], idx: number): void => {
      const length = heap.length;
      while (true) {
        const leftChild = 2 * idx + 1;
        const rightChild = 2 * idx + 2;
        let smallest = idx;

        if (leftChild < length) {
          const dateA = new Date(heap[leftChild].item.createdAt).getTime();
          const dateB = new Date(heap[smallest].item.createdAt).getTime();
          if (
            dateA > dateB ||
            (dateA === dateB &&
              heap[leftChild].item.id > heap[smallest].item.id)
          ) {
            smallest = leftChild;
          }
        }

        if (rightChild < length) {
          const dateA = new Date(heap[rightChild].item.createdAt).getTime();
          const dateB = new Date(heap[smallest].item.createdAt).getTime();
          if (
            dateA > dateB ||
            (dateA === dateB &&
              heap[rightChild].item.id > heap[smallest].item.id)
          ) {
            smallest = rightChild;
          }
        }

        if (smallest !== idx) {
          [heap[idx], heap[smallest]] = [heap[smallest], heap[idx]];
          idx = smallest;
        } else {
          break;
        }
      }
    };

    const heapify = (heap: HeapNode[]): void => {
      for (let i = Math.floor(heap.length / 2) - 1; i >= 0; i--) {
        siftDown(heap, i);
      }
    };

    heapify(heap);

    while (heap.length > 0 && result.length < limit * 2) {
      const minNode = heap[0];
      const item = minNode.item;

      if (cursorThreshold) {
        const itemTime = new Date(item.createdAt).getTime();
        if (
          itemTime < cursorThreshold.timestamp ||
          (itemTime === cursorThreshold.timestamp &&
            item.id >= cursorThreshold.id)
        ) {
          minNode.itemIndex++;
          if (minNode.itemIndex < arrays[minNode.shardIndex].items.length) {
            minNode.item = arrays[minNode.shardIndex].items[minNode.itemIndex];
            siftDown(heap, 0);
          } else {
            heap[0] = heap[heap.length - 1];
            heap.pop();
            if (heap.length > 0) {
              siftDown(heap, 0);
            }
          }
          continue;
        }
      }

      result.push(item);

      minNode.itemIndex++;
      if (minNode.itemIndex < arrays[minNode.shardIndex].items.length) {
        minNode.item = arrays[minNode.shardIndex].items[minNode.itemIndex];
        siftDown(heap, 0);
      } else {
        heap[0] = heap[heap.length - 1];
        heap.pop();
        if (heap.length > 0) {
          siftDown(heap, 0);
        }
      }
    }

    return result;
  }

  async getFeedFromSingleShard(
    userId: string,
    options: FeedQueryOptions = {}
  ): Promise<FeedResult> {
    const startTime = Date.now();
    const shardId = await this.coLocationService.getShardIdForUser(userId);

    const shardResults = await this.queryMultipleShards([shardId], options);
    const allItems = this.kWayMerge(
      shardResults,
      options.limit || 50,
      options.cursor
    );
    const limit = options.limit || 50;
    const resultItems = allItems.slice(0, limit);

    return {
      items: resultItems,
      shardResults,
      totalCount: resultItems.length,
      shardsQueried: [shardId],
      queryTimeMs: Date.now() - startTime,
    };
  }

  invalidateFeedCache(userId?: string): void {
    if (userId) {
      const keysToRemove: string[] = [];
      for (const key of this.feedCache.keys()) {
        if (key.startsWith(userId)) {
          keysToRemove.push(key);
        }
      }
      for (const key of keysToRemove) {
        this.removeFromCache(key);
      }
    } else {
      this.feedCache.clear();
      this.cacheAccessOrder = [];
    }
  }

  getCacheStats(): {
    totalEntries: number;
    maxEntries: number;
    oldestEntry: number | null;
    newestEntry: number | null;
  } {
    const timestamps: number[] = [];
    for (const entry of this.feedCache.values()) {
      timestamps.push(entry.timestamp);
    }

    return {
      totalEntries: this.feedCache.size,
      maxEntries: this.config.maxCacheEntries,
      oldestEntry: timestamps.length > 0 ? Math.min(...timestamps) : null,
      newestEntry: timestamps.length > 0 ? Math.max(...timestamps) : null,
    };
  }

  getConfig(): FeedConfig {
    return { ...this.config };
  }

  updateConfig(config: Partial<FeedConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

export function createFeedService(
  coLocationService: DataCoLocationService,
  shardRouter: IShardRouter,
  config?: Partial<FeedConfig>
): FeedService {
  return new FeedService(coLocationService, shardRouter, config);
}
