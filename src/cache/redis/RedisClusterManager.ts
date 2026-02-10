/**
 * Redis Cluster Manager Implementation
 * Manages Redis cluster connections, health monitoring, and failover
 * Provides high availability caching and queue management
 */

import { EventEmitter } from 'events';
import Redis from 'redis';
import {
  RedisClusterConfig,
  RedisNode,
  RedisClusterOptions,
  RedisMonitoringConfig,
  RedisHealthMetrics,
  RedisNodeStatus,
  RedisAlertThresholds,
} from './RedisTypes';
import { v4 as uuidv4 } from 'uuid';
import {
  SystemError,
  ValidationError,
  SERVICE_UNAVAILABLE,
  DATABASE_ERROR,
} from '../../errors/AppError';

export class RedisClusterManager extends EventEmitter {
  private cluster: ReturnType<typeof Redis.createCluster> | null = null;
  private nodes: Map<string, ReturnType<typeof Redis.createClient>> = new Map();
  private config: RedisClusterConfig;
  private isInitialized = false;
  private healthMetrics: Map<string, RedisHealthMetrics> = new Map();
  private monitoringInterval: NodeJS.Timeout | null = null;
  private connectionRetries = new Map<string, number>();

  constructor(config: RedisClusterConfig) {
    super();
    this.config = config;
    this.validateConfig();
  }

  /**
   * Initialize Redis cluster with health monitoring
   */
  async initialize(): Promise<void> {
    try {
      console.log('Initializing Redis cluster...');

      // Create Redis cluster
      this.cluster = new Redis.Cluster(this.config.nodes, {
        enableReadyCheck: this.config.options.enableReadyCheck ?? true,
        redisOptions: this.config.options.redisOptions ?? {},
        maxRedirections: this.config.options.maxRedirections ?? 16,
        retryDelayOnFailover: this.config.options.retryDelayOnFailover ?? 100,
        retryDelayOnClusterDown:
          this.config.options.retryDelayOnClusterDown ?? 300,
        slotsRefreshTimeout: this.config.options.slotsRefreshTimeout ?? 1000,
        slotsRefreshInterval: this.config.options.slotsRefreshInterval ?? 5000,
      });

      // Set up cluster event listeners
      this.setupClusterEventListeners();

      // Connect to individual nodes for health monitoring
      await this.connectToNodes();

      // Start health monitoring
      if (this.config.monitoring.enabled) {
        this.startHealthMonitoring();
      }

      // Wait for cluster to be ready
      await this.cluster.ping();

      this.isInitialized = true;
      console.log('Redis cluster initialized successfully');
      this.emit('cluster:initialized');
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error('Failed to initialize Redis cluster:', error);
      throw new SystemError(
        `Redis cluster initialization failed: ${errorMessage}`,
        SERVICE_UNAVAILABLE,
        {
          originalError: errorMessage,
          timestamp: new Date().toISOString(),
        }
      );
    }
  }

  getCluster(): Redis.Cluster {
    if (!this.cluster || !this.isInitialized) {
      throw new SystemError(
        'Redis cluster not initialized',
        SERVICE_UNAVAILABLE
      );
    }
    return this.cluster;
  }

  /**
   * Execute command on cluster with retry logic
   */
  async executeCommand<T = any>(command: string, ...args: any[]): Promise<T> {
    const cluster = this.getCluster();

    try {
      const result = await cluster.call(command, ...args);
      return result;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(`Redis command failed: ${command}`, {
        args,
        error: errorMessage,
        timestamp: new Date().toISOString(),
      });

      throw new SystemError(
        `Redis command execution failed: ${errorMessage}`,
        DATABASE_ERROR,
        {
          originalError: errorMessage,
          timestamp: new Date().toISOString(),
        }
      );
    }
  }

  /**
   * Get health status of entire cluster
   */
  async getClusterHealth(): Promise<{
    isHealthy: boolean;
    nodeCount: number;
    healthyNodes: number;
    totalConnections: number;
    averageResponseTime: number;
    nodes: Array<{
      nodeId: string;
      host: string;
      port: number;
      status: RedisNodeStatus;
      responseTime: number;
      connections: number;
    }>;
  }> {
    const nodeHealthPromises = Array.from(this.nodes.entries()).map(
      async ([nodeId, node]) => {
        try {
          const startTime = Date.now();
          await node.ping();
          const responseTime = Date.now() - startTime;
          const info = await node.info('memory');

          const metrics: RedisHealthMetrics = {
            nodeId,
            isHealthy: true,
            lastHealthCheck: new Date(),
            responseTime,
            memoryUsage: this.parseMemoryUsage(info),
            connectionCount: parseInt(
              (await node.client('list')?.length) || '0'
            ),
            errorCount: 0,
            uptime: 0,
          };

          this.healthMetrics.set(nodeId, metrics);

          return {
            nodeId,
            host: this.getNodeHost(nodeId),
            port: this.getNodePort(nodeId),
            status: RedisNodeStatus.HEALTHY,
            responseTime,
            connections: metrics.connectionCount,
          };
        } catch (error) {
          return {
            nodeId,
            host: this.getNodeHost(nodeId),
            port: this.getNodePort(nodeId),
            status: RedisNodeStatus.UNHEALTHY,
            responseTime: -1,
            connections: 0,
          };
        }
      }
    );

    const nodeHealthResults = await Promise.allSettled(nodeHealthPromises);
    const healthyNodes = nodeHealthResults.filter(
      (result) =>
        result.status === 'fulfilled' &&
        result.value.status === RedisNodeStatus.HEALTHY
    );

    const totalConnections = Array.from(this.healthMetrics.values()).reduce(
      (sum, metrics) => sum + metrics.connectionCount,
      0
    );

    const averageResponseTime =
      Array.from(this.healthMetrics.values()).reduce(
        (sum, metrics) => sum + metrics.responseTime,
        0
      ) / this.healthMetrics.size;

    return {
      isHealthy: healthyNodes.length === this.nodes.size,
      nodeCount: this.nodes.size,
      healthyNodes: healthyNodes.length,
      totalConnections,
      averageResponseTime,
      nodes: nodeHealthResults
        .filter((result) => result.status === 'fulfilled')
        .map((result) => (result as any).value),
    };
  }

  async shutdown(): Promise<void> {
    try {
      console.log('Shutting down Redis cluster...');

      // Stop health monitoring
      if (this.monitoringInterval) {
        clearInterval(this.monitoringInterval);
        this.monitoringInterval = null;
      }

      // Disconnect from all nodes
      const disconnectPromises = Array.from(this.nodes.values()).map((node) =>
        node.quit()
      );
      await Promise.allSettled(disconnectPromises);
      this.nodes.clear();

      // Disconnect cluster
      if (this.cluster) {
        await this.cluster.quit();
        this.cluster = null;
      }

      this.isInitialized = false;
      console.log('Redis cluster shutdown successfully');
      this.emit('cluster:shutdown');
    } catch (error) {
      console.error('Error during Redis cluster shutdown:', error);
      throw error;
    }
  }

  /**
   * Set up cluster event listeners for failover and node events
   */
  private setupClusterEventListeners(): void {
    if (!this.cluster) return;

    this.cluster.on('connect', () => {
      console.log('Redis cluster connected');
      this.emit('cluster:connected');
    });

    this.cluster.on('ready', () => {
      console.log('Redis cluster ready');
      this.emit('cluster:ready');
    });

    this.cluster.on('error', (error) => {
      console.error('Redis cluster error:', error);
      this.emit('cluster:error', error);
    });

    this.cluster.on('close', () => {
      console.log('Redis cluster connection closed');
      this.emit('cluster:closed');
    });

    this.cluster.on('node error', (error, node) => {
      console.error(
        `Redis node error: ${node.options.host}:${node.options.port}`,
        error
      );
      this.handleNodeError(node, error);
    });

    this.cluster.on('+node', (node) => {
      console.log(
        `➕ Redis node added: ${node.options.host}:${node.options.port}`
      );
      this.handleNodeAdded(node);
    });

    this.cluster.on('-node', (node) => {
      console.log(
        `➖ Redis node removed: ${node.options.host}:${node.options.port}`
      );
      this.handleNodeRemoved(node);
    });
  }

  /**
   * Connect to individual Redis nodes for health monitoring
   */
  private async connectToNodes(): Promise<void> {
    for (const redisNode of this.config.nodes) {
      const nodeId = `${redisNode.host}:${redisNode.port}`;

      try {
        const node = new Redis({
          host: redisNode.host,
          port: redisNode.port,
          password: redisNode.password,
          db: redisNode.db || 0,
          maxRetriesPerRequest: redisNode.maxRetriesPerRequest || 3,
          lazyConnect: redisNode.lazyConnect || true,
          keepAlive: redisNode.keepAlive || 30000,
          family: redisNode.family || 4,
          retryDelayOnFailover: 100,
        });

        await node.ping();
        this.nodes.set(nodeId, node);
        console.log(`Connected to Redis node: ${nodeId}`);
      } catch (error) {
        console.error(`Failed to connect to Redis node: ${nodeId}`, error);
        throw new SystemError(
          `Failed to connect to Redis node ${nodeId}: ${error.message}`,
          SERVICE_UNAVAILABLE
        );
      }
    }
  }

  /**
   * Start health monitoring for all nodes
   */
  private startHealthMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }

    this.monitoringInterval = setInterval(async () => {
      await this.performHealthChecks();
    }, this.config.monitoring.healthCheckInterval);

    console.log('Redis cluster health monitoring started');
  }

  /**
   * Perform health checks on all nodes
   */
  private async performHealthChecks(): Promise<void> {
    const healthCheckPromises = Array.from(this.nodes.entries()).map(
      async ([nodeId, node]) => {
        try {
          const startTime = Date.now();
          await node.ping();
          const responseTime = Date.now() - startTime;

          const info = await node.info('memory,clients');
          const metrics = this.parseNodeInfo(info, nodeId, responseTime);

          this.healthMetrics.set(nodeId, metrics);
          this.checkAlertThresholds(nodeId, metrics);
        } catch (error) {
          console.warn(
            `Health check failed for node ${nodeId}:`,
            error.message
          );
          this.handleNodeHealthFailure(nodeId);
        }
      }
    );

    await Promise.allSettled(healthCheckPromises);
  }

  /**
   * Parse Redis INFO command response
   */
  private parseNodeInfo(
    info: string,
    nodeId: string,
    responseTime: number
  ): RedisHealthMetrics {
    const lines = info.split('\r\n');
    const parsed: any = {};

    for (const line of lines) {
      if (line.includes(':')) {
        const [key, value] = line.split(':');
        parsed[key] = value;
      }
    }

    return {
      nodeId,
      isHealthy: true,
      lastHealthCheck: new Date(),
      responseTime,
      memoryUsage: this.parseMemoryUsage(info),
      connectionCount: parseInt(parsed.connected_clients || '0'),
      errorCount: 0,
      uptime: parseInt(parsed.uptime_in_seconds || '0'),
    };
  }

  /**
   * Parse memory usage from Redis INFO
   */
  private parseMemoryUsage(info: string): number {
    const usedMemoryMatch = info.match(/used_memory:(\d+)/);
    const maxMemoryMatch = info.match(/maxmemory:(\d+)/);

    if (usedMemoryMatch && maxMemoryMatch) {
      const used = parseInt(usedMemoryMatch[1]);
      const max = parseInt(maxMemoryMatch[1]);
      return (used / max) * 100;
    }

    return 0;
  }

  /**
   * Check if node metrics exceed alert thresholds
   */
  private checkAlertThresholds(
    nodeId: string,
    metrics: RedisHealthMetrics
  ): void {
    const thresholds = this.config.monitoring.alertThresholds;
    const alerts = [];

    if (metrics.memoryUsage > thresholds.memoryUsage) {
      alerts.push(`Memory usage: ${metrics.memoryUsage.toFixed(1)}%`);
    }

    if (metrics.responseTime > thresholds.responseTime) {
      alerts.push(`Response time: ${metrics.responseTime}ms`);
    }

    if (metrics.connectionCount > thresholds.connectionCount) {
      alerts.push(`Connection count: ${metrics.connectionCount}`);
    }

    if (alerts.length > 0) {
      this.emit('node:alert', {
        nodeId,
        alerts,
        metrics,
        timestamp: new Date(),
      });
    }
  }

  /**
   * Handle node error events
   */
  private handleNodeError(node: Redis.Redis, error: Error): void {
    const nodeId = `${node.options.host}:${node.options.port}`;
    console.warn(`Node error: ${nodeId}`, error);

    this.emit('node:error', {
      nodeId,
      error,
      timestamp: new Date(),
    });
  }

  private handleNodeAdded(node: Redis.Redis): void {
    const nodeId = `${node.options.host}:${node.options.port}`;
    console.log(`➕ Node added to cluster: ${nodeId}`);

    this.emit('node:added', {
      nodeId,
      timestamp: new Date(),
    });
  }

  private handleNodeRemoved(node: Redis.Redis): void {
    const nodeId = `${node.options.host}:${node.options.port}`;
    console.log(`➖ Node removed from cluster: ${nodeId}`);

    this.nodes.delete(nodeId);
    this.healthMetrics.delete(nodeId);

    this.emit('node:removed', {
      nodeId,
      timestamp: new Date(),
    });
  }

  /**
   * Handle node health failures
   */
  private handleNodeHealthFailure(nodeId: string): void {
    const currentRetries = this.connectionRetries.get(nodeId) || 0;
    const newRetries = currentRetries + 1;
    this.connectionRetries.set(nodeId, newRetries);

    this.emit('node:health-failure', {
      nodeId,
      retryCount: newRetries,
      timestamp: new Date(),
    });
  }

  /**
   * Get node host from node ID
   */
  private getNodeHost(nodeId: string): string {
    return nodeId.split(':')[0];
  }

  /**
   * Get node port from node ID
   */
  private getNodePort(nodeId: string): number {
    return parseInt(nodeId.split(':')[1]);
  }

  private validateConfig(): void {
    if (!this.config.nodes || this.config.nodes.length === 0) {
      throw new ValidationError('Redis cluster must have at least one node', {
        field: 'nodes',
        value: this.config.nodes,
      });
    }

    if (!this.config.monitoring) {
      this.config.monitoring = {
        enabled: true,
        healthCheckInterval: 30000,
        metricsCollectionInterval: 60000,
        alertThresholds: {
          memoryUsage: 80,
          cpuUsage: 80,
          connectionCount: 1000,
          queueDepth: 1000,
          responseTime: 1000,
          errorRate: 5,
        },
      };
    }

    // Validate each node configuration
    for (const node of this.config.nodes) {
      if (!node.host || !node.port) {
        throw new ValidationError('Each Redis node must have host and port', {
          field: 'node',
          value: node,
        });
      }
    }
  }
}
