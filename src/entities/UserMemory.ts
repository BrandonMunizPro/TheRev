import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum MemoryType {
  FACT = 'fact',
  PREFERENCE = 'preference',
  INTEREST = 'interest',
  RELATIONSHIP = 'relationship',
  GOAL = 'goal',
  PROJECT = 'project',
}

@Entity('user_memory')
export class UserMemory {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id' })
  userId!: string;

  @Column({ type: 'enum', enum: MemoryType })
  type!: MemoryType;

  @Column({ type: 'text' })
  content!: string;

  @Column({ name: 'normalized_key', type: 'varchar', length: 255 })
  normalizedKey!: string;

  @Column({ type: 'tsvector', select: false })
  searchVector!: string;

  @Column({ type: 'decimal', precision: 3, scale: 2, default: 0.7 })
  confidence!: number;

  @Column({ type: 'integer', default: 5 })
  importance!: number;

  @Column({ name: 'source', type: 'varchar', length: 50 })
  source!: string;

  @Column({
    name: 'source_interaction_id',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  sourceInteractionId?: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  @Column({ name: 'last_accessed_at', type: 'timestamp', nullable: true })
  lastAccessedAt?: Date;

  @Column({ name: 'access_count', type: 'integer', default: 0 })
  accessCount!: number;

  @Column({ name: 'active', type: 'boolean', default: true })
  active!: boolean;
}
