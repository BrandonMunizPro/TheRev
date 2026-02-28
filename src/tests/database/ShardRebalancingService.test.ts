// ShardRebalancingService Tests

import {
  ShardRebalancingService,
  RebalancingConfig,
} from '../../database/sharding/ShardRebalancingService';
import { ShardHealthMonitor } from '../../database/sharding/ShardHealthMonitor';
import { ShardMetricsCollector } from '../../database/sharding/ShardMetricsCollector';
import { ModuloShardRouter } from '../../database/sharding/ModuloShardRouter';
import { ShardConnectionManager } from '../../database/sharding/ShardConnectionManager';
import {
  ShardType,
  ShardConfig,
  ShardEntityType,
} from '../../database/sharding/IShardRouter';

describe('ShardRebalancingService', () => {
  let rebalancingService: ShardRebalancingService;
  let healthMonitor: ShardHealthMonitor;
  let metricsCollector: ShardMetricsCollector;
  let shardRouter: ModuloShardRouter;
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

  const rebalancingConfig: Partial<RebalancingConfig> = {
    enableAutoRebalancing: false,
    loadImbalanceThreshold: 0.3,
    storageImbalanceThreshold: 0.25,
    hotUserImbalanceThreshold: 0.2,
    maxSuggestionsPerAnalysis: 5,
  };

  beforeEach(async () => {
    healthMonitor = new ShardHealthMonitor(1000, 1000, 2);
    connectionManager = new ShardConnectionManager(5, 1000);
    shardRouter = new ModuloShardRouter(
      healthMonitor,
      connectionManager,
      false
    );

    shardRouter.configure(ShardType.USERS, createTestConfig(ShardType.USERS));
    shardRouter.configure(
      ShardType.CONTENT,
      createTestConfig(ShardType.CONTENT)
    );
    shardRouter.configure(
      ShardType.AI_TASKS,
      createTestConfig(ShardType.AI_TASKS)
    );

    for (let i = 0; i < 4; i++) {
      healthMonitor.markShardHealthy(i, ShardType.USERS);
      healthMonitor.markShardHealthy(i, ShardType.CONTENT);
      healthMonitor.markShardHealthy(i, ShardType.AI_TASKS);
    }

    metricsCollector = new ShardMetricsCollector(healthMonitor, shardRouter, {
      collectionIntervalMs: 60000,
      enableLatencyTracking: true,
      enableThroughputTracking: true,
    });

    rebalancingService = new ShardRebalancingService(
      healthMonitor,
      metricsCollector,
      undefined,
      rebalancingConfig
    );
  });

  afterEach(async () => {
    rebalancingService.stopAutoAnalysis();
  });

  describe('Analysis', () => {
    it('should analyze shard type and return analysis result', async () => {
      const analysis = await rebalancingService.analyzeShardType(
        ShardType.CONTENT
      );

      expect(analysis).toBeDefined();
      expect(analysis.shardType).toBe(ShardType.CONTENT);
      expect(analysis.loadDistribution).toBeDefined();
      expect(analysis.storageDistribution).toBeDefined();
      expect(analysis.suggestions).toBeDefined();
      expect(analysis.overallBalanceScore).toBeGreaterThanOrEqual(0);
      expect(analysis.overallBalanceScore).toBeLessThanOrEqual(100);
    });

    it('should calculate balance score based on distribution', async () => {
      const analysis = await rebalancingService.analyzeShardType(
        ShardType.CONTENT
      );

      expect(typeof analysis.overallBalanceScore).toBe('number');
      expect(analysis.overallBalanceScore).toBeGreaterThanOrEqual(0);
    });

    it('should analyze all shard types', async () => {
      const analyses = await rebalancingService.analyzeAllShardTypes();

      expect(analyses).toHaveLength(3);
      expect(analyses.map((a) => a.shardType)).toContain(ShardType.USERS);
      expect(analyses.map((a) => a.shardType)).toContain(ShardType.CONTENT);
      expect(analyses.map((a) => a.shardType)).toContain(ShardType.AI_TASKS);
    });

    it('should cache last analysis', async () => {
      await rebalancingService.analyzeShardType(ShardType.CONTENT);
      const cached = rebalancingService.getLastAnalysis(ShardType.CONTENT);

      expect(cached).toBeDefined();
      expect(cached?.shardType).toBe(ShardType.CONTENT);
    });
  });

  describe('Load Imbalance Detection', () => {
    it('should generate load-based suggestions when imbalance is detected', async () => {
      for (let i = 0; i < 20; i++) {
        metricsCollector.recordThroughput(0, ShardType.CONTENT, 100, 50);
      }
      for (let i = 1; i < 4; i++) {
        metricsCollector.recordThroughput(i, ShardType.CONTENT, 10, 5);
      }

      const analysis = await rebalancingService.analyzeShardType(
        ShardType.CONTENT
      );
      const loadImbalanceSuggestions = analysis.suggestions.filter(
        (s) => s.type === 'migrate_data'
      );

      expect(loadImbalanceSuggestions.length).toBeGreaterThan(0);
    });
  });

  describe('Suggestion Generation', () => {
    it('should generate suggestions with proper structure', async () => {
      const analysis = await rebalancingService.analyzeShardType(
        ShardType.CONTENT
      );

      analysis.suggestions.forEach((suggestion) => {
        expect(suggestion.id).toBeDefined();
        expect(suggestion.type).toBeDefined();
        expect(suggestion.priority).toBeDefined();
        expect(['critical', 'high', 'medium', 'low']).toContain(
          suggestion.priority
        );
        expect(suggestion.estimatedImpact).toBeDefined();
        expect(suggestion.reasoning).toBeDefined();
        expect(suggestion.createdAt).toBeDefined();
      });
    });

    it('should limit suggestions to max configured', async () => {
      const limitedConfig = {
        ...rebalancingConfig,
        maxSuggestionsPerAnalysis: 2,
      };

      const service = new ShardRebalancingService(
        healthMonitor,
        metricsCollector,
        undefined,
        limitedConfig
      );

      const analysis = await service.analyzeShardType(ShardType.CONTENT);

      expect(analysis.suggestions.length).toBeLessThanOrEqual(2);
    });
  });

  describe('Configuration', () => {
    it('should return current configuration', () => {
      const config = rebalancingService.getConfig();

      expect(config).toBeDefined();
      expect(config.loadImbalanceThreshold).toBe(0.3);
      expect(config.storageImbalanceThreshold).toBe(0.25);
    });

    it('should update configuration', () => {
      rebalancingService.updateConfig({ loadImbalanceThreshold: 0.5 });

      const config = rebalancingService.getConfig();
      expect(config.loadImbalanceThreshold).toBe(0.5);
    });
  });

  describe('Summary Generation', () => {
    it('should generate summary for analysis', async () => {
      const analysis = await rebalancingService.analyzeShardType(
        ShardType.CONTENT
      );

      expect(analysis.summary).toBeDefined();
      expect(typeof analysis.summary).toBe('string');
    });
  });
});
