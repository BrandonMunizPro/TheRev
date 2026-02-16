import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export type MigrationStatus =
  | 'pending'
  | 'running'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'rolled_back';

@Entity('migration_state')
@Index('IDX_migration_state_status', ['status'])
export class MigrationState {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', unique: true })
  migrationId!: string;

  @Column({ type: 'varchar', default: 'pending' })
  status!: MigrationStatus;

  @Column({ type: 'int', default: 0 })
  totalUsers!: number;

  @Column({ type: 'int', default: 0 })
  processedUsers!: number;

  @Column({ type: 'int', default: 0 })
  failedUsers!: number;

  @Column({ type: 'int', default: 8 })
  shardCount!: number;

  @Column({ type: 'int', default: 100 })
  chunkSize!: number;

  @Column({ type: 'timestamp', nullable: true })
  startedAt!: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  completedAt!: Date | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}

export type PrimaryLocation = 'legacy' | 'shard';
export type VerificationStatus = 'pending' | 'verified' | 'mismatch' | 'failed';

@Entity('user_storage_location')
@Index('IDX_user_storage_userId', ['userId'])
@Index('IDX_user_storage_primaryLocation', ['primaryLocation'])
export class UserStorageLocation {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', unique: true })
  userId!: string;

  @Column({ type: 'varchar', default: 'legacy' })
  primaryLocation!: PrimaryLocation;

  @Column({ type: 'int', nullable: true })
  shardId!: number | null;

  @Column({ type: 'boolean', default: false })
  dualWriteEnabled!: boolean;

  @Column({ type: 'timestamp', nullable: true })
  migratedAt!: Date | null;

  @Column({ type: 'uuid', nullable: true })
  migratedById!: string | null;

  @Column({ type: 'varchar', default: 'pending' })
  verificationStatus!: VerificationStatus;

  @Column({ type: 'timestamp', nullable: true })
  lastVerifiedAt!: Date | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}

export type BatchStatus = 'pending' | 'processing' | 'completed' | 'failed';

@Entity('migration_batch_log')
@Index('IDX_migration_batch_migrationId', ['migrationId'])
export class MigrationBatchLog {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar' })
  migrationId!: string;

  @Column({ type: 'int' })
  batchNumber!: number;

  @Column({ type: 'uuid', array: true })
  userIds!: string[];

  @Column({ type: 'varchar', default: 'pending' })
  status!: BatchStatus;

  @Column({ type: 'timestamp', nullable: true })
  processedAt!: Date | null;

  @Column({ type: 'text', nullable: true })
  errorMessage!: string | null;

  @CreateDateColumn()
  createdAt!: Date;
}
