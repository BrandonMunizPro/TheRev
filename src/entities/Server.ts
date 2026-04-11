import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { ObjectType, Field, ID, registerEnumType } from 'type-graphql';
import { Channel } from './Channel';

export enum ServerType {
  PUBLIC = 'PUBLIC',
  PRIVATE = 'PRIVATE',
  COMMUNITY = 'COMMUNITY',
}

registerEnumType(ServerType, {
  name: 'ServerType',
  description: 'Type of server: PUBLIC, PRIVATE, or COMMUNITY',
});

@ObjectType()
@Entity('server')
export class Server {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Field()
  @Column()
  name!: string;

  @Field({ nullable: true })
  @Column({ nullable: true })
  description?: string;

  @Field(() => ServerType)
  @Column({ type: 'enum', enum: ServerType, default: ServerType.PUBLIC })
  type!: ServerType;

  @Field({ nullable: true })
  @Column({ nullable: true })
  iconUrl?: string;

  @Field()
  @Column({ name: 'owner_id' })
  ownerId!: string;

  @Field(() => [Channel], { nullable: true })
  @OneToMany(() => Channel, (channel) => channel.server)
  channels?: Channel[];

  @Field()
  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @Field()
  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}