import { InputType, Field, ID, ObjectType, Int } from 'type-graphql';
import { Resolver, Query, Mutation, Arg } from 'type-graphql';
import { NotificationsModel } from '../models/notifications.model';
import { Notification } from '../entities/Notification';
import {
  NotificationType,
  NotificationStatus,
} from '../graphql/enums/NotificationType';

@InputType()
export class CreateNotificationInput {
  @Field(() => ID)
  userId!: string;

  @Field(() => NotificationType)
  type!: NotificationType;

  @Field()
  title!: string;

  @Field()
  message!: string;

  @Field(() => ID, { nullable: true })
  referenceId?: string;

  @Field({ nullable: true })
  referenceType?: string;

  @Field(() => ID, { nullable: true })
  actorId?: string;
}

@ObjectType()
export class NotificationOutput {
  @Field(() => ID)
  id!: string;

  @Field(() => ID)
  userId!: string;

  @Field(() => NotificationType)
  type!: NotificationType;

  @Field()
  title!: string;

  @Field()
  message!: string;

  @Field(() => NotificationStatus)
  status!: NotificationStatus;

  @Field({ nullable: true })
  referenceId?: string;

  @Field({ nullable: true })
  referenceType?: string;

  @Field(() => ID, { nullable: true })
  actorId?: string;

  @Field({ nullable: true })
  actorName?: string;

  @Field({ nullable: true })
  actorProfilePicUrl?: string;

  @Field({ nullable: true })
  createdAt?: Date;
}

@ObjectType()
export class NotificationsResult {
  @Field(() => [NotificationOutput])
  notifications!: NotificationOutput[];

  @Field(() => Int)
  total!: number;
}

@Resolver()
export class NotificationResolver {
  private model = new NotificationsModel();

  @Query(() => [NotificationOutput])
  async getNotifications(
    @Arg('userId', () => ID) userId: string,
    @Arg('limit', { nullable: true }) limit?: number,
    @Arg('offset', { nullable: true }) offset?: number
  ): Promise<NotificationOutput[]> {
    const notifications = await this.model.getNotifications(
      userId,
      limit || 50,
      offset || 0
    );
    return notifications.map((n) => this.mapNotification(n));
  }

  @Query(() => Int)
  async getUnreadNotificationCount(
    @Arg('userId', () => ID) userId: string
  ): Promise<number> {
    return this.model.getUnreadCount(userId);
  }

  @Mutation(() => NotificationOutput)
  async markNotificationAsRead(
    @Arg('notificationId', () => ID) notificationId: string,
    @Arg('userId', () => ID) userId: string
  ): Promise<NotificationOutput> {
    const notification = await this.model.markAsRead(notificationId, userId);
    return this.mapNotification(notification);
  }

  @Mutation(() => Int)
  async markAllNotificationsAsRead(
    @Arg('userId', () => ID) userId: string
  ): Promise<number> {
    return this.model.markAllAsRead(userId);
  }

  @Mutation(() => NotificationOutput)
  async dismissNotification(
    @Arg('notificationId', () => ID) notificationId: string,
    @Arg('userId', () => ID) userId: string
  ): Promise<NotificationOutput> {
    const notification = await this.model.dismiss(notificationId, userId);
    return this.mapNotification(notification);
  }

  @Mutation(() => Boolean)
  async deleteNotification(
    @Arg('notificationId', () => ID) notificationId: string,
    @Arg('userId', () => ID) userId: string
  ): Promise<boolean> {
    return this.model.delete(notificationId, userId);
  }

  private mapNotification(notification: Notification): NotificationOutput {
    return {
      id: notification.id,
      userId: notification.userId,
      type: notification.type,
      title: notification.title,
      message: notification.message,
      status: notification.status,
      referenceId: notification.referenceId,
      referenceType: notification.referenceType,
      actorId: notification.actorId,
      actorName: notification.actor
        ? `${notification.actor.firstName} ${notification.actor.lastName}`
        : undefined,
      actorProfilePicUrl: notification.actor?.profilePicUrl,
      createdAt: notification.createdAt,
    };
  }
}
