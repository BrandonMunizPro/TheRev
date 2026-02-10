/**
 * Dual-Write Migration Service
 * Writes to both legacy and shard databases simultaneously, then can flip primary location
 * Provides deterministic, idempotent, and reversible migration operations
 */

export interface UserStorageLocation {
  userId: string;
  primary: 'legacy' | 'shard'; // Where primary writes go
  shardId?: number; // Required if primary = 'shard'
  dualWrite: boolean; // Only during migration phase
}

/**
 * Dual Write Migration Service
 * Writes to both legacy and shard databases simultaneously, then can flip primary location
 * Provides deterministic, idempotent, and reversible migration operations
 */
export class DualWriteMigrationService {
  constructor(
    private readonly shardRouter: any, // TODO: Use proper type from Epic 1.2
    private readonly legacyConnection: any,
    private readonly shardConnections: Map<number, any>
  ) {}

  /**
   * Get current storage location for user
   * Returns deterministic result based on stored preference
   */
  async getUserStorageLocation(userId: string): Promise<UserStorageLocation> {
    // TODO: Query UserStorageLocation table
    // For MVP, return legacy for everyone
    return {
      userId,
      primary: 'legacy',
      dualWrite: false,
    };
  }

  /**
   * Add user to dual write migration
   * Creates UserStorageLocation record with dual write enabled
   */
  async addUserToMigration(
    userId: string,
    initialShardId?: number
  ): Promise<UserStorageLocation> {
    const location: UserStorageLocation = {
      userId,
      primary: 'legacy', // Always start with legacy as primary
      shardId: initialShardId,
      dualWrite: true, // This enables dual-write behavior
    };

    // TODO: Insert UserStorageLocation record
    console.log(`[Migration] Added user ${userId} to dual-write migration`);
    return location;
  }

  /**
   * Write data with dual write strategy
   * ALWAYS writes to both locations during migration
   * Primary location decides order, dualWrite determines secondary write
   */
  async writeWithDualStrategy(
    userId: string,
    data: any,
    entityType: string
  ): Promise<{
    legacySuccess: boolean;
    shardSuccess: boolean;
    errors: string[];
  }> {
    const errors: string[] = [];
    let legacySuccess = false;
    let shardSuccess = false;

    // Get user's storage location
    const location = await this.getUserStorageLocation(userId);

    // Write according to primary location, then dual-write if enabled
    if (location.primary === 'legacy') {
      try {
        await this.writeToLegacy(userId, data, entityType);
        legacySuccess = true;
      } catch (error: any) {
        errors.push(`Legacy write failed: ${error.message}`);
      }

      // Dual write to shard if enabled
      if (location.dualWrite) {
        // Enforce: dualWrite requires shardId
        if (!location.shardId) {
          errors.push('dualWrite enabled but shardId not provided');
        } else {
          try {
            await this.writeToShard(Number(location.shardId), data, entityType);
            shardSuccess = true;
          } catch (error: any) {
            errors.push(`Shard write failed: ${error.message}`);
          }
        }
      }
    } else {
      // Primary is shard - write directly
      try {
        const shardId =
          location.shardId || (await this.shardRouter.getShardForUser(userId));
        await this.writeToShard(Number(shardId), data, entityType);
        shardSuccess = true;
      } catch (error: any) {
        errors.push(`Shard write failed: ${error.message}`);
      }

      // Dual write to legacy if enabled
      if (location.dualWrite) {
        try {
          await this.writeToLegacy(userId, data, entityType);
        } catch (error: any) {
          errors.push(`Legacy dual-write failed: ${error.message}`);
        }
      }
    }

    return {
      legacySuccess,
      shardSuccess,
      errors,
    };
  }

  /**
   * Read data based on user's primary location
   * NO fallback logic - always reads from designated primary
   */
  async readFromPrimaryLocation(userId: string, dataId: string): Promise<any> {
    const location = await this.getUserStorageLocation(userId);

    if (location.primary === 'shard') {
      const shardId =
        location.shardId || (await this.shardRouter.getShardForUser(userId));
      return await this.readFromShard(Number(shardId), dataId);
    } else {
      return await this.readFromLegacy(dataId);
    }
  }

  /**
   * Promote user to shard-only (end of dual write phase)
   * Single write location change - no data movement required
   */
  async promoteToShardOnly(userId: string): Promise<boolean> {
    // TODO: Update UserStorageLocation record
    console.log(`[Migration] Promoting user ${userId} to shard-only`);
    return true;
  }

  /**
   * Rollback user to legacy only
   * Single write location change - no data cleanup required
   */
  async rollbackToLegacyOnly(userId: string): Promise<boolean> {
    // TODO: Update UserStorageLocation record
    console.log(`[Migration] Rolling back user ${userId} to legacy-only`);
    return true;
  }

  // Private methods (TODO: Implement actual database operations)

  private async writeToLegacy(
    userId: string,
    data: any,
    entityType: string
  ): Promise<void> {
    console.log(`[Migration] Writing to legacy: ${userId} (${entityType})`);
    // TODO: Actual legacy database write
  }

  private async writeToShard(
    shardId: number,
    data: any,
    entityType: string
  ): Promise<void> {
    console.log(`[Migration] Writing to shard: ${shardId} (${entityType})`);
    // TODO: Actual shard database write using shardConnections
  }

  private async readFromShard(shardId: number, dataId: string): Promise<any> {
    console.log(`[Migration] Reading from shard: ${shardId} (${dataId})`);
    // TODO: Actual shard database read
  }

  private async readFromLegacy(dataId: string): Promise<any> {
    console.log(`[Migration] Reading from legacy: (${dataId})`);
    // TODO: Actual legacy database read
  }
}
