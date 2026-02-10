/**
 * ModuloShardRouter Implementation
 * MVP implementation using modulo hashing (user_id % shard_count)
 * Designed for simple deployment with clear upgrade path to consistent hashing
 */

import {
  BaseShardRouter,
  ShardRouteResult,
  ShardEntityType,
  ShardType,
  ShardConfig,
  ShardStatus,
  ShardInfo,
} from './IShardRouter';
import {
  ValidationError,
  SystemError,
  SHARD_ROUTING_ERROR,
  INVALID_SHARD_CONFIGURATION,
} from '../../errors/AppError';
import { ShardHealthMonitor } from './ShardHealthMonitor';
import { ShardConnectionManager } from './ShardConnectionManager';
import { v4 as uuidv4 } from 'uuid';

export class ModuloShardRouter extends BaseShardRouter {
  private readonly routingMetrics: Map<string, RoutingMetrics>;
  private readonly enableRoutingMetrics: boolean;

  constructor(
    healthMonitor: ShardHealthMonitor,
    connectionManager: ShardConnectionManager,
    enableMetrics: boolean = true
  ) {
    super(healthMonitor, connectionManager);
    this.routingMetrics = new Map();
    this.enableRoutingMetrics = enableMetrics;

    console.log(
      'ModuloShardRouter initialized with metrics:',
      enableMetrics
    );
  }

  /**
   * Entity specific shard selection using modulo hashing
   * ROUTING STRATEGY:
   * - Users: user_id % shard_count (Shard 0 for MVP)
   * - Content: author_id % shard_count (data co location with author)
   * - AI Tasks: user_id % shard_count (owner based sharding)
   * - Sessions: user_id % shard_count (session follows user)
   * - AI Accounts: user_id % shard_count (accounts follow user)
   */
  protected selectShardId(
    entityType: ShardEntityType,
    entityKey: string,
    config: ShardConfig
  ): number {
    const routingKey = this.extractRoutingKey(entityType, entityKey);
    const shardId = this.computeModuloHash(routingKey, config.totalShards);

    // Validate routing result
    this.validateShardSelection(
      shardId,
      config.totalShards,
      entityType,
      entityKey
    );

    // Record routing metrics if enabled
    if (this.enableRoutingMetrics) {
      this.recordRoutingMetrics(entityType, routingKey, shardId);
    }

    console.debug(
      `Route ${entityType}:${entityKey} -> Shard ${shardId} (${routingKey})`
    );
    return shardId;
  }

  /**
   * Enhanced routeToShard with entityspecific logic and error handling
   */
  async routeToShard(
    entityType: ShardEntityType,
    entityKey: string
  ): Promise<ShardRouteResult> {
    const startTime = Date.now();
    let error: Error | null = null;

    try {
      this.validateRoutingInput(entityType, entityKey);
      const config = this.getShardConfigForEntity(entityType);
      if (!config) {
        throw new ValidationError(
          `No shard configuration found for entity type: ${entityType}`,
          {
            field: 'entityType',
            value: entityType,
            errorCode: INVALID_SHARD_CONFIGURATION.toString(),
          }
        );
      }

      //Select shard using modulo hashing
      const shardId = this.selectShardId(entityType, entityKey, config);

      //Fast health check using cached metrics
      this.assertShardHealthy(shardId, config.shardType);

      const shardInfo = await this.getShardConnection(
        shardId,
        config.shardType
      );

      this.validateShardForEntityType(shardInfo, entityType);

      const routingTime = Date.now() - startTime;

      return {
        shardId,
        shardInfo,
        entityType,
        entityKey,
      };
    } catch (err) {
      error = err as Error;
      const routingTime = Date.now() - startTime;

      console.error(`Routing failed for ${entityType}:${entityKey}`, {
        error: error.message,
        routingTime,
        entityType,
        entityKey,
      });

      throw this.enhanceRoutingError(error as Error, entityType, entityKey);
    } finally {
      // Record performance metrics
      const routingTime = Date.now() - startTime;
      this.recordPerformanceMetrics(entityType, routingTime, error !== null);
    }
  }

  /**
   * Extract routing key based on entity type and sharding strategy
   */
  private extractRoutingKey(
    entityType: ShardEntityType,
    entityKey: string
  ): string {
    switch (entityType) {
      case ShardEntityType.USER:
      case ShardEntityType.USER_SESSION:
      case ShardEntityType.USER_AI_ACCOUNT:
      case ShardEntityType.AI_TASK:
        // For user related entities, the entityKey is already the routing key
        return entityKey;

      case ShardEntityType.CONTENT:
        // For content, we need to extract the author_id
        // In production, this might involve a lookup in user_directory
        // For MVP, we'll assume the entityKey contains author information
        // or use a content-specific hashing strategy
        return this.extractAuthorFromContentKey(entityKey);

      default:
        throw new ValidationError(
          `Unsupported entity type for routing: ${entityType}`,
          {
            field: 'entityType',
            value: entityType,
            errorCode: INVALID_SHARD_CONFIGURATION.toString(),
          }
        );
    }
  }

  /**
   * MVP IMPLEMENTATION: Simple modulo hashing
   *
   * LIMITATIONS:
   * - Adding shards reshuffles ALL data
   * - Not suitable for dynamic scaling
   * - Hot spots possible with uneven user distribution
   *
   * UPGRADE PATH:
   * - Consistent hashing (rendezvous hash)
   * - Virtual nodes for better distribution
   * - Load aware routing
   */
  private computeModuloHash(routingKey: string, totalShards: number): number {
    if (totalShards <= 0) {
      throw new ValidationError('Invalid shard count for modulo operation', {
        field: 'totalShards',
        value: totalShards,
        errorCode: INVALID_SHARD_CONFIGURATION.toString(),
      });
    }

    // Use the improved hash function from BaseShardRouter
    const hash = this.generateHash(routingKey);
    const shardId = hash % totalShards;

    return Math.abs(shardId);
  }

  /**
   * Extract author ID from content key
   * For MVP, we'll use a simple strategy
   * In production, this would involve directory lookups
   */
  private extractAuthorFromContentKey(contentKey: string): string {
    // Strategy 1: Content key includes author (format: "author_id:content_id")
    if (contentKey.includes(':')) {
      const [authorId] = contentKey.split(':');
      return authorId;
    }

    // Strategy 2: Use content key directly (less optimal, but works for MVP)
    // This means content might not be perfectly co-located
    console.warn(
      `Content key without author prefix: ${contentKey}. May affect co-location.`
    );
    return contentKey;
  }

  /**
   * Validate shard selection results
   */
  private validateShardSelection(
    shardId: number,
    totalShards: number,
    entityType: ShardEntityType,
    entityKey: string
  ): void {
    if (shardId < 0 || shardId >= totalShards) {
      throw new SystemError(
        `Invalid shard selection: ${shardId} for ${totalShards} shards`,
        SHARD_ROUTING_ERROR,
        {
          field: 'shardId',
          value: shardId,
          resource: `${entityType}:${entityKey}`,
          originalError: `Expected range 0-${totalShards - 1}`,
        }
      );
    }
  }

  private validateRoutingInput(
    entityType: ShardEntityType,
    entityKey: string
  ): void {
    if (!entityKey || entityKey.trim().length === 0) {
      throw new ValidationError('Entity key cannot be empty', {
        field: 'entityKey',
        value: entityKey,
        errorCode: INVALID_SHARD_CONFIGURATION.toString(),
      });
    }

    if (!Object.values(ShardEntityType).includes(entityType)) {
      throw new ValidationError(`Invalid entity type: ${entityType}`, {
        field: 'entityType',
        value: entityType,
        errorCode: INVALID_SHARD_CONFIGURATION.toString(),
      });
    }
  }

  /**
   * Validate that the shard can handle the entity type
   */
  private validateShardForEntityType(
    shardInfo: ShardInfo,
    entityType: ShardEntityType
  ): void {
    // Check shard status
    if (
      shardInfo.status !== ShardStatus.ACTIVE &&
      shardInfo.status !== ShardStatus.READ_ONLY
    ) {
      throw new SystemError(
        `Shard ${shardInfo.shardType}:${shardInfo.shardId} is not available (status: ${shardInfo.status})`,
        SHARD_ROUTING_ERROR,
        {
          field: 'shardId',
          value: shardInfo.shardId,
          resource: `${shardInfo.shardType}:${shardInfo.shardId}`,
          originalError: `Shard status: ${shardInfo.status}`,
        }
      );
    }

    // For content, ensure we're not routing to the wrong shard type
    if (
      entityType === ShardEntityType.CONTENT &&
      shardInfo.shardType !== ShardType.CONTENT
    ) {
      throw new SystemError(
        `Content entity routed to non-content shard: ${shardInfo.shardType}`,
        SHARD_ROUTING_ERROR,
        {
          field: 'shardType',
          value: shardInfo.shardType,
          resource: `${entityType}`,
          originalError: `Expected: ${ShardType.CONTENT}`,
        }
      );
    }
  }

  /**
   * Enhance routing errors with additional context
   */
  private enhanceRoutingError(
    error: Error,
    entityType: ShardEntityType,
    entityKey: string
  ): Error {
    if (error instanceof SystemError || error instanceof ValidationError) {
      // Add routing context to existing structured errors
      return new SystemError(error.message, error.errorCode, {
        ...error.details,
        entityType,
        entityKey,
        requestId: uuidv4(), // Add request ID for tracing
      });
    }

    // Wrap unstructured errors
    return new SystemError(
      `Routing failed for ${entityType}:${entityKey} - ${error.message}`,
      SHARD_ROUTING_ERROR,
      {
        entityType,
        entityKey,
        requestId: uuidv4(),
        originalError: error.message,
      }
    );
  }

  private recordRoutingMetrics(
    entityType: ShardEntityType,
    routingKey: string,
    shardId: number
  ): void {
    const key = `${entityType}:${routingKey}`;
    const existing = this.routingMetrics.get(key);

    if (existing) {
      existing.requestCount++;
      existing.lastAccessed = new Date();
      existing.shardId = shardId; // Track final shard assignment
    } else {
      this.routingMetrics.set(key, {
        entityType,
        routingKey,
        shardId,
        requestCount: 1,
        firstAccessed: new Date(),
        lastAccessed: new Date(),
      });
    }
  }

  private recordPerformanceMetrics(
    entityType: ShardEntityType,
    routingTime: number,
    hadError: boolean
  ): void {
    if (!this.enableRoutingMetrics) return;

    // Log performance data for monitoring
    const performanceKey = `routing_performance:${entityType}`;
    console.debug(performanceKey, {
      routingTime,
      hadError,
      entityType,
      timestamp: new Date().toISOString(),
    });
  }

  public getRoutingStatistics(): {
    totalRoutes: number;
    routesByEntityType: Record<string, number>;
    averageRoutingTime: number;
    errorRate: number;
  } {
    const routesByEntityType: Record<string, number> = {};
    let totalRoutes = 0;

    for (const metrics of this.routingMetrics.values()) {
      totalRoutes += metrics.requestCount;
      routesByEntityType[metrics.entityType] =
        (routesByEntityType[metrics.entityType] || 0) + metrics.requestCount;
    }

    return {
      totalRoutes,
      routesByEntityType,
      averageRoutingTime: 0, // Would need timing data for this
      errorRate: 0, // Would need error tracking for this
    };
  }

  public clearRoutingMetrics(): void {
    this.routingMetrics.clear();
    console.log('Routing metrics cleared');
  }
}

/**
 * Internal routing metrics structure
 */
interface RoutingMetrics {
  entityType: ShardEntityType;
  routingKey: string;
  shardId: number;
  requestCount: number;
  firstAccessed: Date;
  lastAccessed: Date;
}
