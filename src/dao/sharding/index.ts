/**
 * Shard-Aware DAO Index
 * Exports all shard-aware data access objects
 */

export {
  BaseShardedDao,
  ShardedDaoConfig,
  MultiShardResult,
} from './BaseShardedDao';
export { ShardedUsersDao } from './ShardedUsersDao';
export { ShardedThreadsDao } from './ShardedThreadsDao';
export { ShardedPostsDao } from './ShardedPostsDao';
