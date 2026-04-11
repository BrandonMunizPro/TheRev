import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  OneToMany,
} from 'typeorm';
import { ObjectType, Field, ID, registerEnumType } from 'type-graphql';
import { Server } from './Server';
import { Message } from './Message';

export enum ChannelType {
  TEXT = 'TEXT',
  VOICE = 'VOICE',
  ANNOUNCEMENT = 'ANNOUNCEMENT',
  THREAD = 'THREAD',
}

registerEnumType(ChannelType, {
  name: 'ChannelType',
  description: 'Type of channel: TEXT, VOICE, ANNOUNCEMENT, or THREAD',
});

@ObjectType()
@Entity('channel')
export class Channel {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Field()
  @Column()
  name!: string;

  @Field({ nullable: true })
  @Column({ nullable: true })
  description?: string;

  @Field(() => ChannelType)
  @Column({ type: 'enum', enum: ChannelType, default: ChannelType.TEXT })
  type!: ChannelType;

  @Field()
  @Column({ name: 'server_id' })
  serverId!: string;

  @Field(() => Server)
  @ManyToOne(() => Server, (server) => server.channels, { onDelete: 'CASCADE' })
  server!: Server;

  @Field(() => [Message], { nullable: true })
  @OneToMany(() => Message, (message) => message.channel)
  messages?: Message[];

  @Field({ nullable: true })
  @Column({ nullable: true, name: 'parent_channel_id' })
  parentChannelId?: string;

  @Field()
  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}