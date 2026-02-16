/**
 Migration scripts for existing data
 Handles chunked migration from legacy to sharded databases
 Supports pausing, resuming, verification, and rollback
 */

import { Pool, PoolClient } from 'pg';
import {
  MigrationState,
  UserStorageLocation,
  MigrationBatchLog,
} from '../../entities/MigrationState';
import { ModuloShardRouter } from './ModuloShardRouter';

export interface MigrationConfig {
  chunkSize: number;
  shardCount: number;
  verifyAfterMigration: boolean;
  pauseBetweenChunksMs: number;
  maxRetries: number;
}

export interface MigrationProgress {
  migrationId: string;
  status: string;
  totalUsers: number;
  processedUsers: number;
  failedUsers: number;
  percentComplete: number;
  estimatedRemainingMs: number;
}

export interface MigrationResult {
  success: boolean;
  processedCount: number;
  failedCount: number;
  errors: string[];
}

const DEFAULT_CONFIG: MigrationConfig = {
  chunkSize: 100,
  shardCount: 8,
  verifyAfterMigration: true,
  pauseBetweenChunksMs: 100,
  maxRetries: 3,
};

export class MigrationRunner {
  private readonly legacyPool: Pool;
  private readonly shardPools: Map<number, Pool>;
  private config: MigrationConfig;
  private isRunning = false;
  private shouldStop = false;

  constructor(
    legacyConnectionString: string,
    shardConnections: Map<number, string>,
    config: Partial<MigrationConfig> = {}
  ) {
    this.legacyPool = new Pool({ connectionString: legacyConnectionString });
    this.shardPools = new Map();
    this.config = { ...DEFAULT_CONFIG, ...config };

    for (const [shardId, connString] of shardConnections.entries()) {
      this.shardPools.set(shardId, new Pool({ connectionString: connString }));
    }
  }

  async startMigration(migrationId: string): Promise<MigrationResult> {
    if (this.isRunning) {
      return {
        success: false,
        processedCount: 0,
        failedCount: 0,
        errors: ['Migration already running'],
      };
    }

    this.isRunning = true;
    this.shouldStop = false;

    console.log(`[Migration] Starting migration ${migrationId}`);

    try {
      const result = await this.runMigration(migrationId);
      return result;
    } finally {
      this.isRunning = false;
    }
  }

  pauseMigration(): void {
    console.log('[Migration] Pausing migration...');
    this.shouldStop = true;
  }

  async resumeMigration(migrationId: string): Promise<MigrationResult> {
    console.log(`[Migration] Resuming migration ${migrationId}`);
    this.shouldStop = false;
    return this.startMigration(migrationId);
  }

  async getMigrationProgress(
    migrationId: string
  ): Promise<MigrationProgress | null> {
    const client = await this.legacyPool.connect();

    try {
      const result = await client.query(
        `SELECT * FROM migration_state WHERE "migrationId" = $1`,
        [migrationId]
      );

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      const processed = row.processedUsers;
      const total = row.totalUsers;
      const percentComplete = total > 0 ? (processed / total) * 100 : 0;
      const avgTimePerUser =
        processed > 0 ? (Date.now() - row.startedAt.getTime()) / processed : 0;
      const estimatedRemainingMs = (total - processed) * avgTimePerUser;

      return {
        migrationId: row.migrationId,
        status: row.status,
        totalUsers: row.totalUsers,
        processedUsers: processed,
        failedUsers: row.failedUsers,
        percentComplete,
        estimatedRemainingMs,
      };
    } finally {
      client.release();
    }
  }

  async verifyMigration(migrationId: string): Promise<{
    verified: number;
    mismatches: number;
    failed: number;
  }> {
    console.log(`[Migration] Verifying migration ${migrationId}`);

    const client = await this.legacyPool.connect();

    try {
      const locations = await client.query(
        `SELECT * FROM user_storage_location WHERE "primaryLocation" = 'shard'`
      );

      let verified = 0;
      let mismatches = 0;
      let failed = 0;

      for (const location of locations.rows) {
        try {
          const isVerified = await this.verifyUserData(
            location.userId,
            location.shardId
          );

          await client.query(
            `UPDATE user_storage_location SET 
              "verificationStatus" = $1,
              "lastVerifiedAt" = NOW()
            WHERE "userId" = $2`,
            [isVerified ? 'verified' : 'mismatch', location.userId]
          );

          if (isVerified) {
            verified++;
          } else {
            mismatches++;
          }
        } catch (error) {
          failed++;
          await client.query(
            `UPDATE user_storage_location SET "verificationStatus" = 'failed' WHERE "userId" = $1`,
            [location.userId]
          );
        }
      }

      console.log(
        `[Migration] Verification complete: ${verified} verified, ${mismatches} mismatches, ${failed} failed`
      );
      return { verified, mismatches, failed };
    } finally {
      client.release();
    }
  }

  async rollbackMigration(migrationId: string): Promise<MigrationResult> {
    console.log(`[Migration] Rolling back migration ${migrationId}`);

    const client = await this.legacyPool.connect();

    try {
      await client.query(`BEGIN`);

      await client.query(
        `UPDATE migration_state SET 
          status = 'rolled_back',
          updatedAt = NOW()
        WHERE "migrationId" = $1`,
        [migrationId]
      );

      await client.query(
        `UPDATE user_storage_location SET 
          "primaryLocation" = 'legacy',
          "shardId" = NULL,
          "dualWriteEnabled" = false,
          "verificationStatus" = 'pending'
        WHERE "primaryLocation" = 'shard'`
      );

      await client.query(`COMMIT`);

      console.log('[Migration] Rollback complete');
      return { success: true, processedCount: 0, failedCount: 0, errors: [] };
    } catch (error: any) {
      await client.query(`ROLLBACK`);
      return {
        success: false,
        processedCount: 0,
        failedCount: 0,
        errors: [error.message],
      };
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    await this.legacyPool.end();
    for (const pool of this.shardPools.values()) {
      await pool.end();
    }
  }

  private async runMigration(migrationId: string): Promise<MigrationResult> {
    const client = await this.legacyPool.connect();

    try {
      await client.query(`BEGIN`);

      const userCountResult = await client.query(
        `SELECT COUNT(*) as count FROM "user"`
      );
      const totalUsers = parseInt(userCountResult.rows[0].count);

      await client.query(
        `INSERT INTO migration_state (migrationId, status, "totalUsers", "shardCount", "chunkSize", "startedAt")
         VALUES ($1, 'running', $2, $3, $4, NOW())`,
        [migrationId, totalUsers, this.config.shardCount, this.config.chunkSize]
      );

      await client.query(`COMMIT`);

      console.log(
        `[Migration] Migrating ${totalUsers} users in chunks of ${this.config.chunkSize}`
      );

      let processedCount = 0;
      let failedCount = 0;
      let offset = 0;
      const errors: string[] = [];

      while (offset < totalUsers && !this.shouldStop) {
        const batchResult = await this.processBatch(
          client,
          migrationId,
          offset
        );
        processedCount += batchResult.processed;
        failedCount += batchResult.failed;
        errors.push(...batchResult.errors);

        offset += this.config.chunkSize;

        await this.updateProgress(migrationId, processedCount, failedCount);

        if (this.config.pauseBetweenChunksMs > 0) {
          await this.sleep(this.config.pauseBetweenChunksMs);
        }
      }

      const finalStatus = this.shouldStop ? 'paused' : 'completed';
      await client.query(
        `UPDATE migration_state SET 
          status = $1,
          "processedUsers" = $2,
          "failedUsers" = $3,
          "completedAt" = NOW(),
          updatedAt = NOW()
        WHERE "migrationId" = $4`,
        [finalStatus, processedCount, failedCount, migrationId]
      );

      console.log(
        `[Migration] Completed: ${processedCount} processed, ${failedCount} failed`
      );

      return {
        success: failedCount === 0,
        processedCount,
        failedCount,
        errors,
      };
    } catch (error: any) {
      await client.query(`ROLLBACK`);

      await client.query(
        `UPDATE migration_state SET status = 'failed', updatedAt = NOW() WHERE "migrationId" = $1`,
        [migrationId]
      );

      return {
        success: false,
        processedCount: 0,
        failedCount: 0,
        errors: [error.message],
      };
    } finally {
      client.release();
    }
  }

  private async processBatch(
    client: PoolClient,
    migrationId: string,
    offset: number
  ): Promise<{ processed: number; failed: number; errors: string[] }> {
    const errors: string[] = [];
    let processed = 0;
    let failed = 0;

    const usersResult = await client.query(
      `SELECT id FROM "user" ORDER BY id LIMIT $1 OFFSET $2`,
      [this.config.chunkSize, offset]
    );

    const userIds = usersResult.rows.map((r) => r.id);

    if (userIds.length === 0) {
      return { processed: 0, failed: 0, errors: [] };
    }

    const batchNumber = Math.floor(offset / this.config.chunkSize) + 1;

    try {
      await client.query(
        `INSERT INTO migration_batch_log ("migrationId", "batchNumber", "userIds", status)
         VALUES ($1, $2, $3, 'processing')`,
        [migrationId, batchNumber, userIds]
      );

      for (const userId of userIds) {
        try {
          await this.migrateUser(client, userId);
          processed++;
        } catch (error: any) {
          failed++;
          errors.push(`User ${userId}: ${error.message}`);
        }
      }

      await client.query(
        `UPDATE migration_batch_log SET status = 'completed', "processedAt" = NOW() 
         WHERE "migrationId" = $1 AND "batchNumber" = $2`,
        [migrationId, batchNumber]
      );
    } catch (error: any) {
      errors.push(`Batch ${batchNumber}: ${error.message}`);

      await client.query(
        `UPDATE migration_batch_log SET status = 'failed', "errorMessage" = $1 
         WHERE "migrationId" = $2 AND "batchNumber" = $3`,
        [error.message, migrationId, batchNumber]
      );
    }

    return { processed, failed, errors };
  }

  private async migrateUser(client: PoolClient, userId: string): Promise<void> {
    const shardId = this.getShardId(userId);
    const shardPool = this.shardPools.get(shardId);

    if (!shardPool) {
      throw new Error(`No shard pool for shard ${shardId}`);
    }

    const legacyClient = await this.legacyPool.connect();
    const shardClient = await shardPool.connect();

    try {
      await legacyClient.query(`BEGIN`);
      await shardClient.query(`BEGIN`);

      const userResult = await legacyClient.query(
        `SELECT * FROM "user" WHERE id = $1`,
        [userId]
      );

      if (userResult.rows.length === 0) {
        throw new Error(`User ${userId} not found`);
      }

      const user = userResult.rows[0];

      await shardClient.query(
        `INSERT INTO users (id, email, username, "displayName", "role", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (id) DO NOTHING`,
        [
          user.id,
          user.email,
          user.username,
          user.displayName,
          user.role,
          user.createdAt,
          user.updatedAt,
        ]
      );

      const postsResult = await legacyClient.query(
        `SELECT * FROM post WHERE "authorId" = $1`,
        [userId]
      );

      if (postsResult.rows.length > 0) {
        for (const post of postsResult.rows) {
          await shardClient.query(
            `INSERT INTO posts (id, content, "authorId", "threadId", "parentId", "postType", "isPinned", "createdAt", "updatedAt")
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
             ON CONFLICT (id) DO NOTHING`,
            [
              post.id,
              post.content,
              post.authorId,
              post.threadId,
              post.parentId,
              post.postType,
              post.isPinned,
              post.createdAt,
              post.updatedAt,
            ]
          );
        }
      }

      const threadsResult = await legacyClient.query(
        `SELECT * FROM thread WHERE "createdById" = $1`,
        [userId]
      );

      if (threadsResult.rows.length > 0) {
        for (const thread of threadsResult.rows) {
          await shardClient.query(
            `INSERT INTO thread (id, title, "createdById", "isLocked", "createdAt", "updatedAt")
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (id) DO NOTHING`,
            [
              thread.id,
              thread.title,
              thread.createdById,
              thread.isLocked,
              thread.createdAt,
              thread.updatedAt,
            ]
          );
        }
      }

      await shardClient.query(`COMMIT`);
      await legacyClient.query(`COMMIT`);

      await client.query(
        `INSERT INTO "user_storage_location" 
          ("userId", "primaryLocation", "shardId", "dualWriteEnabled", "migratedAt")
         VALUES ($1, 'shard', $2, false, NOW())
         ON CONFLICT ("userId") DO UPDATE SET 
          "primaryLocation" = 'shard',
          "shardId" = $2,
          "dualWriteEnabled" = false,
          "migratedAt" = NOW()`,
        [userId, shardId]
      );
    } catch (error) {
      await legacyClient.query(`ROLLBACK`);
      await shardClient.query(`ROLLBACK`);
      throw error;
    } finally {
      legacyClient.release();
      shardClient.release();
    }
  }

  private async verifyUserData(
    userId: string,
    shardId: number
  ): Promise<boolean> {
    const shardPool = this.shardPools.get(shardId);
    if (!shardPool) return false;

    const legacyClient = await this.legacyPool.connect();
    const shardClient = await shardPool.connect();

    try {
      const legacyUser = await legacyClient.query(
        `SELECT * FROM "user" WHERE id = $1`,
        [userId]
      );

      const shardUser = await shardClient.query(
        `SELECT * FROM users WHERE id = $1`,
        [userId]
      );

      if (legacyUser.rows.length !== shardUser.rows.length) {
        return false;
      }

      return true;
    } finally {
      legacyClient.release();
      shardClient.release();
    }
  }

  private async updateProgress(
    migrationId: string,
    processed: number,
    failed: number
  ): Promise<void> {
    const client = await this.legacyPool.connect();
    try {
      await client.query(
        `UPDATE migration_state SET 
          "processedUsers" = $1,
          "failedUsers" = $2,
          updatedAt = NOW()
        WHERE "migrationId" = $3`,
        [processed, failed, migrationId]
      );
    } finally {
      client.release();
    }
  }

  private getShardId(userId: string): number {
    const hash = this.hashUserId(userId);
    return hash % this.config.shardCount;
  }

  private hashUserId(userId: string): number {
    let hash = 0;
    for (let i = 0; i < userId.length; i++) {
      const char = userId.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return Math.abs(hash);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
