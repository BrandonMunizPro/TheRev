import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { ObjectType, Field, ID, registerEnumType } from 'type-graphql';
import { User } from './User';

export enum CallStatus {
  PENDING = 'PENDING',
  RINGING = 'RINGING',
  ACTIVE = 'ACTIVE',
  ENDED = 'ENDED',
  DECLINED = 'DECLINED',
  CANCELLED = 'CANCELLED',
}

registerEnumType(CallStatus, {
  name: 'CallStatus',
  description: 'Status of a call',
});

@ObjectType()
@Entity('call')
@Index('idx_call_caller', ['callerId'])
@Index('idx_call_callee', ['calleeId'])
@Index('idx_call_status', ['status'])
export class Call {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Field(() => ID)
  @Column({ name: 'caller_id' })
  callerId!: string;

  @Field(() => ID)
  @Column({ name: 'callee_id' })
  calleeId!: string;

  @Field(() => CallStatus)
  @Column({ type: 'varchar', default: CallStatus.PENDING })
  status!: CallStatus;

  @Field({ nullable: true })
  @Column({ nullable: true, name: 'started_at' })
  startedAt?: Date;

  @Field({ nullable: true })
  @Column({ nullable: true, name: 'ended_at' })
  endedAt?: Date;

  @Field()
  @Column({ default: false, name: 'is_video' })
  isVideo!: boolean;

  @Field({ nullable: true })
  @Column({ nullable: true, name: 'offer_sdp' })
  offerSdp?: string;

  @Field({ nullable: true })
  @Column({ nullable: true, name: 'answer_sdp' })
  answerSdp?: string;

  @Field({ nullable: true })
  @Column({ nullable: true, name: 'ice_candidates' })
  iceCandidates?: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt?: Date;

  @ManyToOne(() => User, { eager: true })
  @JoinColumn({ name: 'caller_id' })
  caller?: User;

  @ManyToOne(() => User, { eager: true })
  @JoinColumn({ name: 'callee_id' })
  callee?: User;
}

@ObjectType()
export class CallInvitation {
  @Field(() => ID)
  callId!: string;

  @Field()
  callerName!: string;

  @Field({ nullable: true })
  callerAvatarUrl?: string;

  @Field()
  isVideo!: boolean;
}
