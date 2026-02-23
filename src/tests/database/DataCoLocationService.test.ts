import { DataCoLocationService } from '../../database/sharding/DataCoLocationService';
import {
  IShardRouter,
  ShardEntityType,
  ShardType,
  ShardStatus,
} from '../../database/sharding/IShardRouter';

const mockShardInfo = {
  shardId: 0,
  shardKey: 0,
  shardType: ShardType.CONTENT,
  connectionString: 'postgresql://localhost:5432/content_0',
  status: ShardStatus.ACTIVE,
  lastStatusChange: new Date(),
};

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
          shardInfo: { ...mockShardInfo, shardId },
          entityType,
          entityKey,
        };
      }
    ),
  getShardsByType: jest.fn().mockResolvedValue([]),
  getShardConnection: jest
    .fn()
    .mockImplementation(async (shardId: number, shardType: ShardType) => ({
      ...mockShardInfo,
      shardId,
      shardType,
    })),
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

describe('DataCoLocationService', () => {
  let service: DataCoLocationService;
  let mockRouter: IShardRouter;

  beforeEach(() => {
    mockRouter = createMockRouter();
    service = new DataCoLocationService(mockRouter, {
      enableContentColocation: true,
      cacheUserShardMapping: true,
      cacheTtlMs: 60000,
      cacheCleanupIntervalMs: 0,
    });
  });

  afterEach(async () => {
    await service.shutdown();
  });

  describe('initialization', () => {
    it('should start cleanup interval when configured', async () => {
      const serviceWithCleanup = new DataCoLocationService(mockRouter, {
        cacheUserShardMapping: true,
        cacheCleanupIntervalMs: 1000,
      });

      await serviceWithCleanup.initialize();
      const stats = serviceWithCleanup.getCacheStats();
      expect(stats.totalEntries).toBe(0);

      await serviceWithCleanup.shutdown();
    });

    it('should not start cleanup when disabled', async () => {
      const serviceNoCleanup = new DataCoLocationService(mockRouter, {
        cacheUserShardMapping: false,
        cacheCleanupIntervalMs: 0,
      });

      await serviceNoCleanup.initialize();
      const config = serviceNoCleanup.getConfig();
      expect(config.cacheCleanupIntervalMs).toBe(0);
    });
  });

  describe('getShardIdForUser', () => {
    it('should return consistent shard ID for same user', async () => {
      const shard1 = await service.getShardIdForUser('user-123');
      const shard2 = await service.getShardIdForUser('user-123');
      expect(shard1).toBe(shard2);
    });

    it('should cache user shard mappings', async () => {
      await service.getShardIdForUser('user-456');
      const cached = (service as any).userShardCache.get('user-456');
      expect(cached).toBeDefined();
      expect(cached.shardId).toBeDefined();
    });

    it('should track users per shard in reverse index', async () => {
      await service.getShardIdForUser('user-789');
      const reverseIndex = (service as any).reverseIndex;
      const hasUser = Array.from(reverseIndex.values() as Set<string>[]).some(
        (set) => set.has('user-789')
      );
      expect(hasUser).toBe(true);
    });

    it('should remove user from old shard when re-routed after cache invalidation', async () => {
      let callCount = 0;
      const routerWithReRoute: IShardRouter = {
        ...mockRouter,
        routeToShard: jest.fn().mockImplementation(async () => {
          callCount++;
          const shardId = callCount === 1 ? 1 : 2;
          return {
            shardId,
            shardInfo: { ...mockShardInfo, shardId },
            entityType: ShardEntityType.USER,
            entityKey: 'user-reassign',
          };
        }),
      };

      const svc = new DataCoLocationService(routerWithReRoute, {
        cacheUserShardMapping: true,
        cacheCleanupIntervalMs: 0,
        cacheTtlMs: 0,
      });

      await svc.getShardIdForUser('user-reassign');

      const initialReverseIndex = (svc as any).reverseIndex;
      expect(initialReverseIndex.get(1)?.has('user-reassign')).toBe(true);

      svc.invalidateCache('user-reassign');
      await svc.getShardIdForUser('user-reassign');

      const finalReverseIndex = (svc as any).reverseIndex;
      expect(finalReverseIndex.get(1)?.has('user-reassign')).toBe(false);
      expect(finalReverseIndex.get(2)?.has('user-reassign')).toBe(true);

      await svc.shutdown();
    });
  });

  describe('getShardForUserContent', () => {
    it('should return content shard colocated with user when enabled', async () => {
      const result = await service.getShardForUserContent(
        'user-123',
        'content-456'
      );

      expect(result.ownerUserId).toBe('user-123');
      expect(result.colocatedWithUser).toBe(true);
      expect(result.routingStrategy).toBe('direct');
    });

    it('should use user shard for content routing', async () => {
      const userShard = await service.getShardIdForUser('user-999');
      const contentResult = await service.getShardForUserContent('user-999');

      expect(contentResult.shardId).toBe(userShard);
    });

    it('should not colocate when flag disabled', async () => {
      const serviceNoColocation = new DataCoLocationService(mockRouter, {
        enableContentColocation: false,
        cacheUserShardMapping: true,
        cacheCleanupIntervalMs: 0,
      });

      const result =
        await serviceNoColocation.getShardForUserContent('user-123');

      expect(result.colocatedWithUser).toBe(false);
      expect(result.routingStrategy).toBe('fallback');

      await serviceNoColocation.shutdown();
    });
  });

  describe('getShardsForUserIds', () => {
    it('should return shard mappings for multiple users', async () => {
      const users = ['user-a', 'user-b', 'user-c'];
      const result = await service.getShardsForUserIds(users);

      expect(result.size).toBe(3);
      for (const user of users) {
        expect(result.has(user)).toBe(true);
      }
    });

    it('should use cache for subsequent calls', async () => {
      const users = ['user-x', 'user-y'];

      await service.getShardsForUserIds(users);
      await service.getShardsForUserIds(users);

      expect((mockRouter.routeToShard as jest.Mock).mock.calls.length).toBe(2);
    });

    it('should parallelize uncached lookups', async () => {
      const callTimes: number[] = [];
      const mockRouterParallel: IShardRouter = {
        ...mockRouter,
        routeToShard: jest.fn().mockImplementation(async () => {
          callTimes.push(Date.now());
          await new Promise((resolve) => setTimeout(resolve, 10));
          return {
            shardId: 1,
            shardInfo: mockShardInfo,
            entityType: ShardEntityType.USER,
            entityKey: '',
          };
        }),
      };

      const svcParallel = new DataCoLocationService(mockRouterParallel, {
        cacheUserShardMapping: true,
        cacheCleanupIntervalMs: 0,
      });
      const start = Date.now();
      await svcParallel.getShardsForUserIds(['u1', 'u2', 'u3']);
      const totalTime = Date.now() - start;

      expect(totalTime).toBeLessThan(50);

      await svcParallel.shutdown();
    });
  });

  describe('groupUserIdsByShard', () => {
    it('should group user IDs by their shard', async () => {
      const users = ['user-1', 'user-2', 'user-3', 'user-4'];
      const result = await service.groupUserIdsByShard(users);

      for (const [, userIds] of result) {
        const shardMap = await service.getShardsForUserIds(userIds);
        const uniqueShards = new Set(shardMap.values());
        expect(uniqueShards.size).toBe(1);
      }
    });
  });

  describe('getCoLocatedShardsForFeed', () => {
    it('should return unique shards for user and following', async () => {
      const shards = await service.getCoLocatedShardsForFeed('user-main', [
        'user-follow-1',
        'user-follow-2',
      ]);

      expect(Array.isArray(shards)).toBe(true);
      expect(shards.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('cache invalidation', () => {
    it('should invalidate specific user cache', async () => {
      await service.getShardIdForUser('user-to-invalidate');
      service.invalidateCache('user-to-invalidate');

      const cached = (service as any).userShardCache.get('user-to-invalidate');
      expect(cached).toBeUndefined();
    });

    it('should clear all cache when no userId provided', async () => {
      await service.getShardIdForUser('user-1');
      await service.getShardIdForUser('user-2');
      service.invalidateCache();

      const cache = (service as any).userShardCache;
      expect(cache.size).toBe(0);
    });

    it('should remove from reverse index on invalidate', async () => {
      await service.getShardIdForUser('user-idx');
      service.invalidateCache('user-idx');

      const reverseIndex = (service as any).reverseIndex;
      const hasUser = Array.from(reverseIndex.values() as Set<string>[]).some(
        (set) => set.has('user-idx')
      );
      expect(hasUser).toBe(false);
    });
  });

  describe('cache stats', () => {
    it('should return cache statistics', async () => {
      await service.getShardIdForUser('stats-user-1');
      await service.getShardIdForUser('stats-user-2');

      const stats = service.getCacheStats();
      expect(stats.totalEntries).toBe(2);
      expect(stats.oldestEntry).not.toBeNull();
      expect(stats.newestEntry).not.toBeNull();
    });
  });

  describe('configuration', () => {
    it('should return current config', () => {
      const config = service.getConfig();
      expect(config.enableContentColocation).toBe(true);
      expect(config.cacheUserShardMapping).toBe(true);
    });

    it('should update config', () => {
      service.updateConfig({ cacheTtlMs: 1000 });
      const config = service.getConfig();
      expect(config.cacheTtlMs).toBe(1000);
    });

    it('should restart cleanup interval when config changes', async () => {
      const svc = new DataCoLocationService(mockRouter, {
        cacheUserShardMapping: true,
        cacheCleanupIntervalMs: 0,
      });

      await svc.initialize();
      svc.updateConfig({ cacheCleanupIntervalMs: 100 });

      await svc.shutdown();
    });
  });
});
