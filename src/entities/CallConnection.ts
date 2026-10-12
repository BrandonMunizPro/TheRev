import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from './User';

@Entity('call_connection')
@Index('idx_call_connection_user', ['userId', 'expiresAt'])
export class CallConnection {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column('uuid', { name: 'user_id' }) userId!: string;
  @Column('uuid', { name: 'instance_id' }) instanceId!: string;
  @Column('timestamptz', { name: 'expires_at' }) expiresAt!: Date;
  @Column('timestamptz', { nullable: true, name: 'disconnected_at' })
  disconnectedAt?: Date;
  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;
}
