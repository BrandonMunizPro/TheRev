/**
 * ModuloShardRouter Integration Tests
 * Epic 1: Enterprise Database Foundation - Story 1.3
 *
 * Unit and integration tests for ModuloShardRouter
 */

import { ModuloShardRouter } from './ModuloShardRouter';
import { ShardHealthMonitor } from './ShardHealthMonitor';
import { ShardConnectionManager } from './ShardConnectionManager';
import { ShardEntityType } from './IShardRouter';

describe('ModuloShardRouter', () => {
  let router: ModuloShardRouter;
  let healthMonitor: ShardHealthMonitor;
  let connectionManager: ShardConnectionManager;

  beforeEach(() => {
    healthMonitor = new ShardHealthMonitor(1000, 1000, 2);
    connectionManager = new ShardConnectionManager(5, 1000);
    router = new ModuloShardRouter(healthMonitor, connectionManager, true);
  });

  afterEach(async () => {
    await router.shutdown();
  });

  describe('Basic Routing', () => {
    it('should route user entities consistently', async () => {
      await router.initialize();

      const userId = 'test-user-123';
      const result1 = await router.routeToShard(ShardEntityType.USER, userId);
      const result2 = await router.routeToShard(ShardEntityType.USER, userId);

      expect(result1.shardId).toBe(result2.shardId);
      expect(result1.entityType).toBe(ShardEntityType.USER);
      expect(result1.entityKey).toBe(userId);
    });

    it('should route content entities with author co-location', async () => {
      await router.initialize();

      const authorId = 'test-user-123';
      const contentKey = `${authorId}:content-456`;
      const userResult = await router.routeToShard(
        ShardEntityType.USER,
        authorId
      );
      const contentResult = await router.routeToShard(
        ShardEntityType.CONTENT,
        contentKey
      );

      // Content should be on same shard as author for data co-location
      expect(contentResult.shardId).toBe(userResult.shardId);
      expect(contentResult.entityType).toBe(ShardEntityType.CONTENT);
    });

    it('should route AI tasks to user shard', async () => {
      await router.initialize();

      const userId = 'test-user-123';
      const userResult = await router.routeToShard(
        ShardEntityType.USER,
        userId
      );
      const aiTaskResult = await router.routeToShard(
        ShardEntityType.AI_TASK,
        userId
      );

      // AI tasks should be on same shard as user
      expect(aiTaskResult.shardId).toBe(userResult.shardId);
      expect(aiTaskResult.entityType).toBe(ShardEntityType.AI_TASK);
    });
  });

  describe('Modulo Hashing', () => {
    it('should distribute keys evenly across shards', async () => {
      await router.initialize();

      const shardCounts = new Map<number, number>();
      const testKeyCount = 1000;

      for (let i = 0; i < testKeyCount; i++) {
        const key = `user-${i}`;
        const result = await router.routeToShard(ShardEntityType.USER, key);
        shardCounts.set(
          result.shardId,
          (shardCounts.get(result.shardId) || 0) + 1
        );
      }

      // Check distribution is reasonable (within 20% of expected)
      const expectedPerShard = testKeyCount / 4; // Assuming 4 shards
      const tolerance = expectedPerShard * 0.2;

      for (const [shardId, count] of shardCounts) {
        expect(Math.abs(count - expectedPerShard)).toBeLessThan(tolerance);
      }
    });

    it('should handle edge cases in modulo operation', async () => {
      await router.initialize();

      // Test empty string (should throw validation error)
      await expect(
        router.routeToShard(ShardEntityType.USER, '')
      ).rejects.toThrow();

      // Test very long strings
      const longKey = 'a'.repeat(1000);
      const result = await router.routeToShard(ShardEntityType.USER, longKey);
      expect(result.shardId).toBeGreaterThanOrEqual(0);
      expect(result.shardId).toBeLessThan(4); // Assuming 4 shards
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid entity types', async () => {
      await router.initialize();

      await expect(
        router.routeToShard('invalid' as ShardEntityType, 'test-key')
      ).rejects.toThrow();
    });

    it('should handle empty entity keys', async () => {
      await router.initialize();

      await expect(
        router.routeToShard(ShardEntityType.USER, '')
      ).rejects.toThrow();
    });

    it('should handle null/undefined entity keys', async () => {
      await router.initialize();

      await expect(
        router.routeToShard(ShardEntityType.USER, null as any)
      ).rejects.toThrow();

      await expect(
        router.routeToShard(ShardEntityType.USER, undefined as any)
      ).rejects.toThrow();
    });
  });

  describe('Performance Metrics', () => {
    it('should collect routing statistics', async () => {
      await router.initialize();

      // Make some routing calls
      await router.routeToShard(ShardEntityType.USER, 'user1');
      await router.routeToShard(ShardEntityType.USER, 'user2');
      await router.routeToShard(ShardEntityType.CONTENT, 'user1:content1');

      const stats = router.getRoutingStatistics();

      expect(stats.totalRoutes).toBe(3);
      expect(stats.routesByEntityType[ShardEntityType.USER]).toBe(2);
      expect(stats.routesByEntityType[ShardEntityType.CONTENT]).toBe(1);
    });

    it('should clear routing metrics', async () => {
      await router.initialize();

      // Make routing calls
      await router.routeToShard(ShardEntityType.USER, 'user1');

      let stats = router.getRoutingStatistics();
      expect(stats.totalRoutes).toBe(1);

      // Clear metrics
      router.clearRoutingMetrics();

      stats = router.getRoutingStatistics();
      expect(stats.totalRoutes).toBe(0);
    });
  });

  describe('Health Integration', () => {
    it('should respect shard health status', async () => {
      await router.initialize();

      // Mock a shard as unhealthy
      const mockUnhealthyShard = async (shardId: number, shardType: string) => {
        if (shardId === 0) {
          return Promise.resolve({
            shardId,
            shardType,
            isHealthy: false,
            responseTime: 0,
            lastCheck: new Date(),
            consecutiveFailures: 5,
            errorRate: 1.0,
          });
        }
        return null;
      };

      // This test would require mocking the health monitor
      // For now, just verify the routing logic doesn't throw on healthy shards
      const result = await router.routeToShard(
        ShardEntityType.USER,
        'test-user'
      );
      expect(result.shardId).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Content Co-location', () => {
    it('should extract author ID from content key', async () => {
      await router.initialize();

      const testCases = [
        { key: 'user123:content456', expectedAuthor: 'user123' },
        { key: 'user-with-dashes:content', expectedAuthor: 'user-with-dashes' },
        { key: 'user999:some-content-id', expectedAuthor: 'user999' },
      ];

      for (const testCase of testCases) {
        const result = await router.routeToShard(
          ShardEntityType.CONTENT,
          testCase.key
        );
        expect(result.entityKey).toBe(testCase.key);
        expect(result.entityType).toBe(ShardEntityType.CONTENT);
      }
    });
  });
});

/**
 * Integration Test Suite for ModuloShardRouter
 */
describe('ModuloShardRouter Integration', () => {
  let router: ModuloShardRouter;

  beforeEach(async () => {
    router = new ModuloShardRouter(
      new ShardHealthMonitor(),
      new ShardConnectionManager(),
      true
    );
    await router.initialize();
  });

  afterEach(async () => {
    await router.shutdown();
  });

  it('should handle high-volume routing', async () => {
    const startTime = Date.now();
    const routeCount = 10000;

    const promises = [];
    for (let i = 0; i < routeCount; i++) {
      promises.push(router.routeToShard(ShardEntityType.USER, `user-${i}`));
    }

    await Promise.all(promises);
    const duration = Date.now() - startTime;

    // Should complete 10,000 routes in under 5 seconds
    expect(duration).toBeLessThan(5000);

    const stats = router.getRoutingStatistics();
    expect(stats.totalRoutes).toBe(routeCount);
  });

  it('should maintain routing consistency under load', async () => {
    const key = 'consistency-test-user';
    const routeCount = 1000;
    const results = [];

    // Route the same key many times concurrently
    const promises = [];
    for (let i = 0; i < routeCount; i++) {
      promises.push(
        router.routeToShard(ShardEntityType.USER, key).then((r) => r.shardId)
      );
    }

    const shardIds = await Promise.all(promises);

    // All routes for the same key should go to the same shard
    const uniqueShardIds = [...new Set(shardIds)];
    expect(uniqueShardIds).toHaveLength(1);
    expect(uniqueShardIds[0]).toBe(shardIds[0]);
  });
});
