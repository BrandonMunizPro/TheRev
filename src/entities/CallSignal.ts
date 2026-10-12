import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Call } from './Call';

@Entity('call_signal')
@Index('idx_call_signal_delivery', ['toConnectionId', 'createdAt'])
export class CallSignal {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column('uuid', { name: 'call_id' }) callId!: string;
  @Column('uuid', { name: 'from_user_id' }) fromUserId!: string;
  @Column('uuid', { name: 'to_user_id' }) toUserId!: string;
  @Column('uuid', { name: 'to_connection_id' }) toConnectionId!: string;
  @Column() type!: string;
  @Column('jsonb') payload!: Record<string, unknown>;
  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;
  @Column('timestamptz', { name: 'expires_at' }) expiresAt!: Date;
  @ManyToOne(() => Call, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'call_id' })
  call!: Call;
}
