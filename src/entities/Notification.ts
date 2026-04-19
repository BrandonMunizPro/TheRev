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
import {
  NotificationType,
  NotificationStatus,
} from '../graphql/enums/NotificationType';

@ObjectType()
@Entity('notification')
@Index('idx_notification_user', ['userId'])
@Index('idx_notification_status', ['status'])
@Index('idx_notification_created', ['createdAt'])
@Index('idx_notification_user_status', ['userId', 'status'])
export class Notification {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Field(() => ID)
  @Column({ name: 'user_id' })
  userId!: string;

  @Field(() => NotificationType)
  @Column({
    type: 'enum',
    enum: NotificationType,
    default: NotificationType.MESSAGE,
  })
  type!: NotificationType;

  @Field()
  @Column({ type: 'text' })
  title!: string;

  @Field()
  @Column({ type: 'text' })
  message!: string;

  @Field(() => NotificationStatus)
  @Column({
    type: 'enum',
    enum: NotificationStatus,
    default: NotificationStatus.UNREAD,
  })
  status!: NotificationStatus;

  @Field({ nullable: true })
  @Column({ name: 'reference_id', nullable: true })
  referenceId?: string;

  @Field({ nullable: true })
  @Column({ name: 'reference_type', nullable: true })
  referenceType?: string;

  @Field(() => ID, { nullable: true })
  @Column({ name: 'actor_id', nullable: true })
  actorId?: string;

  @Field()
  @CreateDateColumn({ name: 'created_at' })
  createdAt?: Date;

  @ManyToOne(() => User, { eager: true })
  @JoinColumn({ name: 'user_id' })
  user?: User;

  @ManyToOne(() => User, { eager: true })
  @JoinColumn({ name: 'actor_id' })
  actor?: User;
}
