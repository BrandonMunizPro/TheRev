/**
 * Base Sharded DAO
 * Abstract base class for shard aware data access
 * Routes operations to correct shard based on routing key
 */

import { Repository, EntityTarget } from 'typeorm';
import {
  IShardRouter,
  ShardEntityType,
  ShardType,
} from '../../database/sharding/IShardRouter';
import { DataCoLocationService } from '../../database/sharding/DataCoLocationService';
import { ShardConnectionManager } from '../../database/sharding/ShardConnectionManager';
import { NotFoundError, ErrorCode } from '../../errors/AppError';

export interface ShardedDaoConfig {
  entityShardType: ShardType;
  entityTarget: EntityTarget<any>;
  enableContentColocation: boolean;
  crossShardQueriesEnabled: boolean;
}

export interface MultiShardResult<T = any> {
  results: Map<number, T[]>;
  totalCount: number;
  shardsQueried: number[];
}

export abstract class BaseShardedDao {
  protected shardRouter: IShardRouter;
  protected connectionManager: ShardConnectionManager;
  protected coLocationService?: DataCoLocationService;
  protected config: ShardedDaoConfig;

  constructor(
    shardRouter: IShardRouter,
    connectionManager: ShardConnectionManager,
    config: ShardedDaoConfig,
    coLocationService?: DataCoLocationService
  ) {
    this.shardRouter = shardRouter;
    this.connectionManager = connectionManager;
    this.config = config;
    this.coLocationService = coLocationService;
  }

  protected abstract getEntityName(): string;
  protected abstract getEntityTarget(): EntityTarget<any>;

  protected async getRepository(
    shardId?: number,
    shardType?: ShardType
  ): Promise<Repository<any>> {
    const targetShardType = shardType || this.config.entityShardType;
    const targetShardId = shardId ?? 0;

    const dataSource = await this.connectionManager.getConnection(
      targetShardId,
      targetShardType
    );
    return dataSource.getRepository(this.getEntityTarget());
  }

  protected async routeToShard(
    routingKey: string,
    entityType?: ShardEntityType
  ): Promise<{ shardId: number; shardType: ShardType }> {
    const entity = entityType || this.getDefaultEntityType();
    const result = await this.shardRouter.routeToShard(entity, routingKey);
    return { shardId: result.shardId, shardType: result.shardInfo.shardType };
  }

  protected getDefaultEntityType(): ShardEntityType {
    switch (this.config.entityShardType) {
      case ShardType.USERS:
        return ShardEntityType.USER;
      case ShardType.CONTENT:
        return ShardEntityType.CONTENT;
      case ShardType.AI_TASKS:
        return ShardEntityType.AI_TASK;
      default:
        return ShardEntityType.USER;
    }
  }

  async findById(id: string, userId?: string): Promise<any> {
    const { shardId, shardType } = await this.resolveShardForEntity(id, userId);
    const repo = await this.getRepository(shardId, shardType);
    return repo.findOne({ where: { id } });
  }

  async findByIds(ids: string[], userId?: string): Promise<any[]> {
    if (ids.length === 0) return [];

    const shardMap = await this.groupIdsByShard(ids, userId);
    const results: any[] = [];

    for (const [shardId, entityIds] of shardMap) {
      const repo = await this.getRepository(
        shardId,
        this.config.entityShardType
      );
      const entities = await repo.find({
        where: entityIds.map((eId) => ({ id: eId })),
      });
      results.push(...entities);
    }

    return results;
  }

  async create(data: any, userId?: string): Promise<any> {
    const routingKey = this.getRoutingKey(data, userId);
    const { shardId, shardType } = await this.routeToShard(routingKey);
    const repo = await this.getRepository(shardId, shardType);

    const entity = repo.create(data);
    return repo.save(entity);
  }

  async update(id: string, data: any, userId?: string): Promise<any> {
    const { shardId, shardType } = await this.resolveShardForEntity(id, userId);
    const repo = await this.getRepository(shardId, shardType);

    await repo.update({ id }, data);
    const updated = await repo.findOne({ where: { id } });

    if (!updated) {
      const entityName = this.getEntityName();
      const errorCode =
        entityName === 'User'
          ? ErrorCode.USER_NOT_FOUND
          : entityName === 'Thread'
            ? ErrorCode.THREAD_NOT_FOUND
            : entityName === 'Post'
              ? ErrorCode.POST_NOT_FOUND
              : ErrorCode.INVALID_INPUT;
      throw new NotFoundError(
        `${entityName} with id ${id} not found`,
        errorCode,
        { field: 'id', value: id }
      );
    }
    return updated;
  }

  async delete(id: string, userId?: string): Promise<boolean> {
    const { shardId, shardType } = await this.resolveShardForEntity(id, userId);
    const repo = await this.getRepository(shardId, shardType);

    const result = await repo.delete({ id });
    return (result.affected ?? 0) === 1;
  }

  async queryMultipleShards(
    shardIds: number[],
    queryFn: () => Promise<any[]>
  ): Promise<MultiShardResult> {
    const results = new Map<number, any[]>();
    const shardsQueried: number[] = [];

    for (const shardId of shardIds) {
      try {
        const shardResults = await queryFn();
        results.set(shardId, shardResults);
        shardsQueried.push(shardId);
      } catch (error) {
        console.warn(`Failed to query shard ${shardId}:`, error);
      }
    }

    let totalCount = 0;
    for (const entities of results.values()) {
      totalCount += entities.length;
    }

    return { results, totalCount, shardsQueried };
  }

  async findAll(shardId?: number): Promise<any[]> {
    const repo = await this.getRepository(shardId);
    return repo.find();
  }

  async findAllByUserId(userId: string): Promise<any[]> {
    const { shardId, shardType } = await this.resolveShardForContent(userId);
    const repo = await this.getRepository(shardId, shardType);

    return repo.find({
      where: { author: { id: userId } },
      relations: ['author'],
    });
  }

  protected async resolveShardForEntity(
    entityId: string,
    userId?: string
  ): Promise<{ shardId: number; shardType: ShardType }> {
    if (
      this.config.enableContentColocation &&
      this.coLocationService &&
      userId
    ) {
      try {
        const shardId = await this.coLocationService.getShardIdForUser(userId);
        return { shardId, shardType: this.config.entityShardType };
      } catch {
        // Fall through to routing
      }
    }
    return this.routeToShard(entityId);
  }

  protected async resolveShardForContent(
    ownerUserId: string
  ): Promise<{ shardId: number; shardType: ShardType }> {
    if (this.config.enableContentColocation && this.coLocationService) {
      try {
        const shardId =
          await this.coLocationService.getShardIdForUser(ownerUserId);
        return { shardId, shardType: ShardType.CONTENT };
      } catch {
        // Fall through to routing
      }
    }
    return this.routeToShard(ownerUserId, ShardEntityType.CONTENT);
  }

  protected async groupIdsByShard(
    ids: string[],
    userId?: string
  ): Promise<Map<number, string[]>> {
    const shardMap = new Map<number, string[]>();

    for (const id of ids) {
      const { shardId } = await this.resolveShardForEntity(id, userId);
      const existing = shardMap.get(shardId) || [];
      existing.push(id);
      shardMap.set(shardId, existing);
    }

    return shardMap;
  }

  protected getRoutingKey(data: any, userId?: string): string {
    if (userId) return userId;
    if (data.userId) return data.userId;
    if (data.authorId) return data.authorId;
    if (data.ownerId) return data.ownerId;
    return 'unknown';
  }
}
