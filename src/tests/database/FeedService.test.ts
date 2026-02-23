import { FeedService } from '../../database/sharding/FeedService';
import { DataCoLocationService } from '../../database/sharding/DataCoLocationService';
import {
  IShardRouter,
  ShardEntityType,
  ShardType,
  ShardStatus,
} from '../../database/sharding/IShardRouter';

const mockShardInfo = (shardId: number) => ({
  shardId,
  shardKey: shardId,
  shardType: ShardType.CONTENT,
  connectionString: `postgresql://localhost:5432/content_${shardId}`,
  status: ShardStatus.ACTIVE as const,
  lastStatusChange: new Date(),
});

const createMockRouter = (): IShardRouter => ({
  routeToShard: jest
    .fn()
    .mockImplementation(
      async (entityType: ShardEntityType, entityKey: string) => {
        const hash = Array.from(entityKey).reduce(
          (acc, char) => acc + char.charCodeAt(0),
          0
        );
        const shardId = hash % 4;
        return {
          shardId,
          shardInfo: mockShardInfo(shardId),
          entityType,
          entityKey,
        };
      }
    ),
  getShardsByType: jest.fn().mockResolvedValue([]),
  getShardConnection: jest
    .fn()
    .mockImplementation(async (shardId: number, shardType: ShardType) =>
      mockShardInfo(shardId)
    ),
  isShardHealthy: jest.fn().mockResolvedValue(true),
  getActiveShardCount: jest.fn().mockResolvedValue(4),
  addShard: jest.fn().mockResolvedValue(undefined),
  removeShard: jest.fn().mockResolvedValue(undefined),
  getAllShardHealth: jest.fn().mockResolvedValue([]),
  initialize: jest.fn().mockResolvedValue(undefined),
  shutdown: jest.fn().mockResolvedValue(undefined),
  getShardForUser: jest.fn().mockImplementation(async (userId: string) => {
    const hash = Array.from(userId).reduce(
      (acc, char) => acc + char.charCodeAt(0),
      0
    );
    return hash % 4;
  }),
  configure: jest.fn(),
});

describe('FeedService', () => {
  let feedService: FeedService;
  let mockRouter: IShardRouter;
  let coLocationService: DataCoLocationService;

  beforeEach(() => {
    mockRouter = createMockRouter();
    coLocationService = new DataCoLocationService(mockRouter, {
      cacheUserShardMapping: true,
      cacheTtlMs: 60000,
      cacheCleanupIntervalMs: 0,
    });
    feedService = new FeedService(coLocationService, mockRouter, {
      maxShardsToQuery: 8,
      timeoutMs: 5000,
      enableSmartShardRouting: true,
      cacheFeedResults: true,
      cacheTtlMs: 60000,
      maxItemsPerShard: 100,
    });
  });

  afterEach(async () => {
    await feedService.shutdown();
    await coLocationService.shutdown();
  });

  describe('initialization', () => {
    it('should initialize with default config', async () => {
      await feedService.initialize();
      const config = feedService.getConfig();
      expect(config.maxShardsToQuery).toBe(8);
      expect(config.enableSmartShardRouting).toBe(true);
    });

    it('should start cache cleanup when enabled', async () => {
      const serviceWithCleanup = new FeedService(
        coLocationService,
        mockRouter,
        {
          cacheFeedResults: true,
          cacheTtlMs: 1000,
        }
      );
      await serviceWithCleanup.initialize();
      const stats = serviceWithCleanup.getCacheStats();
      expect(stats.totalEntries).toBe(0);
      await serviceWithCleanup.shutdown();
    });
  });

  describe('getFeedForUser', () => {
    it('should return empty result when no following', async () => {
      const result = await feedService.getFeedForUser('user-main', []);
      expect(result.items).toEqual([]);
      expect(result.shardsQueried.length).toBeGreaterThanOrEqual(0);
      expect(result.queryTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should determine shards to query using co-location service', async () => {
      const result = await feedService.getFeedForUser('user-main', [
        'user-follow-1',
      ]);
      expect(result.shardsQueried).toBeDefined();
    });

    it('should respect maxShardsToQuery limit', async () => {
      const limitedService = new FeedService(coLocationService, mockRouter, {
        maxShardsToQuery: 2,
        enableSmartShardRouting: true,
        cacheFeedResults: false,
      });
      const following = Array.from(
        { length: 10 },
        (_, i) => `user-follow-${i}`
      );
      const result = await limitedService.getFeedForUser(
        'user-main',
        following
      );
      expect(result.shardsQueried.length).toBeLessThanOrEqual(2);
      expect(result.truncated).toBe(true);
      await limitedService.shutdown();
    });

    it('should cache feed results', async () => {
      const serviceWithCache = new FeedService(coLocationService, mockRouter, {
        cacheFeedResults: true,
        cacheTtlMs: 60000,
      });
      await serviceWithCache.getFeedForUser('user-cache', ['user-follow']);
      const stats = serviceWithCache.getCacheStats();
      expect(stats.totalEntries).toBe(1);
      await serviceWithCache.shutdown();
    });

    it('should return cached result within TTL', async () => {
      const cacheService = new FeedService(coLocationService, mockRouter, {
        cacheFeedResults: true,
        cacheTtlMs: 60000,
      });
      const result1 = await cacheService.getFeedForUser('user-cache2', [
        'user-follow',
      ]);
      const result2 = await cacheService.getFeedForUser('user-cache2', [
        'user-follow',
      ]);
      expect(result1.queryTimeMs).toBeDefined();
      expect(result2.queryTimeMs).toBeLessThan(1);
      await cacheService.shutdown();
    });

    it('should respect maxCacheEntries', async () => {
      const limitedCacheService = new FeedService(
        coLocationService,
        mockRouter,
        {
          cacheFeedResults: true,
          cacheTtlMs: 60000,
          maxCacheEntries: 2,
        }
      );
      await limitedCacheService.getFeedForUser('user1', ['follow1']);
      await limitedCacheService.getFeedForUser('user2', ['follow2']);
      await limitedCacheService.getFeedForUser('user3', ['follow3']);
      const stats = limitedCacheService.getCacheStats();
      expect(stats.totalEntries).toBeLessThanOrEqual(2);
      await limitedCacheService.shutdown();
    });
  });

  describe('getFeedFromSingleShard', () => {
    it('should query single shard for user', async () => {
      const result = await feedService.getFeedFromSingleShard('user-single');
      expect(result.shardsQueried.length).toBe(1);
    });
  });

  describe('k-way merge', () => {
    it('should merge sorted arrays using k-way merge', async () => {
      const service = new FeedService(coLocationService, mockRouter, {
        cacheFeedResults: false,
      });
      const mockResults = new Map<number, any[]>();
      mockResults.set(0, [
        {
          id: '1',
          authorId: 'a',
          contentType: 'post' as const,
          content: 'test1',
          createdAt: new Date('2024-01-01'),
          updatedAt: new Date(),
        },
        {
          id: '2',
          authorId: 'b',
          contentType: 'post' as const,
          content: 'test2',
          createdAt: new Date('2024-01-03'),
          updatedAt: new Date(),
        },
      ]);
      mockResults.set(1, [
        {
          id: '3',
          authorId: 'c',
          contentType: 'post' as const,
          content: 'test3',
          createdAt: new Date('2024-01-02'),
          updatedAt: new Date(),
        },
      ]);
      const merged = (service as any).kWayMerge(mockResults, 10, undefined);
      expect(merged.length).toBe(3);
      expect(merged[0].id).toBe('2');
      await service.shutdown();
    });
  });

  describe('cache invalidation', () => {
    it('should invalidate cache for specific user', async () => {
      const cacheService = new FeedService(coLocationService, mockRouter, {
        cacheFeedResults: true,
      });
      await cacheService.getFeedForUser('user-invalidate', ['user-follow']);
      cacheService.invalidateFeedCache('user-invalidate');
      const stats = cacheService.getCacheStats();
      expect(stats.totalEntries).toBe(0);
      await cacheService.shutdown();
    });

    it('should clear all cache when no userId provided', async () => {
      const cacheService = new FeedService(coLocationService, mockRouter, {
        cacheFeedResults: true,
      });
      await cacheService.getFeedForUser('user-1', ['follow-1']);
      await cacheService.getFeedForUser('user-2', ['follow-2']);
      cacheService.invalidateFeedCache();
      const stats = cacheService.getCacheStats();
      expect(stats.totalEntries).toBe(0);
      await cacheService.shutdown();
    });
  });

  describe('configuration', () => {
    it('should return current config', () => {
      const config = feedService.getConfig();
      expect(config.maxShardsToQuery).toBe(8);
    });

    it('should update config', () => {
      feedService.updateConfig({ maxShardsToQuery: 4 });
      const config = feedService.getConfig();
      expect(config.maxShardsToQuery).toBe(4);
    });
  });
});
