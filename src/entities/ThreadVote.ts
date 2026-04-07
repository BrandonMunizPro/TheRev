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
import { Perspective } from '../graphql/enums/Perspective';

@ObjectType()
@Entity()
@Unique(['user', 'thread'])
export class ThreadVote {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Field(() => Perspective)
  @Column({ type: 'enum', enum: Perspective })
  perspective!: Perspective;

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
