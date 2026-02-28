/**
 * Shard Aware Threads DAO
 * Extends BaseShardedDao for thread operations with shard routing
 * Supports content co-location with author user
 */

import { EntityTarget } from 'typeorm';
import { Thread } from '../../entities/Thread';
import { ShardType } from '../../database/sharding/IShardRouter';
import {
  BaseShardedDao,
  ShardedDaoConfig,
  MultiShardResult,
} from './BaseShardedDao';
import { IShardRouter } from '../../database/sharding/IShardRouter';
import { ShardConnectionManager } from '../../database/sharding/ShardConnectionManager';
import { DataCoLocationService } from '../../database/sharding/DataCoLocationService';

export class ShardedThreadsDao extends BaseShardedDao {
  constructor(
    shardRouter: IShardRouter,
    connectionManager: ShardConnectionManager,
    coLocationService?: DataCoLocationService
  ) {
    const config: ShardedDaoConfig = {
      entityShardType: ShardType.CONTENT,
      entityTarget: Thread,
      enableContentColocation: true,
      crossShardQueriesEnabled: true,
    };
    super(shardRouter, connectionManager, config, coLocationService);
  }

  protected getEntityName(): string {
    return 'Thread';
  }

  protected getEntityTarget(): EntityTarget<any> {
    return Thread;
  }

  async findById(id: string, authorId?: string): Promise<any> {
    return super.findById(id, authorId);
  }

  async createThread(data: any, authorId?: string): Promise<any> {
    return super.create(data, authorId);
  }

  async updateThread(id: string, data: any, authorId?: string): Promise<any> {
    return super.update(id, data, authorId);
  }

  async deleteThread(id: string, authorId?: string): Promise<boolean> {
    return super.delete(id, authorId);
  }

  async findAllByUserId(userId: string): Promise<any[]> {
    return super.findAllByUserId(userId);
  }

  async findByAuthorIdWithPagination(
    authorId: string,
    limit: number,
    offset: number
  ): Promise<{ threads: any[]; total: number }> {
    const { shardId, shardType } = await this.resolveShardForContent(authorId);
    const repo = await this.getRepository(shardId, shardType);

    const [threads, total] = await repo.findAndCount({
      where: { author: { id: authorId } },
      relations: ['author'],
      take: limit,
      skip: offset,
      order: { createdAt: 'DESC' },
    });

    return { threads, total };
  }

  async findThreadsByIdsAcrossShards(threadIds: string[]): Promise<any[]> {
    return super.findByIds(threadIds);
  }

  async queryAllShards(
    shardIds: number[],
    options?: { limit?: number; offset?: number }
  ): Promise<MultiShardResult> {
    return super.queryMultipleShards(shardIds, async () => {
      const allResults: any[] = [];
      for (const shardId of shardIds) {
        const repo = await this.getRepository(shardId, ShardType.CONTENT);
        const results = await repo.find({
          take: options?.limit,
          skip: options?.offset,
          order: { createdAt: 'DESC' },
          relations: ['author'],
        });
        allResults.push(...results);
      }
      return allResults;
    });
  }
}
