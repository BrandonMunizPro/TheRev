import { ShardMetricsCollector } from '../../database/sharding/ShardMetricsCollector';
import { ShardHealthMonitor } from '../../database/sharding/ShardHealthMonitor';
import {
  IShardRouter,
  ShardType,
  ShardStatus,
} from '../../database/sharding/IShardRouter';

const createMockRouter = (): IShardRouter => ({
  routeToShard: jest
    .fn()
    .mockResolvedValue({
      shardId: 0,
      shardInfo: {},
      entityType: 'user' as any,
      entityKey: 'test',
    }),
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
  ]),
  getShardConnection: jest
    .fn()
    .mockResolvedValue({
      shardId: 0,
      shardKey: 0,
      shardType: ShardType.CONTENT,
      connectionString: 'conn0',
      status: ShardStatus.ACTIVE,
      lastStatusChange: new Date(),
    }),
  isShardHealthy: jest.fn().mockResolvedValue(true),
  getActiveShardCount: jest.fn().mockResolvedValue(2),
  addShard: jest.fn().mockResolvedValue(undefined),
  removeShard: jest.fn().mockResolvedValue(undefined),
  getAllShardHealth: jest.fn().mockResolvedValue([]),
  initialize: jest.fn().mockResolvedValue(undefined),
  shutdown: jest.fn().mockResolvedValue(undefined),
  getShardForUser: jest.fn().mockResolvedValue(0),
  configure: jest.fn(),
});

describe('ShardMetricsCollector', () => {
  let collector: ShardMetricsCollector;
  let healthMonitor: ShardHealthMonitor;
  let mockRouter: IShardRouter;

  beforeEach(() => {
    healthMonitor = new ShardHealthMonitor(1000, 1000, 2);
    healthMonitor.markShardHealthy(0, ShardType.CONTENT);
    healthMonitor.markShardHealthy(1, ShardType.CONTENT);
    mockRouter = createMockRouter();
    collector = new ShardMetricsCollector(healthMonitor, mockRouter, {
      collectionIntervalMs: 60000,
      metricsWindowMs: 300000,
      enableLatencyTracking: true,
      enableThroughputTracking: true,
    });
  });

  afterEach(() => {
    collector.stopCollection();
  });

  describe('initialization', () => {
    it('should start collection when requested', () => {
      collector.startCollection();
      expect(collector['isCollecting']).toBe(true);
      collector.stopCollection();
    });

    it('should stop collection', () => {
      collector.startCollection();
      collector.stopCollection();
      expect(collector['isCollecting']).toBe(false);
    });
  });

  describe('latency recording', () => {
    it('should record latency samples', () => {
      collector.recordLatency(0, ShardType.CONTENT, 100);
      collector.recordLatency(0, ShardType.CONTENT, 200);
      collector.recordLatency(0, ShardType.CONTENT, 300);

      const samples = collector['latencySamples'].get(`${ShardType.CONTENT}:0`);
      expect(samples?.length).toBe(3);
    });

    it('should calculate latency percentiles', async () => {
      for (let i = 1; i <= 100; i++) {
        collector.recordLatency(0, ShardType.CONTENT, i);
      }

      const metrics = await collector.getShardMetrics(0, ShardType.CONTENT);

      expect(metrics?.performance.avgLatencyMs).toBeCloseTo(50.5, 0);
      expect(metrics?.performance.p50LatencyMs).toBe(50);
      expect(metrics?.performance.p95LatencyMs).toBe(95);
    });
  });

  describe('throughput recording', () => {
    it('should record throughput samples', () => {
      collector.recordThroughput(0, ShardType.CONTENT, 10, 5);
      collector.recordThroughput(0, ShardType.CONTENT, 15, 3);

      const samples = collector['throughputSamples'].get(
        `${ShardType.CONTENT}:0`
      );
      expect(samples?.length).toBe(2);
    });

    it('should calculate queries per minute', async () => {
      collector.recordThroughput(0, ShardType.CONTENT, 100, 50);
      collector.recordThroughput(0, ShardType.CONTENT, 100, 50);

      const metrics = await collector.getShardMetrics(0, ShardType.CONTENT);

      expect(metrics?.throughput.readsPerMinute).toBeGreaterThan(0);
      expect(metrics?.throughput.writesPerMinute).toBeGreaterThan(0);
    });
  });

  describe('metrics collection', () => {
    it('should collect metrics for all shards', async () => {
      const metrics = await collector.collectMetrics();

      expect(metrics.length).toBeGreaterThan(0);
      expect(metrics[0]).toHaveProperty('health');
      expect(metrics[0]).toHaveProperty('throughput');
      expect(metrics[0]).toHaveProperty('performance');
    });

    it('should return aggregated metrics', async () => {
      const aggregated = await collector.getAggregatedMetrics();

      expect(aggregated.totalShards).toBeGreaterThan(0);
      expect(aggregated.healthyShards).toBeGreaterThan(0);
      expect(aggregated).toHaveProperty('avgResponseTime');
      expect(aggregated).toHaveProperty('totalQueriesPerMinute');
    });

    it('should get metrics for specific shard', async () => {
      const metrics = await collector.getShardMetrics(0, ShardType.CONTENT);

      expect(metrics?.shardId).toBe(0);
      expect(metrics?.shardType).toBe(ShardType.CONTENT);
    });
  });

  describe('alerts', () => {
    it('should emit high error rate alert', async () => {
      const alertData = await new Promise<any>((resolve) => {
        const collectorWithAlert = new ShardMetricsCollector(
          healthMonitor,
          mockRouter,
          {
            alertThresholdErrorRate: 0.01,
          }
        );

        collectorWithAlert.on('alert:highErrorRate', (data) => {
          resolve(data);
          collectorWithAlert.stopCollection();
        });

        setTimeout(() => {
          collectorWithAlert.stopCollection();
          resolve(null);
        }, 100);
      });

      expect(alertData).toBeDefined();
    });
  });

  describe('configuration', () => {
    it('should return current config', () => {
      const config = collector.getConfig();
      expect(config.collectionIntervalMs).toBe(60000);
    });

    it('should update config', () => {
      collector.updateConfig({ collectionIntervalMs: 30000 });
      const config = collector.getConfig();
      expect(config.collectionIntervalMs).toBe(30000);
    });

    it('should clear samples', () => {
      collector.recordLatency(0, ShardType.CONTENT, 100);
      collector.clearSamples();

      const samples = collector['latencySamples'].get(`${ShardType.CONTENT}:0`);
      expect(samples).toBeUndefined();
    });
  });
});
