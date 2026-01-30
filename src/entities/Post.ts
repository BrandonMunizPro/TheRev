import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Field, ID, ObjectType } from 'type-graphql';
import { User } from './User';
import { Thread } from './Thread';
import { PostType } from '../graphql/enums/PostType';

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

  @Field(() => String, { nullable: true })
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

  @Field()
  @CreateDateColumn()
  createdAt!: Date;

  @Field()
  @UpdateDateColumn()
  updatedAt!: Date;
}
