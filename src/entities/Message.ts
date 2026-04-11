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
import { Channel } from './Channel';
import { Server } from './Server';

@ObjectType()
export class Reaction {
  @Field()
  emoji!: string;

  @Field(() => [String])
  users!: string[];
}

@ObjectType()
@Entity('message')
@Index('idx_message_sender', ['senderId'])
@Index('idx_message_recipient', ['recipientId'])
@Index('idx_message_conversation', ['senderId', 'recipientId'])
@Index('idx_message_channel', ['channelId'])
@Index('idx_message_server', ['serverId'])
export class Message {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Field(() => ID)
  @Column({ name: 'sender_id' })
  senderId!: string;

  @Field(() => ID, { nullable: true })
  @Column({ name: 'recipient_id', nullable: true })
  recipientId?: string;

  @Field()
  @Column({ type: 'text' })
  content!: string;

  @Field()
  @Column({ name: 'is_read', default: false })
  isRead!: boolean;

  @Field()
  @CreateDateColumn({ name: 'created_at' })
  createdAt?: Date;

  // Server/Channel fields for Discord-style messaging
  @Field({ nullable: true })
  @Column({ nullable: true, name: 'server_id' })
  serverId?: string;

  @Field({ nullable: true })
  @Column({ nullable: true, name: 'channel_id' })
  channelId?: string;

  // Discordstyle: thread reference for threaded conversations
  @Field({ nullable: true })
  @Column({ nullable: true, name: 'thread_id' })
  threadId?: string;

  // Reactions (JSON array for Discord style emoji reactions)
  @Field(() => [Reaction], { nullable: true })
  @Column({ type: 'jsonb', nullable: true })
  reactions?: Reaction[];

  @ManyToOne(() => User, { eager: true })
  @JoinColumn({ name: 'sender_id' })
  sender?: User;

  @ManyToOne(() => User, { eager: true })
  @JoinColumn({ name: 'recipient_id' })
  recipient?: User;

  @ManyToOne(() => Server, { nullable: true })
  @JoinColumn({ name: 'server_id' })
  server?: Server;

  @ManyToOne(() => Channel, { nullable: true })
  @JoinColumn({ name: 'channel_id' })
  channel?: Channel;
}

@ObjectType()
export class Conversation {
  @Field(() => ID)
  id!: string;

  @Field(() => ID)
  odlFriendId!: string;

  @Field()
  odlFriendUserName!: string;

  @Field()
  odlFriendFirstName!: string;

  @Field()
  odlFriendLastName!: string;

  @Field({ nullable: true })
  odlFriendProfilePicUrl?: string;

  @Field({ nullable: true })
  odlFriendAvatarUrl?: string;

  @Field()
  lastMessage!: string;

  @Field()
  lastMessageDate!: Date;

  @Field()
  unreadCount!: number;
}
