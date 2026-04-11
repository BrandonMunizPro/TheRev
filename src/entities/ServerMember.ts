import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { ObjectType, Field, ID, registerEnumType } from 'type-graphql';
import { User } from './User';
import { Server } from './Server';

export enum ServerRole {
  OWNER = 'OWNER',
  ADMIN = 'ADMIN',
  MODERATOR = 'MODERATOR',
  MEMBER = 'MEMBER',
}

registerEnumType(ServerRole, {
  name: 'ServerRole',
  description: 'Role within a server: OWNER, ADMIN, MODERATOR, or MEMBER',
});

@ObjectType()
@Entity('server_member')
export class ServerMember {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Field()
  @Column({ name: 'user_id' })
  userId!: string;

  @Field()
  @Column({ name: 'server_id' })
  serverId!: string;

  @Field(() => ServerRole)
  @Column({ type: 'enum', enum: ServerRole, default: ServerRole.MEMBER })
  role!: ServerRole;

  @Field({ nullable: true })
  @Column({ nullable: true, name: 'nickname' })
  nickname?: string;

  @Field()
  @CreateDateColumn({ name: 'joined_at' })
  joinedAt!: Date;

  @Field({ nullable: true })
  @Column({ nullable: true, name: 'last_read_message_id' })
  lastReadMessageId?: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @ManyToOne(() => Server)
  @JoinColumn({ name: 'server_id' })
  server!: Server;
}