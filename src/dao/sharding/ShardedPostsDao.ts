/**
 * Shard-Aware Posts DAO
 * Extends BaseShardedDao for post operations with shard routing
 * Supports content co-location with author user
 */

import { EntityTarget } from 'typeorm';
import { Post } from '../../entities/Post';
import { ShardType } from '../../database/sharding/IShardRouter';
import {
  BaseShardedDao,
  ShardedDaoConfig,
  MultiShardResult,
} from './BaseShardedDao';
import { IShardRouter } from '../../database/sharding/IShardRouter';
import { ShardConnectionManager } from '../../database/sharding/ShardConnectionManager';
import { DataCoLocationService } from '../../database/sharding/DataCoLocationService';

export class ShardedPostsDao extends BaseShardedDao {
  constructor(
    shardRouter: IShardRouter,
    connectionManager: ShardConnectionManager,
    coLocationService?: DataCoLocationService
  ) {
    const config: ShardedDaoConfig = {
      entityShardType: ShardType.CONTENT,
      entityTarget: Post,
      enableContentColocation: true,
      crossShardQueriesEnabled: true,
    };
    super(shardRouter, connectionManager, config, coLocationService);
  }

  protected getEntityName(): string {
    return 'Post';
  }

  protected getEntityTarget(): EntityTarget<any> {
    return Post;
  }

  async findById(id: string, authorId?: string): Promise<any> {
    return super.findById(id, authorId);
  }

  async createPost(data: any, authorId?: string): Promise<any> {
    return super.create(data, authorId);
  }

  async updatePost(id: string, data: any, authorId?: string): Promise<any> {
    return super.update(id, data, authorId);
  }

  async deletePost(id: string, authorId?: string): Promise<boolean> {
    return super.delete(id, authorId);
  }

  async findAllByUserId(userId: string): Promise<any[]> {
    return super.findAllByUserId(userId);
  }

  async findByThreadId(threadId: string, authorId?: string): Promise<any[]> {
    const { shardId, shardType } = await this.resolveShardForEntity(
      threadId,
      authorId
    );
    const repo = await this.getRepository(shardId, shardType);

    return repo.find({
      where: { thread: { id: threadId } },
      relations: ['author', 'thread'],
      order: { createdAt: 'ASC' },
    });
  }

  async findByThreadIdWithPagination(
    threadId: string,
    limit: number,
    offset: number,
    authorId?: string
  ): Promise<{ posts: any[]; total: number }> {
    const { shardId, shardType } = await this.resolveShardForEntity(
      threadId,
      authorId
    );
    const repo = await this.getRepository(shardId, shardType);

    const [posts, total] = await repo.findAndCount({
      where: { thread: { id: threadId } },
      relations: ['author', 'thread'],
      take: limit,
      skip: offset,
      order: { createdAt: 'ASC' },
    });

    return { posts, total };
  }

  async findPostsByIdsAcrossShards(postIds: string[]): Promise<any[]> {
    return super.findByIds(postIds);
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
          relations: ['author', 'thread'],
        });
        allResults.push(...results);
      }
      return allResults;
    });
  }

  async countByUserId(userId: string): Promise<number> {
    const { shardId, shardType } = await this.resolveShardForContent(userId);
    const repo = await this.getRepository(shardId, shardType);

    return repo.count({
      where: { author: { id: userId } },
    });
  }
}
