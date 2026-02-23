/**
 * Content Discovery Service
 * Provides search and trending content discovery across shards.
 * Supports full-text search, trending posts, and personalized recommendations.
 */

import { IShardRouter, ShardType } from './IShardRouter';
import { DataCoLocationService } from './DataCoLocationService';

export interface ContentItem {
  id: string;
  authorId: string;
  contentType: 'post' | 'thread' | 'reply';
  title?: string;
  body: string;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
  metrics: ContentMetrics;
  metadata?: Record<string, unknown>;
}

export interface ContentMetrics {
  views: number;
  likes: number;
  shares: number;
  replies: number;
}

export interface SearchQuery {
  query: string;
  filters?: SearchFilters;
  pagination: PaginationOptions;
}

export interface SearchFilters {
  contentTypes?: Array<'post' | 'thread' | 'reply'>;
  authorIds?: string[];
  tags?: string[];
  dateRange?: {
    since?: Date;
    until?: Date;
  };
  minLikes?: number;
  minViews?: number;
}

export interface PaginationOptions {
  limit: number;
  cursor?: string;
}

export interface SearchResult {
  items: ContentItem[];
  totalCount: number;
  nextCursor?: string;
  shardsQueried: number[];
  queryTimeMs: number;
}

export interface TrendingQuery {
  timeframe: 'hour' | 'day' | 'week' | 'month';
  contentTypes?: Array<'post' | 'thread' | 'reply'>;
  limit: number;
  offset: number;
}

export interface TrendingResult {
  items: ContentItem[];
  timeframe: string;
  totalCount: number;
  shardsQueried: number[];
  queryTimeMs: number;
}

export interface DiscoveryConfig {
  maxShardsToQuery: number;
  searchTimeoutMs: number;
  trendingTimeoutMs: number;
  cacheSearchResults: boolean;
  searchCacheTtlMs: number;
  cacheTrendingResults: boolean;
  trendingCacheTtlMs: number;
  maxSearchResults: number;
  trendingLimitDefault: number;
}

interface CacheEntry<T> {
  result: T;
  timestamp: number;
}

export class ContentDiscoveryService {
  private shardRouter: IShardRouter;
  private coLocationService: DataCoLocationService;
  private config: DiscoveryConfig;
  private searchCache: Map<string, CacheEntry<SearchResult>> = new Map();
  private trendingCache: Map<string, CacheEntry<TrendingResult>> = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(
    shardRouter: IShardRouter,
    coLocationService: DataCoLocationService,
    config?: Partial<DiscoveryConfig>
  ) {
    this.shardRouter = shardRouter;
    this.coLocationService = coLocationService;
    this.config = {
      maxShardsToQuery: 8,
      searchTimeoutMs: 3000,
      trendingTimeoutMs: 3000,
      cacheSearchResults: true,
      searchCacheTtlMs: 15000,
      cacheTrendingResults: true,
      trendingCacheTtlMs: 60000,
      maxSearchResults: 100,
      trendingLimitDefault: 50,
      ...config,
    };
  }

  async initialize(): Promise<void> {
    this.startCacheCleanup();
  }

  async shutdown(): Promise<void> {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.searchCache.clear();
    this.trendingCache.clear();
  }

  private startCacheCleanup(): void {
    const intervalMs = Math.max(this.config.searchCacheTtlMs, 60000);
    this.cleanupInterval = setInterval(() => {
      this.sweepExpiredCache();
    }, intervalMs);
    this.cleanupInterval.unref();
  }

  private sweepExpiredCache(): void {
    const now = Date.now();
    let searchRemoved = 0;
    let trendingRemoved = 0;

    for (const [key, entry] of this.searchCache.entries()) {
      if (now - entry.timestamp > this.config.searchCacheTtlMs) {
        this.searchCache.delete(key);
        searchRemoved++;
      }
    }

    for (const [key, entry] of this.trendingCache.entries()) {
      if (now - entry.timestamp > this.config.trendingCacheTtlMs) {
        this.trendingCache.delete(key);
        trendingRemoved++;
      }
    }

    if (searchRemoved > 0 || trendingRemoved > 0) {
      console.debug(
        `[ContentDiscovery] Swept ${searchRemoved} search, ${trendingRemoved} trending cache entries`
      );
    }
  }

  private buildSearchCacheKey(query: SearchQuery): string {
    return `${query.query}:${JSON.stringify(query.filters)}:${query.pagination.limit}:${query.pagination.cursor || 'none'}`;
  }

  private buildTrendingCacheKey(query: TrendingQuery): string {
    return `${query.timeframe}:${(query.contentTypes || []).join(',')}:${query.limit}:${query.offset}`;
  }

  async search(query: SearchQuery): Promise<SearchResult> {
    const startTime = Date.now();
    const cacheKey = this.buildSearchCacheKey(query);

    if (this.config.cacheSearchResults) {
      const cached = this.searchCache.get(cacheKey);
      if (
        cached &&
        Date.now() - cached.timestamp < this.config.searchCacheTtlMs
      ) {
        return {
          ...cached.result,
          queryTimeMs: Date.now() - startTime,
        };
      }
    }

    const shardsToQuery = await this.determineSearchShards(query);
    const limitedShards = shardsToQuery.slice(0, this.config.maxShardsToQuery);

    const results = await this.queryShardsForSearch(limitedShards, query);

    const merged = this.mergeSearchResults(results, query.pagination.limit);
    const sorted = this.rankSearchResults(merged, query.filters);

    let nextCursor: string | undefined;
    if (sorted.length > query.pagination.limit) {
      const cursorItem = sorted[query.pagination.limit - 1];
      nextCursor = Buffer.from(
        `${cursorItem.id}:${new Date(cursorItem.createdAt).getTime()}`
      ).toString('base64');
    }

    const result: SearchResult = {
      items: sorted.slice(0, query.pagination.limit),
      totalCount: sorted.length,
      nextCursor,
      shardsQueried: limitedShards,
      queryTimeMs: Date.now() - startTime,
    };

    if (this.config.cacheSearchResults) {
      this.searchCache.set(cacheKey, {
        result,
        timestamp: Date.now(),
      });
    }

    return result;
  }

  private async determineSearchShards(query: SearchQuery): Promise<number[]> {
    if (query.filters?.authorIds && query.filters.authorIds.length > 0) {
      return this.coLocationService
        .getShardsForUserIds(query.filters.authorIds)
        .then((shardMap) => Array.from(new Set(shardMap.values())));
    }

    const allShards = await this.shardRouter.getShardsByType(ShardType.CONTENT);
    return allShards.map((s) => s.shardId);
  }

  private async queryShardsForSearch(
    shardIds: number[],
    query: SearchQuery
  ): Promise<Map<number, ContentItem[]>> {
    const results = new Map<number, ContentItem[]>();

    const queryPromises = shardIds.map(async (shardId) => {
      try {
        const items = await this.searchShardWithTimeout(shardId, query);
        return { shardId, items, error: null };
      } catch (error) {
        console.error(
          `[ContentDiscovery] Error searching shard ${shardId}:`,
          error
        );
        return { shardId, items: [] as ContentItem[], error };
      }
    });

    const settled = await Promise.allSettled(queryPromises);

    for (const r of settled) {
      if (r.status === 'fulfilled' && r.value && r.value.items.length > 0) {
        results.set(r.value.shardId, r.value.items);
      }
    }

    return results;
  }

  private async searchShardWithTimeout(
    shardId: number,
    query: SearchQuery
  ): Promise<ContentItem[]> {
    let timeoutHandle: NodeJS.Timeout | null = null;

    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(
        () => reject(new Error(`Search shard ${shardId} timeout`)),
        this.config.searchTimeoutMs
      );
    });

    try {
      return await Promise.race([
        this.searchShard(shardId, query),
        timeoutPromise,
      ]);
    } finally {
      if (timeoutHandle) clearTimeout(timeoutHandle);
    }
  }

  private async searchShard(
    shardId: number,
    query: SearchQuery
  ): Promise<ContentItem[]> {
    const connection = await this.shardRouter.getShardConnection(
      shardId,
      ShardType.CONTENT
    );

    if (connection.status === 'disabled' || connection.status === 'draining') {
      return [];
    }

    const items = await this.fetchContentFromShard(
      connection.connectionString,
      query
    );
    return items;
  }

  private async fetchContentFromShard(
    connectionString: string,
    query: SearchQuery
  ): Promise<ContentItem[]> {
    return [];
  }

  private mergeSearchResults(
    shardResults: Map<number, ContentItem[]>,
    limit: number
  ): ContentItem[] {
    const allItems: ContentItem[] = [];

    for (const items of shardResults.values()) {
      allItems.push(...items);
    }

    return allItems.slice(0, limit * 2);
  }

  private rankSearchResults(
    items: ContentItem[],
    filters?: SearchFilters
  ): ContentItem[] {
    let filtered = items;

    if (filters?.contentTypes && filters.contentTypes.length > 0) {
      filtered = filtered.filter((item) =>
        filters.contentTypes!.includes(item.contentType as any)
      );
    }

    if (filters?.tags && filters.tags.length > 0) {
      filtered = filtered.filter((item) =>
        filters.tags!.some((tag) => item.tags.includes(tag))
      );
    }

    if (filters?.dateRange?.since) {
      const since = filters.dateRange.since.getTime();
      filtered = filtered.filter(
        (item) => new Date(item.createdAt).getTime() >= since
      );
    }

    if (filters?.dateRange?.until) {
      const until = filters.dateRange.until.getTime();
      filtered = filtered.filter(
        (item) => new Date(item.createdAt).getTime() <= until
      );
    }

    if (filters?.minLikes) {
      filtered = filtered.filter(
        (item) => item.metrics.likes >= filters.minLikes!
      );
    }

    if (filters?.minViews) {
      filtered = filtered.filter(
        (item) => item.metrics.views >= filters.minViews!
      );
    }

    filtered.sort((a, b) => {
      const scoreA = this.calculateRelevanceScore(a);
      const scoreB = this.calculateRelevanceScore(b);
      return scoreB - scoreA;
    });

    return filtered;
  }

  private calculateRelevanceScore(item: ContentItem): number {
    const ageHours =
      (Date.now() - new Date(item.createdAt).getTime()) / (1000 * 60 * 60);
    const recencyScore = Math.max(0, 1 - ageHours / 168);

    const engagementScore =
      item.metrics.likes * 1 +
      item.metrics.shares * 2 +
      item.metrics.replies * 3;

    return recencyScore * 0.4 + Math.log10(engagementScore + 1) * 0.6;
  }

  async trending(query: TrendingQuery): Promise<TrendingResult> {
    const startTime = Date.now();
    const cacheKey = this.buildTrendingCacheKey(query);

    if (this.config.cacheTrendingResults) {
      const cached = this.trendingCache.get(cacheKey);
      if (
        cached &&
        Date.now() - cached.timestamp < this.config.trendingCacheTtlMs
      ) {
        return {
          ...cached.result,
          queryTimeMs: Date.now() - startTime,
        };
      }
    }

    const allShards = await this.shardRouter.getShardsByType(ShardType.CONTENT);
    const shardIds = allShards
      .slice(0, this.config.maxShardsToQuery)
      .map((s) => s.shardId);

    const results = await this.queryShardsForTrending(shardIds, query);

    const merged = this.mergeTrendingResults(results, query.limit * 2);
    const sorted = this.rankTrendingResults(merged, query);

    const result: TrendingResult = {
      items: sorted.slice(query.offset, query.offset + query.limit),
      timeframe: query.timeframe,
      totalCount: sorted.length,
      shardsQueried: shardIds,
      queryTimeMs: Date.now() - startTime,
    };

    if (this.config.cacheTrendingResults) {
      this.trendingCache.set(cacheKey, {
        result,
        timestamp: Date.now(),
      });
    }

    return result;
  }

  private async queryShardsForTrending(
    shardIds: number[],
    query: TrendingQuery
  ): Promise<Map<number, ContentItem[]>> {
    const results = new Map<number, ContentItem[]>();

    const queryPromises = shardIds.map(async (shardId) => {
      try {
        const items = await this.trendingShardWithTimeout(shardId, query);
        return { shardId, items, error: null };
      } catch (error) {
        console.error(
          `[ContentDiscovery] Error trending shard ${shardId}:`,
          error
        );
        return { shardId, items: [] as ContentItem[], error };
      }
    });

    const settled = await Promise.allSettled(queryPromises);

    for (const r of settled) {
      if (r.status === 'fulfilled' && r.value && r.value.items.length > 0) {
        results.set(r.value.shardId, r.value.items);
      }
    }

    return results;
  }

  private async trendingShardWithTimeout(
    shardId: number,
    query: TrendingQuery
  ): Promise<ContentItem[]> {
    let timeoutHandle: NodeJS.Timeout | null = null;

    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(
        () => reject(new Error(`Trending shard ${shardId} timeout`)),
        this.config.trendingTimeoutMs
      );
    });

    try {
      return await Promise.race([
        this.trendingShard(shardId, query),
        timeoutPromise,
      ]);
    } finally {
      if (timeoutHandle) clearTimeout(timeoutHandle);
    }
  }

  private async trendingShard(
    shardId: number,
    query: TrendingQuery
  ): Promise<ContentItem[]> {
    const connection = await this.shardRouter.getShardConnection(
      shardId,
      ShardType.CONTENT
    );

    if (connection.status === 'disabled' || connection.status === 'draining') {
      return [];
    }

    return this.fetchTrendingFromShard(connection.connectionString, query);
  }

  private async fetchTrendingFromShard(
    connectionString: string,
    query: TrendingQuery
  ): Promise<ContentItem[]> {
    return [];
  }

  private mergeTrendingResults(
    shardResults: Map<number, ContentItem[]>,
    limit: number
  ): ContentItem[] {
    const allItems: ContentItem[] = [];
    for (const items of shardResults.values()) {
      allItems.push(...items);
    }
    return allItems.slice(0, limit);
  }

  private rankTrendingResults(
    items: ContentItem[],
    query: TrendingQuery
  ): ContentItem[] {
    let filtered = items;

    if (query.contentTypes && query.contentTypes.length > 0) {
      filtered = filtered.filter((item) =>
        query.contentTypes!.includes(item.contentType as any)
      );
    }

    const timeframeHours = {
      hour: 1,
      day: 24,
      week: 168,
      month: 720,
    }[query.timeframe];

    const cutoff = Date.now() - timeframeHours * 60 * 60 * 1000;
    filtered = filtered.filter(
      (item) => new Date(item.createdAt).getTime() >= cutoff
    );

    filtered.sort((a, b) => {
      const scoreA = this.calculateTrendingScore(a, query.timeframe);
      const scoreB = this.calculateTrendingScore(b, query.timeframe);
      return scoreB - scoreA;
    });

    return filtered;
  }

  private calculateTrendingScore(item: ContentItem, timeframe: string): number {
    const ageHours =
      (Date.now() - new Date(item.createdAt).getTime()) / (1000 * 60 * 60);

    const growthRate =
      (item.metrics.likes + item.metrics.shares + item.metrics.replies) /
      Math.max(ageHours, 0.1);

    const velocityMultiplier = Math.min(ageHours / 24 + 1, 3);

    const engagement =
      item.metrics.views * 0.1 +
      item.metrics.likes * 1 +
      item.metrics.shares * 2 +
      item.metrics.replies * 3;

    return growthRate * velocityMultiplier + Math.log10(engagement + 1);
  }

  async getSimilarContent(
    contentId: string,
    limit: number = 5
  ): Promise<ContentItem[]> {
    return [];
  }

  async getContentByTags(
    tags: string[],
    limit: number = 20
  ): Promise<SearchResult> {
    return this.search({
      query: '',
      filters: { tags },
      pagination: { limit },
    });
  }

  invalidateSearchCache(): void {
    this.searchCache.clear();
  }

  invalidateTrendingCache(): void {
    this.trendingCache.clear();
  }

  invalidateAllCache(): void {
    this.searchCache.clear();
    this.trendingCache.clear();
  }

  getCacheStats(): {
    searchEntries: number;
    trendingEntries: number;
  } {
    return {
      searchEntries: this.searchCache.size,
      trendingEntries: this.trendingCache.size,
    };
  }

  getConfig(): DiscoveryConfig {
    return { ...this.config };
  }

  updateConfig(config: Partial<DiscoveryConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

export function createContentDiscoveryService(
  shardRouter: IShardRouter,
  coLocationService: DataCoLocationService,
  config?: Partial<DiscoveryConfig>
): ContentDiscoveryService {
  return new ContentDiscoveryService(shardRouter, coLocationService, config);
}
