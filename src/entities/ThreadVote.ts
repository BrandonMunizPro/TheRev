import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  Unique,
} from 'typeorm';
import { Field, ID, ObjectType } from 'type-graphql';
import { User } from './User';
import { Thread } from './Thread';

@ObjectType()
@Entity()
@Unique(['user', 'thread'])
export class ThreadVote {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Field()
  @Column({ type: 'varchar', length: 20, default: 'NEUTRAL' })
  perspective!: string;

  @Field(() => User)
  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  user!: User;

  @Field(() => Thread)
  @ManyToOne(() => Thread, { onDelete: 'CASCADE' })
  thread!: Thread;

  @Field()
  @CreateDateColumn()
  createdAt!: Date;
}
