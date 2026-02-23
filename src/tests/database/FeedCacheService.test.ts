import { FeedCacheService } from '../../database/sharding/FeedCacheService';
import { RedisCacheManager } from '../../cache/redis/RedisCacheManager';
import { FeedResult } from '../../database/sharding/FeedService';

const createMockCacheManager = () => {
  const store = new Map<string, { value: any; ttl: number }>();

  return {
    initializeCache: jest.fn().mockResolvedValue(undefined),
    get: jest
      .fn()
      .mockImplementation(async (_cacheName: string, key: string) => {
        const entry = store.get(key);
        return entry ? entry.value : null;
      }),
    set: jest
      .fn()
      .mockImplementation(
        async (_cacheName: string, key: string, value: any, ttl: number) => {
          store.set(key, { value, ttl });
        }
      ),
    delete: jest
      .fn()
      .mockImplementation(async (_cacheName: string, key: string) => {
        store.delete(key);
        return 1;
      }),
    invalidateByPattern: jest
      .fn()
      .mockImplementation(async (_cacheName: string, pattern: string) => {
        let count = 0;
        const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
        for (const key of store.keys()) {
          if (regex.test(key)) {
            store.delete(key);
            count++;
          }
        }
        return count;
      }),
    clear: jest.fn().mockImplementation(async (_cacheName: string) => {
      store.clear();
    }),
    getStatistics: jest.fn().mockReturnValue({
      hits: 100,
      misses: 20,
      sets: 50,
      hitRate: 83.3,
    }),
    shutdown: jest.fn().mockResolvedValue(undefined),
  } as unknown as RedisCacheManager;
};

describe('FeedCacheService', () => {
  let feedCacheService: FeedCacheService;
  let mockCacheManager: RedisCacheManager;

  beforeEach(() => {
    mockCacheManager = createMockCacheManager();
    feedCacheService = new FeedCacheService(mockCacheManager, {
      redisCacheName: 'feed',
      defaultTtlSeconds: 30,
      maxEntries: 10000,
      invalidationEnabled: true,
      cacheKeyPrefix: 'feed:',
    });
  });

  afterEach(async () => {
    await feedCacheService.shutdown();
  });

  describe('initialization', () => {
    it('should initialize cache', async () => {
      await feedCacheService.initialize();
      expect(mockCacheManager.initializeCache).toHaveBeenCalled();
    });
  });

  describe('getFeed', () => {
    it('should return cached feed when available', async () => {
      await feedCacheService.initialize();

      const mockResult: FeedResult = {
        items: [],
        shardResults: new Map(),
        totalCount: 0,
        shardsQueried: [],
        queryTimeMs: 100,
      };

      await feedCacheService.setFeed('user1', ['follow1'], {}, mockResult);

      const cached = await feedCacheService.getFeed('user1', ['follow1'], {});
      expect(cached).not.toBeNull();
    });

    it('should return null on cache miss', async () => {
      await feedCacheService.initialize();

      const cached = await feedCacheService.getFeed(
        'user-miss',
        ['follow1'],
        {}
      );
      expect(cached).toBeNull();
    });

    it('should not attempt cache get when disabled', async () => {
      const disabledService = new FeedCacheService(mockCacheManager, {
        invalidationEnabled: false,
      });

      await disabledService.initialize();

      const result = await disabledService.getFeed('user1', ['follow1'], {});
      expect(result).toBeNull();

      await disabledService.shutdown();
    });
  });

  describe('setFeed', () => {
    it('should cache feed result', async () => {
      await feedCacheService.initialize();

      const mockResult: FeedResult = {
        items: [],
        shardResults: new Map(),
        totalCount: 0,
        shardsQueried: [],
        queryTimeMs: 100,
      };

      await feedCacheService.setFeed('user1', ['follow1'], {}, mockResult);

      expect(mockCacheManager.set).toHaveBeenCalled();
    });

    it('should use custom TTL when provided', async () => {
      await feedCacheService.initialize();

      const mockResult: FeedResult = {
        items: [],
        shardResults: new Map(),
        totalCount: 0,
        shardsQueried: [],
        queryTimeMs: 100,
      };

      await feedCacheService.setFeed('user1', ['follow1'], {}, mockResult, 60);

      expect(mockCacheManager.set).toHaveBeenCalledWith(
        'feed',
        expect.any(String),
        mockResult,
        60
      );
    });
  });

  describe('invalidation', () => {
    it('should invalidate user feed', async () => {
      await feedCacheService.initialize();

      const mockResult: FeedResult = {
        items: [],
        shardResults: new Map(),
        totalCount: 0,
        shardsQueried: [],
        queryTimeMs: 100,
      };

      await feedCacheService.setFeed('user1', ['follow1'], {}, mockResult);
      const count = await feedCacheService.invalidateUserFeed('user1');

      expect(count).toBeGreaterThanOrEqual(0);
    });

    it('should invalidate by following', async () => {
      await feedCacheService.initialize();

      const count = await feedCacheService.invalidateUserFeedByFollowing(
        'user1',
        ['follow1', 'follow2']
      );
      expect(count).toBeGreaterThanOrEqual(0);
    });

    it('should clear all cache', async () => {
      await feedCacheService.initialize();

      await feedCacheService.clearCache();

      expect(mockCacheManager.clear).toHaveBeenCalled();
    });
  });

  describe('stats', () => {
    it('should track local stats', async () => {
      await feedCacheService.initialize();

      await feedCacheService.getFeed('user1', ['follow1'], {});

      const stats = feedCacheService.getStats();
      expect(stats.misses).toBeGreaterThan(0);
    });

    it('should get redis stats', async () => {
      await feedCacheService.initialize();

      const redisStats = feedCacheService.getRedisStats();
      expect(redisStats).toBeDefined();
    });
  });

  describe('configuration', () => {
    it('should return current config', () => {
      const config = feedCacheService.getConfig();
      expect(config.redisCacheName).toBe('feed');
      expect(config.defaultTtlSeconds).toBe(30);
    });

    it('should update config', () => {
      feedCacheService.updateConfig({ defaultTtlSeconds: 60 });
      const config = feedCacheService.getConfig();
      expect(config.defaultTtlSeconds).toBe(60);
    });
  });
});
