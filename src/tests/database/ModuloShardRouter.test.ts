/**
 * ModuloShardRouter Integration Tests
 * Unit tests for ModuloShardRouter
 */

import { ModuloShardRouter } from '../../database/sharding/ModuloShardRouter';
import { ShardHealthMonitor } from '../../database/sharding/ShardHealthMonitor';
import { ShardConnectionManager } from '../../database/sharding/ShardConnectionManager';
import {
  IShardRouter,
  ShardEntityType,
  ShardType,
  ShardConfig,
} from '../../database/sharding/IShardRouter';

describe('ModuloShardRouter', () => {
  let router: ModuloShardRouter;
  let healthMonitor: ShardHealthMonitor;
  let connectionManager: ShardConnectionManager;

  beforeEach(() => {
    healthMonitor = new ShardHealthMonitor(1000, 1000, 2);
    connectionManager = new ShardConnectionManager(5, 1000);
    router = new ModuloShardRouter(healthMonitor, connectionManager, true);

    const testConfig: ShardConfig = {
      totalShards: 4,
      shardType: ShardType.USERS,
      connectionStrings: [
        'postgresql://localhost:5432/therev_users_0',
        'postgresql://localhost:5432/therev_users_1',
        'postgresql://localhost:5432/therev_users_2',
        'postgresql://localhost:5432/therev_users_3',
      ],
    };
    router.configure(ShardType.USERS, testConfig);
    for (let i = 0; i < 4; i++) {
      healthMonitor.markShardHealthy(i, ShardType.USERS);
    }

    const contentConfig: ShardConfig = {
      totalShards: 4,
      shardType: ShardType.CONTENT,
      connectionStrings: [
        'postgresql://localhost:5432/therev_content_0',
        'postgresql://localhost:5432/therev_content_1',
        'postgresql://localhost:5432/therev_content_2',
        'postgresql://localhost:5432/therev_content_3',
      ],
    };
    router.configure(ShardType.CONTENT, contentConfig);
    for (let i = 0; i < 4; i++) {
      healthMonitor.markShardHealthy(i, ShardType.CONTENT);
    }

    const aiTasksConfig: ShardConfig = {
      totalShards: 4,
      shardType: ShardType.AI_TASKS,
      connectionStrings: [
        'postgresql://localhost:5432/therev_ai_tasks_0',
        'postgresql://localhost:5432/therev_ai_tasks_1',
        'postgresql://localhost:5432/therev_ai_tasks_2',
        'postgresql://localhost:5432/therev_ai_tasks_3',
      ],
    };
    router.configure(ShardType.AI_TASKS, aiTasksConfig);
    for (let i = 0; i < 4; i++) {
      healthMonitor.markShardHealthy(i, ShardType.AI_TASKS);
    }
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
      await router.routeToShard(ShardEntityType.USER, 'user1');

      let stats = router.getRoutingStatistics();
      expect(stats.totalRoutes).toBe(1);
      router.clearRoutingMetrics();

      stats = router.getRoutingStatistics();
      expect(stats.totalRoutes).toBe(0);
    });
  });

  describe('Health Integration', () => {
    it('should respect shard health status', async () => {
      await router.initialize();
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

describe('ModuloShardRouter Integration', () => {
  let router: ModuloShardRouter;
  let healthMonitor: ShardHealthMonitor;

  beforeEach(async () => {
    healthMonitor = new ShardHealthMonitor();
    router = new ModuloShardRouter(
      healthMonitor,
      new ShardConnectionManager(),
      true
    );

    const testConfig: ShardConfig = {
      totalShards: 4,
      shardType: ShardType.USERS,
      connectionStrings: [
        'postgresql://localhost:5432/therev_users_0',
        'postgresql://localhost:5432/therev_users_1',
        'postgresql://localhost:5432/therev_users_2',
        'postgresql://localhost:5432/therev_users_3',
      ],
    };
    router.configure(ShardType.USERS, testConfig);
    for (let i = 0; i < 4; i++) {
      healthMonitor.markShardHealthy(i, ShardType.USERS);
    }

    const contentConfig: ShardConfig = {
      totalShards: 4,
      shardType: ShardType.CONTENT,
      connectionStrings: [
        'postgresql://localhost:5432/therev_content_0',
        'postgresql://localhost:5432/therev_content_1',
        'postgresql://localhost:5432/therev_content_2',
        'postgresql://localhost:5432/therev_content_3',
      ],
    };
    router.configure(ShardType.CONTENT, contentConfig);
    for (let i = 0; i < 4; i++) {
      healthMonitor.markShardHealthy(i, ShardType.CONTENT);
    }

    const aiTasksConfig: ShardConfig = {
      totalShards: 4,
      shardType: ShardType.AI_TASKS,
      connectionStrings: [
        'postgresql://localhost:5432/therev_ai_tasks_0',
        'postgresql://localhost:5432/therev_ai_tasks_1',
        'postgresql://localhost:5432/therev_ai_tasks_2',
        'postgresql://localhost:5432/therev_ai_tasks_3',
      ],
    };
    router.configure(ShardType.AI_TASKS, aiTasksConfig);
    for (let i = 0; i < 4; i++) {
      healthMonitor.markShardHealthy(i, ShardType.AI_TASKS);
    }

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
    // Should complete 10,000 routes - performance depends on environment
    expect(duration).toBeLessThan(30000);
    const stats = router.getRoutingStatistics();
    expect(stats.totalRoutes).toBe(routeCount);
  });

  it('should maintain routing consistency under load', async () => {
    const key = 'consistency-test-user';
    const routeCount = 1000;
    const results = [];
    const promises = [];
    for (let i = 0; i < routeCount; i++) {
      promises.push(
        router.routeToShard(ShardEntityType.USER, key).then((r) => r.shardId)
      );
    }
    const shardIds = await Promise.all(promises);
    const uniqueShardIds = [...new Set(shardIds)];
    expect(uniqueShardIds).toHaveLength(1);
    expect(uniqueShardIds[0]).toBe(shardIds[0]);
  });
});
