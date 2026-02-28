/**
 * Shard-Aware Users DAO
 * Extends BaseShardedDao for user operations with shard routing
 */

import { EntityTarget } from 'typeorm';
import { User } from '../../entities/User';
import { ShardType } from '../../database/sharding/IShardRouter';
import { BaseShardedDao, ShardedDaoConfig } from './BaseShardedDao';
import { IShardRouter } from '../../database/sharding/IShardRouter';
import { ShardConnectionManager } from '../../database/sharding/ShardConnectionManager';
import { DataCoLocationService } from '../../database/sharding/DataCoLocationService';
import { NotFoundError, ErrorCode } from '../../errors/AppError';

export class ShardedUsersDao extends BaseShardedDao {
  constructor(
    shardRouter: IShardRouter,
    connectionManager: ShardConnectionManager,
    coLocationService?: DataCoLocationService
  ) {
    const config: ShardedDaoConfig = {
      entityShardType: ShardType.USERS,
      entityTarget: User,
      enableContentColocation: false,
      crossShardQueriesEnabled: false,
    };
    super(shardRouter, connectionManager, config, coLocationService);
  }

  protected getEntityName(): string {
    return 'User';
  }

  protected getEntityTarget(): EntityTarget<any> {
    return User;
  }

  async createUser(data: any, userId?: string): Promise<any> {
    return super.create(data, userId);
  }

  async updateUser(id: string, data: any, userId?: string): Promise<any> {
    return super.update(id, data, userId);
  }

  async deleteUser(id: string, userId?: string): Promise<boolean> {
    return super.delete(id, userId);
  }

  async findByEmail(email: string): Promise<any> {
    const { shardId, shardType } = await this.routeToShard(email);
    const repo = await this.getRepository(shardId, shardType);
    return repo.findOne({ where: { email } });
  }

  async findByUsername(userName: string): Promise<any> {
    const { shardId, shardType } = await this.routeToShard(userName);
    const repo = await this.getRepository(shardId, shardType);
    return repo.findOne({ where: { userName } });
  }

  async saveUserPasswordByName(
    userName: string,
    hashedPassword: string
  ): Promise<void> {
    const { shardId, shardType } = await this.routeToShard(userName);
    const repo = await this.getRepository(shardId, shardType);
    const user = await repo.findOne({ where: { userName } });
    if (!user) {
      throw new NotFoundError(
        `User ${userName} not found`,
        ErrorCode.USER_NOT_FOUND,
        { field: 'userName', value: userName }
      );
    }
    user.password = hashedPassword;
    await repo.save(user);
  }
}
