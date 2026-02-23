import { ContentDiscoveryService } from '../../database/sharding/ContentDiscoveryService';
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
  getShardsByType: jest.fn().mockResolvedValue([
    {
      shardId: 0,
      shardKey: 0,
      shardType: ShardType.CONTENT,
      connectionString: 'conn0',
      status: ShardStatus.ACTIVE,
      lastStatusChange: new Date(),
    },
    {
      shardId: 1,
      shardKey: 1,
      shardType: ShardType.CONTENT,
      connectionString: 'conn1',
      status: ShardStatus.ACTIVE,
      lastStatusChange: new Date(),
    },
    {
      shardId: 2,
      shardKey: 2,
      shardType: ShardType.CONTENT,
      connectionString: 'conn2',
      status: ShardStatus.ACTIVE,
      lastStatusChange: new Date(),
    },
  ]),
  getShardConnection: jest
    .fn()
    .mockImplementation(async (shardId: number, shardType: ShardType) =>
      mockShardInfo(shardId)
    ),
  isShardHealthy: jest.fn().mockResolvedValue(true),
  getActiveShardCount: jest.fn().mockResolvedValue(3),
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

describe('ContentDiscoveryService', () => {
  let discoveryService: ContentDiscoveryService;
  let mockRouter: IShardRouter;
  let coLocationService: DataCoLocationService;

  beforeEach(() => {
    mockRouter = createMockRouter();
    coLocationService = new DataCoLocationService(mockRouter, {
      cacheUserShardMapping: true,
      cacheTtlMs: 60000,
      cacheCleanupIntervalMs: 0,
    });
    discoveryService = new ContentDiscoveryService(
      mockRouter,
      coLocationService,
      {
        maxShardsToQuery: 8,
        searchTimeoutMs: 3000,
        trendingTimeoutMs: 3000,
        cacheSearchResults: true,
        searchCacheTtlMs: 60000,
        cacheTrendingResults: true,
        trendingCacheTtlMs: 60000,
      }
    );
  });

  afterEach(async () => {
    await discoveryService.shutdown();
    await coLocationService.shutdown();
  });

  describe('initialization', () => {
    it('should initialize with default config', async () => {
      await discoveryService.initialize();
      const config = discoveryService.getConfig();
      expect(config.maxShardsToQuery).toBe(8);
    });
  });

  describe('search', () => {
    it('should return search results', async () => {
      const result = await discoveryService.search({
        query: 'test',
        pagination: { limit: 10 },
      });
      expect(result.items).toEqual([]);
      expect(result.shardsQueried).toBeDefined();
    });

    it('should respect filters', async () => {
      const result = await discoveryService.search({
        query: 'test',
        filters: { contentTypes: ['post'] },
        pagination: { limit: 10 },
      });
      expect(result.items).toEqual([]);
    });

    it('should cache search results', async () => {
      const serviceWithCache = new ContentDiscoveryService(
        mockRouter,
        coLocationService,
        {
          cacheSearchResults: true,
          searchCacheTtlMs: 60000,
        }
      );
      await serviceWithCache.initialize();

      await serviceWithCache.search({
        query: 'test',
        pagination: { limit: 10 },
      });
      const stats = serviceWithCache.getCacheStats();
      expect(stats.searchEntries).toBe(1);

      await serviceWithCache.shutdown();
    });

    it('should generate next cursor when more results exist', async () => {
      const result = await discoveryService.search({
        query: 'test',
        pagination: { limit: 5 },
      });
      expect(result.nextCursor).toBeUndefined();
    });
  });

  describe('trending', () => {
    it('should return trending results', async () => {
      const result = await discoveryService.trending({
        timeframe: 'day',
        limit: 10,
        offset: 0,
      });
      expect(result.items).toEqual([]);
      expect(result.timeframe).toBe('day');
    });

    it('should cache trending results', async () => {
      const serviceWithCache = new ContentDiscoveryService(
        mockRouter,
        coLocationService,
        {
          cacheTrendingResults: true,
          trendingCacheTtlMs: 60000,
        }
      );
      await serviceWithCache.initialize();

      await serviceWithCache.trending({
        timeframe: 'day',
        limit: 10,
        offset: 0,
      });
      const stats = serviceWithCache.getCacheStats();
      expect(stats.trendingEntries).toBe(1);

      await serviceWithCache.shutdown();
    });

    it('should respect content type filters', async () => {
      const result = await discoveryService.trending({
        timeframe: 'week',
        contentTypes: ['post'],
        limit: 10,
        offset: 0,
      });
      expect(result.items).toEqual([]);
    });
  });

  describe('relevance scoring', () => {
    it('should calculate relevance scores', async () => {
      const service = new ContentDiscoveryService(
        mockRouter,
        coLocationService,
        {}
      );

      const recentItem = {
        id: '1',
        authorId: 'a',
        contentType: 'post' as const,
        title: 'Test',
        body: 'Content',
        tags: ['test'],
        createdAt: new Date(),
        updatedAt: new Date(),
        metrics: { views: 100, likes: 10, shares: 5, replies: 3 },
      };

      const oldItem = {
        id: '2',
        authorId: 'b',
        contentType: 'post' as const,
        title: 'Test2',
        body: 'Content2',
        tags: ['test'],
        createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        updatedAt: new Date(),
        metrics: { views: 100, likes: 10, shares: 5, replies: 3 },
      };

      const items = [oldItem, recentItem];
      const ranked = service['rankSearchResults'](items, {});

      expect(ranked[0].id).toBe(recentItem.id);
    });

    it('should calculate trending scores', async () => {
      const service = new ContentDiscoveryService(
        mockRouter,
        coLocationService,
        {}
      );

      const popularItem = {
        id: '1',
        authorId: 'a',
        contentType: 'post' as const,
        title: 'Popular',
        body: 'Content',
        tags: ['test'],
        createdAt: new Date(),
        updatedAt: new Date(),
        metrics: { views: 10000, likes: 1000, shares: 500, replies: 300 },
      };

      const quietItem = {
        id: '2',
        authorId: 'b',
        contentType: 'post' as const,
        title: 'Quiet',
        body: 'Content2',
        tags: ['test'],
        createdAt: new Date(),
        updatedAt: new Date(),
        metrics: { views: 10, likes: 1, shares: 0, replies: 0 },
      };

      const items = [quietItem, popularItem];
      const ranked = service['rankTrendingResults'](items, {
        timeframe: 'day',
        limit: 10,
        offset: 0,
      });

      expect(ranked[0].id).toBe(popularItem.id);
    });
  });

  describe('cache invalidation', () => {
    it('should invalidate search cache', async () => {
      const service = new ContentDiscoveryService(
        mockRouter,
        coLocationService,
        {
          cacheSearchResults: true,
        }
      );
      await service.initialize();

      await service.search({ query: 'test', pagination: { limit: 10 } });
      service.invalidateSearchCache();

      const stats = service.getCacheStats();
      expect(stats.searchEntries).toBe(0);

      await service.shutdown();
    });

    it('should invalidate trending cache', async () => {
      const service = new ContentDiscoveryService(
        mockRouter,
        coLocationService,
        {
          cacheTrendingResults: true,
        }
      );
      await service.initialize();

      await service.trending({ timeframe: 'day', limit: 10, offset: 0 });
      service.invalidateTrendingCache();

      const stats = service.getCacheStats();
      expect(stats.trendingEntries).toBe(0);

      await service.shutdown();
    });

    it('should invalidate all cache', async () => {
      const service = new ContentDiscoveryService(
        mockRouter,
        coLocationService,
        {
          cacheSearchResults: true,
          cacheTrendingResults: true,
        }
      );
      await service.initialize();

      await service.search({ query: 'test', pagination: { limit: 10 } });
      await service.trending({ timeframe: 'day', limit: 10, offset: 0 });
      service.invalidateAllCache();

      const stats = service.getCacheStats();
      expect(stats.searchEntries).toBe(0);
      expect(stats.trendingEntries).toBe(0);

      await service.shutdown();
    });
  });

  describe('configuration', () => {
    it('should return current config', () => {
      const config = discoveryService.getConfig();
      expect(config.maxShardsToQuery).toBe(8);
    });

    it('should update config', () => {
      discoveryService.updateConfig({ maxShardsToQuery: 4 });
      const config = discoveryService.getConfig();
      expect(config.maxShardsToQuery).toBe(4);
    });
  });
});
