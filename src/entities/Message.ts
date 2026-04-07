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

@ObjectType()
@Entity('message')
@Index('idx_message_sender', ['senderId'])
@Index('idx_message_recipient', ['recipientId'])
@Index('idx_message_conversation', ['senderId', 'recipientId'])
export class Message {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Field(() => ID)
  @Column({ name: 'sender_id' })
  senderId!: string;

  @Field(() => ID)
  @Column({ name: 'recipient_id' })
  recipientId!: string;

  @Field()
  @Column({ type: 'text' })
  content!: string;

  @Field()
  @Column({ name: 'is_read', default: false })
  isRead!: boolean;

  @Field()
  @CreateDateColumn({ name: 'created_at' })
  createdAt?: Date;

  @ManyToOne(() => User, { eager: true })
  @JoinColumn({ name: 'sender_id' })
  sender?: User;

  @ManyToOne(() => User, { eager: true })
  @JoinColumn({ name: 'recipient_id' })
  recipient?: User;
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
