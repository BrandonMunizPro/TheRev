/**
 * SmartShardRouter Implementation
 * Extends ModuloShardRouter with hot user detection
 * - Tracks user activity over time windows
 * - Identifies hot users (high activity) vs cold users
 * - Applies different routing strategies based on user temperature
 * - Supports dedicated hot shard or replication for high-traffic users
 */

import {
  BaseShardRouter,
  ShardRouteResult,
  ShardEntityType,
  ShardType,
  ShardConfig,
} from './IShardRouter';
import { ModuloShardRouter } from './ModuloShardRouter';
import { ShardHealthMonitor } from './ShardHealthMonitor';
import { ShardConnectionManager } from './ShardConnectionManager';

export interface HotUserConfig {
  enabled: boolean;
  hotUserThreshold: number;
  activityWindowMs: number;
  hotShardId?: number;
  enableHotUserReplication: boolean;
  cooldownPeriodMs: number;
  enableDecay: boolean;
  decayFactor: number;
  enableHotShardFallback: boolean;
}

export interface UserActivityMetrics {
  userId: string;
  requestCount: number;
  lastActivityAt: Date;
  isHot: boolean;
  totalRequests: number;
  averageRequestsPerMinute: number;
  becameHotAt?: Date;
  activityScore: number;
}

export interface SmartRoutingResult extends ShardRouteResult {
  isHotUser: boolean;
  routingStrategy: 'standard' | 'hot_user_dedicated' | 'hot_user_replicated';
}

export class SmartShardRouter extends ModuloShardRouter {
  private userActivityMap: Map<string, UserActivityMetrics>;
  private hotUserSet: Set<string>;
  private config: HotUserConfig;
  private activityCleanupInterval: NodeJS.Timeout | null;

  constructor(
    healthMonitor: ShardHealthMonitor,
    connectionManager: ShardConnectionManager,
    hotUserConfig: Partial<HotUserConfig> = {},
    enableMetrics: boolean = true
  ) {
    super(healthMonitor, connectionManager, enableMetrics);

    this.config = {
      enabled: hotUserConfig.enabled ?? true,
      hotUserThreshold: hotUserConfig.hotUserThreshold ?? 100,
      activityWindowMs: hotUserConfig.activityWindowMs ?? 60000,
      hotShardId: hotUserConfig.hotShardId,
      enableHotUserReplication: hotUserConfig.enableHotUserReplication ?? false,
      cooldownPeriodMs: hotUserConfig.cooldownPeriodMs ?? 300000,
      enableDecay: hotUserConfig.enableDecay ?? true,
      decayFactor: hotUserConfig.decayFactor ?? 0.9,
      enableHotShardFallback: hotUserConfig.enableHotShardFallback ?? true,
    };

    this.userActivityMap = new Map();
    this.hotUserSet = new Set();
    this.activityCleanupInterval = null;

    console.log('SmartShardRouter initialized with hot user detection:', {
      enabled: this.config.enabled,
      hotUserThreshold: this.config.hotUserThreshold,
      activityWindowMs: this.config.activityWindowMs,
    });
  }

  /**
   * Initialize router and start activity cleanup
   */
  async initialize(): Promise<void> {
    await super.initialize();
    this.startActivityCleanup();
  }

  /**
   * Graceful shutdown
   */
  async shutdown(): Promise<void> {
    if (this.activityCleanupInterval) {
      clearInterval(this.activityCleanupInterval);
      this.activityCleanupInterval = null;
    }
    await super.shutdown();
  }

  /**
   * Smart route with hot user detection
   */
  async routeToShard(
    entityType: ShardEntityType,
    entityKey: string
  ): Promise<SmartRoutingResult> {
    const isHotUser = this.isHotUserDetectionEnabled()
      ? this.trackAndCheckHotUser(entityKey, entityType)
      : false;

    const routingStrategy = this.determineRoutingStrategy(isHotUser);

    const baseResult = await super.routeToShard(entityType, entityKey);

    return {
      ...baseResult,
      isHotUser,
      routingStrategy,
    };
  }

  /**
   * Check if hot user detection is enabled
   */
  private isHotUserDetectionEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Track user activity and determine if user is hot (with decay and proper cooldown)
   */
  private trackAndCheckHotUser(
    entityKey: string,
    entityType: ShardEntityType
  ): boolean {
    if (!this.shouldTrackEntity(entityType)) {
      return false;
    }

    const userId = this.extractUserId(entityKey, entityType);
    if (!userId) {
      return false;
    }

    const now = new Date();
    let metrics = this.userActivityMap.get(userId);

    if (!metrics) {
      metrics = {
        userId,
        requestCount: 1,
        lastActivityAt: now,
        isHot: false,
        totalRequests: 1,
        averageRequestsPerMinute: 0,
        activityScore: 1,
      };
      this.userActivityMap.set(userId, metrics);
      return false;
    }

    const timeSinceLastActivity =
      now.getTime() - metrics.lastActivityAt.getTime();

    if (timeSinceLastActivity > this.config.activityWindowMs) {
      metrics.requestCount = 0;
      metrics.activityScore = 0;
    }

    metrics.requestCount++;
    metrics.totalRequests++;
    metrics.lastActivityAt = now;

    const previousHotStatus = metrics.isHot;

    if (this.config.enableDecay) {
      metrics.activityScore =
        metrics.activityScore * this.config.decayFactor + 1;
    } else {
      metrics.activityScore = metrics.requestCount;
    }

    if (
      metrics.activityScore >= this.config.hotUserThreshold &&
      !metrics.isHot
    ) {
      metrics.isHot = true;
      metrics.becameHotAt = now;
      this.hotUserSet.add(userId);
    }

    if (metrics.isHot && metrics.becameHotAt) {
      const timeAsHot = now.getTime() - metrics.becameHotAt.getTime();
      if (
        timeAsHot > this.config.cooldownPeriodMs &&
        metrics.activityScore < this.config.hotUserThreshold
      ) {
        metrics.isHot = false;
        metrics.becameHotAt = undefined;
        this.hotUserSet.delete(userId);
      }
    }

    const windowMinutes = this.config.activityWindowMs / 60000;
    metrics.averageRequestsPerMinute = metrics.requestCount / windowMinutes;

    return metrics.isHot;
  }

  /**
   * Determine which routing strategy to use
   */
  private determineRoutingStrategy(
    isHotUser: boolean
  ): 'standard' | 'hot_user_dedicated' | 'hot_user_replicated' {
    if (!isHotUser) {
      return 'standard';
    }

    if (this.config.hotShardId !== undefined) {
      return 'hot_user_dedicated';
    }

    if (this.config.enableHotUserReplication) {
      return 'hot_user_replicated';
    }

    return 'standard';
  }

  /**
   * Check if entity type should be tracked for hot user detection
   */
  private shouldTrackEntity(entityType: ShardEntityType): boolean {
    return (
      entityType === ShardEntityType.USER ||
      entityType === ShardEntityType.AI_TASK ||
      entityType === ShardEntityType.CONTENT
    );
  }

  /**
   * Extract user ID from entity key
   */
  private extractUserId(
    entityKey: string,
    entityType: ShardEntityType
  ): string | null {
    switch (entityType) {
      case ShardEntityType.USER:
        return entityKey;

      case ShardEntityType.CONTENT:
        const colonIndex = entityKey.indexOf(':');
        return colonIndex > 0 ? entityKey.substring(0, colonIndex) : entityKey;

      case ShardEntityType.AI_TASK:
        return entityKey;

      case ShardEntityType.USER_SESSION:
      case ShardEntityType.USER_AI_ACCOUNT:
        return entityKey;

      default:
        return null;
    }
  }

  /**
   * Override shard selection for hot users with fallback for unhealthy hot shards
   */
  protected selectShardId(
    entityType: ShardEntityType,
    entityKey: string,
    config: ShardConfig
  ): number {
    const userId = this.extractUserId(entityKey, entityType);

    if (
      userId &&
      this.hotUserSet.has(userId) &&
      this.config.hotShardId !== undefined
    ) {
      if (this.config.enableHotShardFallback) {
        const healthMonitor = this.shardHealthMonitor as any;
        const health = healthMonitor.getHealthMetrics
          ? healthMonitor.getHealthMetrics()
          : null;

        const hotShardHealth = Array.isArray(health)
          ? health.find(
              (h: any) =>
                h.shardId === this.config.hotShardId &&
                h.shardType === config.shardType
            )
          : null;

        if (!hotShardHealth || !hotShardHealth.isHealthy) {
          console.debug(
            `Hot shard ${this.config.hotShardId} is unhealthy, falling back to standard routing for ${userId}`
          );
          return super.selectShardId(entityType, entityKey, config);
        }
      }

      console.debug(
        `Hot user ${userId} routed to dedicated hot shard ${this.config.hotShardId}`
      );
      return this.config.hotShardId;
    }

    return super.selectShardId(entityType, entityKey, config);
  }

  /**
   * Start periodic cleanup of stale activity data
   */
  private startActivityCleanup(): void {
    const cleanupIntervalMs = this.config.activityWindowMs;

    this.activityCleanupInterval = setInterval(() => {
      this.cleanupStaleActivityData();
    }, cleanupIntervalMs);

    this.activityCleanupInterval.unref();
  }

  /**
   * Remove stale activity data and update hot user status
   */
  private cleanupStaleActivityData(): void {
    const now = new Date();
    let cleanedCount = 0;

    for (const [userId, metrics] of this.userActivityMap.entries()) {
      const timeSinceLastActivity =
        now.getTime() - metrics.lastActivityAt.getTime();

      if (timeSinceLastActivity > this.config.activityWindowMs * 2) {
        this.userActivityMap.delete(userId);
        this.hotUserSet.delete(userId);
        cleanedCount++;
      } else if (metrics.requestCount < this.config.hotUserThreshold) {
        if (metrics.isHot) {
          metrics.isHot = false;
          this.hotUserSet.delete(userId);
        }
      }
    }

    if (cleanedCount > 0) {
      console.debug(`Cleaned up ${cleanedCount} stale user activity records`);
    }
  }

  /**
   * Get current hot user count
   */
  getHotUserCount(): number {
    return this.hotUserSet.size;
  }

  /**
   * Get all hot users
   */
  getHotUsers(): string[] {
    return Array.from(this.hotUserSet);
  }

  /**
   * Get activity metrics for a specific user
   */
  getUserActivityMetrics(userId: string): UserActivityMetrics | null {
    return this.userActivityMap.get(userId) || null;
  }

  /**
   * Get all user activity metrics
   */
  getAllActivityMetrics(): UserActivityMetrics[] {
    return Array.from(this.userActivityMap.values());
  }

  /**
   * Get hot user statistics
   */
  getHotUserStats(): {
    hotUserCount: number;
    totalTrackedUsers: number;
    hotUserPercentage: number;
    averageRequestsPerHotUser: number;
  } {
    const allMetrics = Array.from(this.userActivityMap.values());
    const hotUsers = allMetrics.filter((m) => m.isHot);
    const avgRequests =
      hotUsers.length > 0
        ? hotUsers.reduce((sum, m) => sum + m.averageRequestsPerMinute, 0) /
          hotUsers.length
        : 0;

    return {
      hotUserCount: this.hotUserSet.size,
      totalTrackedUsers: allMetrics.length,
      hotUserPercentage:
        allMetrics.length > 0
          ? (this.hotUserSet.size / allMetrics.length) * 100
          : 0,
      averageRequestsPerHotUser: avgRequests,
    };
  }

  /**
   * Manually mark a user as hot (for testing or admin control)
   */
  markUserAsHot(userId: string): void {
    this.hotUserSet.add(userId);
    const metrics = this.userActivityMap.get(userId);
    if (metrics) {
      metrics.isHot = true;
      metrics.becameHotAt = new Date();
      metrics.activityScore = this.config.hotUserThreshold;
    } else {
      this.userActivityMap.set(userId, {
        userId,
        requestCount: this.config.hotUserThreshold,
        lastActivityAt: new Date(),
        isHot: true,
        totalRequests: this.config.hotUserThreshold,
        averageRequestsPerMinute: this.config.hotUserThreshold,
        becameHotAt: new Date(),
        activityScore: this.config.hotUserThreshold,
      });
    }
    console.log(`User ${userId} manually marked as hot`);
  }

  /**
   * Manually remove hot status from user
   */
  markUserAsCold(userId: string): void {
    this.hotUserSet.delete(userId);
    const metrics = this.userActivityMap.get(userId);
    if (metrics) {
      metrics.isHot = false;
      metrics.becameHotAt = undefined;
      metrics.activityScore = 0;
    }
    console.log(`User ${userId} marked as cold`);
  }

  /**
   * Update hot user configuration
   */
  updateHotUserConfig(newConfig: Partial<HotUserConfig>): void {
    this.config = {
      ...this.config,
      ...newConfig,
    };
    console.log('Hot user config updated:', this.config);
  }

  /**
   * Get current configuration
   */
  getHotUserConfig(): HotUserConfig {
    return { ...this.config };
  }

  /**
   * for testing
   */
  clearActivityData(): void {
    this.userActivityMap.clear();
    this.hotUserSet.clear();
    console.log('All activity data cleared');
  }
}
