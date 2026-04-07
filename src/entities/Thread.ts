import { Field, ID, ObjectType, Int } from 'type-graphql';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from './User';
import { Post } from './Post';

@ObjectType()
export class ThreadVoteCounts {
  @Field(() => Int)
  PRO!: number;

  @Field(() => Int)
  AGAINST!: number;

  @Field(() => Int)
  NEUTRAL!: number;

  @Field(() => Int)
  total!: number;
}

@ObjectType()
@Entity()
export class Thread {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Field()
  @Column()
  title!: string;

  @Field({ nullable: true })
  @Column({ nullable: true })
  content?: string;

  @Field(() => User)
  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  author!: User;

  @Field(() => [Post], { nullable: true })
  @OneToMany(() => Post, (post) => post.thread)
  posts?: Post[];

  @Field(() => ThreadVoteCounts, { nullable: true })
  voteCounts?: ThreadVoteCounts;

  @Field()
  @Column({ default: false })
  isLocked!: boolean;

  @Field()
  @Column({ default: false })
  isPinned!: boolean;

  @Field()
  @CreateDateColumn()
  createdAt!: Date;

  @Field()
  @UpdateDateColumn()
  updatedAt!: Date;
}
