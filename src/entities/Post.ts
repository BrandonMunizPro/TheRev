import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Field, ID, ObjectType } from 'type-graphql';
import { GraphQLJSONObject } from 'graphql-scalars';
import { User } from './User';
import { Thread } from './Thread';
import { PostType } from '../graphql/enums/PostType';
import { Perspective } from '../graphql/enums/Perspective';

@ObjectType()
@Entity()
export class Post {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Field(() => PostType)
  @Column({ type: 'enum', enum: PostType })
  type!: PostType;

  @Field()
  @Column('text')
  content!: string;

  @Field(() => Boolean)
  @Column({ default: false })
  isPinned!: boolean;

  @Field(() => Perspective)
  @Column({ type: 'enum', enum: Perspective, default: Perspective.NEUTRAL })
  perspective!: Perspective;

  @Field(() => GraphQLJSONObject, { nullable: true })
  @Column('jsonb', { nullable: true })
  metadata?: {
    thumbnailUrl?: string;
    duration?: number;
    provider?: 'youtube' | 'vimeo';
  };

  @Field(() => User)
  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  author!: User;

  @Field(() => Thread)
  @ManyToOne(() => Thread, (thread) => thread.posts, { onDelete: 'CASCADE' })
  thread!: Thread;

  @Field(() => Post, { nullable: true })
  @ManyToOne(() => Post, (post) => post.replies, {
    nullable: true,
    onDelete: 'CASCADE',
  })
  parent?: Post;

  @Field(() => [Post], { nullable: true })
  @OneToMany(() => Post, (post) => post.parent, { eager: true })
  replies?: Post[];

  @Field()
  @CreateDateColumn()
  createdAt!: Date;

  @Field()
  @UpdateDateColumn()
  updatedAt!: Date;
}
