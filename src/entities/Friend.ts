import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { ObjectType, Field, ID } from 'type-graphql';
import { User } from './User';
import { FriendStatus } from '../graphql/enums/FriendStatus';

@ObjectType()
@Entity('friend')
@Index('idx_friend_requester', ['requesterId'])
@Index('idx_friend_recipient', ['recipientId'])
@Index('idx_friend_status', ['status'])
export class Friend {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Field(() => ID)
  @Column({ name: 'requester_id' })
  requesterId!: string;

  @Field(() => ID)
  @Column({ name: 'recipient_id' })
  recipientId!: string;

  @Field(() => FriendStatus)
  @Column({
    type: 'enum',
    enum: FriendStatus,
    default: FriendStatus.PENDING,
  })
  status!: FriendStatus;

  @Field()
  @CreateDateColumn({ name: 'created_at' })
  createdAt?: Date;

  @Field({ nullable: true })
  @Column({ name: 'updated_at', nullable: true })
  updatedAt?: Date;

  @ManyToOne(() => User, { eager: true })
  @JoinColumn({ name: 'requester_id' })
  requester?: User;

  @ManyToOne(() => User, { eager: true })
  @JoinColumn({ name: 'recipient_id' })
  recipient?: User;
}
