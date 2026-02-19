//SmartShardRouter Tests

import {
  SmartShardRouter,
  HotUserConfig,
} from '../../database/sharding/SmartShardRouter';
import { ShardHealthMonitor } from '../../database/sharding/ShardHealthMonitor';
import { ShardConnectionManager } from '../../database/sharding/ShardConnectionManager';
import {
  ShardEntityType,
  ShardType,
  ShardConfig,
} from '../../database/sharding/IShardRouter';

describe('SmartShardRouter', () => {
  let router: SmartShardRouter;
  let healthMonitor: ShardHealthMonitor;
  let connectionManager: ShardConnectionManager;

  const createTestConfig = (shardType: ShardType): ShardConfig => ({
    totalShards: 4,
    shardType,
    connectionStrings: [
      `postgresql://localhost:5432/therev_${shardType}_0`,
      `postgresql://localhost:5432/therev_${shardType}_1`,
      `postgresql://localhost:5432/therev_${shardType}_2`,
      `postgresql://localhost:5432/therev_${shardType}_3`,
    ],
  });

  const hotUserConfig: HotUserConfig = {
    enabled: true,
    hotUserThreshold: 10,
    activityWindowMs: 60000,
    hotShardId: 3,
    enableHotUserReplication: false,
    cooldownPeriodMs: 300000,
    enableDecay: false,
    decayFactor: 0.9,
    enableHotShardFallback: true,
  };

  beforeEach(async () => {
    healthMonitor = new ShardHealthMonitor(1000, 1000, 2);
    connectionManager = new ShardConnectionManager(5, 1000);
    router = new SmartShardRouter(
      healthMonitor,
      connectionManager,
      hotUserConfig,
      true
    );

    router.configure(ShardType.USERS, createTestConfig(ShardType.USERS));
    router.configure(ShardType.CONTENT, createTestConfig(ShardType.CONTENT));
    router.configure(ShardType.AI_TASKS, createTestConfig(ShardType.AI_TASKS));

    for (let i = 0; i < 4; i++) {
      healthMonitor.markShardHealthy(i, ShardType.USERS);
      healthMonitor.markShardHealthy(i, ShardType.CONTENT);
      healthMonitor.markShardHealthy(i, ShardType.AI_TASKS);
    }

    await router.initialize();
  });

  afterEach(async () => {
    await router.shutdown();
  });

  describe('Hot User Detection', () => {
    it('should detect hot user after threshold requests', async () => {
      const userId = 'hot-user-test';

      for (let i = 0; i < 10; i++) {
        const result = await router.routeToShard(ShardEntityType.USER, userId);
        expect(result.isHotUser).toBe(i >= 9);
      }

      expect(router.getHotUserCount()).toBe(1);
    });

    it('should not mark user as hot below threshold', async () => {
      const userId = 'cold-user-test';

      for (let i = 0; i < 5; i++) {
        const result = await router.routeToShard(ShardEntityType.USER, userId);
        expect(result.isHotUser).toBe(false);
      }

      expect(router.getHotUserCount()).toBe(0);
    });

    it('should track multiple hot users independently', async () => {
      const user1 = 'user-1';
      const user2 = 'user-2';

      for (let i = 0; i < 10; i++) {
        await router.routeToShard(ShardEntityType.USER, user1);
      }

      for (let i = 0; i < 10; i++) {
        await router.routeToShard(ShardEntityType.USER, user2);
      }

      expect(router.getHotUserCount()).toBe(2);
      expect(router.getHotUsers()).toContain(user1);
      expect(router.getHotUsers()).toContain(user2);
    });
  });

  describe('Routing Strategies', () => {
    it('should use standard routing for cold users', async () => {
      const result = await router.routeToShard(
        ShardEntityType.USER,
        'cold-user'
      );

      expect(result.routingStrategy).toBe('standard');
      expect(result.isHotUser).toBe(false);
    });

    it('should use hot_user_dedicated when hotShardId configured', async () => {
      const userId = 'hot-user-dedicated';

      for (let i = 0; i < 10; i++) {
        await router.routeToShard(ShardEntityType.USER, userId);
      }

      const result = await router.routeToShard(ShardEntityType.USER, userId);

      expect(result.routingStrategy).toBe('hot_user_dedicated');
      expect(result.shardId).toBe(3);
      expect(result.isHotUser).toBe(true);
    });

    it('should return routing strategy in result', async () => {
      const userId = 'strategy-test-user';

      const coldResult = await router.routeToShard(
        ShardEntityType.USER,
        userId
      );
      expect(coldResult.routingStrategy).toBeDefined();

      for (let i = 0; i < 10; i++) {
        await router.routeToShard(ShardEntityType.USER, userId);
      }

      const hotResult = await router.routeToShard(ShardEntityType.USER, userId);
      expect(hotResult.routingStrategy).toBe('hot_user_dedicated');
    });
  });

  describe('Activity Metrics', () => {
    it('should track user activity metrics', async () => {
      const userId = 'metrics-test-user';

      for (let i = 0; i < 5; i++) {
        await router.routeToShard(ShardEntityType.USER, userId);
      }

      const metrics = router.getUserActivityMetrics(userId);

      expect(metrics).not.toBeNull();
      expect(metrics?.requestCount).toBe(5);
      expect(metrics?.totalRequests).toBe(5);
      expect(metrics?.isHot).toBe(false);
    });

    it('should get hot user statistics', async () => {
      const user1 = 'stats-user-1';
      const user2 = 'stats-user-2';

      for (let i = 0; i < 10; i++) {
        await router.routeToShard(ShardEntityType.USER, user1);
      }

      for (let i = 0; i < 3; i++) {
        await router.routeToShard(ShardEntityType.USER, user2);
      }

      const stats = router.getHotUserStats();

      expect(stats.hotUserCount).toBe(1);
      expect(stats.totalTrackedUsers).toBe(2);
      expect(stats.hotUserPercentage).toBe(50);
    });

    it('should return null for non-tracked user', async () => {
      const metrics = router.getUserActivityMetrics('non-existent-user');
      expect(metrics).toBeNull();
    });
  });

  describe('Manual Hot User Management', () => {
    it('should manually mark user as hot', () => {
      router.markUserAsHot('manual-hot-user');

      expect(router.getHotUserCount()).toBe(1);
      expect(router.getHotUsers()).toContain('manual-hot-user');

      const metrics = router.getUserActivityMetrics('manual-hot-user');
      expect(metrics?.isHot).toBe(true);
    });

    it('should manually mark user as cold', () => {
      router.markUserAsHot('manual-hot-user');
      router.markUserAsCold('manual-hot-user');

      expect(router.getHotUserCount()).toBe(0);
      expect(router.getHotUsers()).not.toContain('manual-hot-user');
    });
  });

  describe('Content Entity Hot User Detection', () => {
    it('should detect hot user from content entity', async () => {
      const userId = 'content-hot-user';
      const contentKey = `${userId}:content-123`;

      for (let i = 0; i < 10; i++) {
        await router.routeToShard(ShardEntityType.CONTENT, contentKey);
      }

      const result = await router.routeToShard(
        ShardEntityType.CONTENT,
        contentKey
      );

      expect(result.isHotUser).toBe(true);
    });
  });

  describe('Configuration', () => {
    it('should return current hot user config', () => {
      const config = router.getHotUserConfig();

      expect(config.enabled).toBe(true);
      expect(config.hotUserThreshold).toBe(10);
      expect(config.hotShardId).toBe(3);
    });

    it('should update configuration at runtime', () => {
      router.updateHotUserConfig({ hotUserThreshold: 50, hotShardId: 2 });

      const config = router.getHotUserConfig();
      expect(config.hotUserThreshold).toBe(50);
      expect(config.hotShardId).toBe(2);
    });
  });

  describe('Activity Data Cleanup', () => {
    it('should clear all activity data', async () => {
      const userId = 'cleanup-test-user';

      for (let i = 0; i < 10; i++) {
        await router.routeToShard(ShardEntityType.USER, userId);
      }

      expect(router.getHotUserCount()).toBe(1);

      router.clearActivityData();

      expect(router.getHotUserCount()).toBe(0);
      expect(router.getUserActivityMetrics(userId)).toBeNull();
    });
  });

  describe('AI Task Hot User Detection', () => {
    it('should detect hot user from AI task entity', async () => {
      const userId = 'ai-task-hot-user';

      for (let i = 0; i < 10; i++) {
        await router.routeToShard(ShardEntityType.AI_TASK, userId);
      }

      const result = await router.routeToShard(ShardEntityType.AI_TASK, userId);

      expect(result.isHotUser).toBe(true);
      expect(result.routingStrategy).toBe('hot_user_dedicated');
    });
  });
});

describe('SmartShardRouter with Replication', () => {
  let router: SmartShardRouter;
  let healthMonitor: ShardHealthMonitor;
  let connectionManager: ShardConnectionManager;

  const createTestConfig = (shardType: ShardType): ShardConfig => ({
    totalShards: 4,
    shardType,
    connectionStrings: [
      `postgresql://localhost:5432/therev_${shardType}_0`,
      `postgresql://localhost:5432/therev_${shardType}_1`,
      `postgresql://localhost:5432/therev_${shardType}_2`,
      `postgresql://localhost:5432/therev_${shardType}_3`,
    ],
  });

  beforeEach(async () => {
    healthMonitor = new ShardHealthMonitor();
    connectionManager = new ShardConnectionManager();

    router = new SmartShardRouter(
      healthMonitor,
      connectionManager,
      {
        enabled: true,
        hotUserThreshold: 5,
        activityWindowMs: 60000,
        hotShardId: undefined,
        enableHotUserReplication: true,
        cooldownPeriodMs: 300000,
        enableDecay: false,
        decayFactor: 0.9,
        enableHotShardFallback: true,
      },
      true
    );

    router.configure(ShardType.USERS, createTestConfig(ShardType.USERS));

    for (let i = 0; i < 4; i++) {
      healthMonitor.markShardHealthy(i, ShardType.USERS);
    }

    await router.initialize();
  });

  afterEach(async () => {
    await router.shutdown();
  });

  it('should use replicated strategy when hotShardId not set but replication enabled', async () => {
    const userId = 'replicated-hot-user';

    for (let i = 0; i < 5; i++) {
      await router.routeToShard(ShardEntityType.USER, userId);
    }

    const result = await router.routeToShard(ShardEntityType.USER, userId);

    expect(result.routingStrategy).toBe('hot_user_replicated');
    expect(result.isHotUser).toBe(true);
  });
});
