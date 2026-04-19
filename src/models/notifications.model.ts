import { NotificationsDao } from '../dao/notifications.dao';
import { Notification } from '../entities/Notification';
import { NotificationType } from '../graphql/enums/NotificationType';
import { ErrorHandler } from '../errors/ErrorHandler';

export class NotificationsModel {
  private readonly dao: NotificationsDao;

  constructor() {
    this.dao = new NotificationsDao();
  }

  async createNotification(data: {
    userId: string;
    type: NotificationType;
    title: string;
    message: string;
    referenceId?: string;
    referenceType?: string;
    actorId?: string;
  }): Promise<Notification> {
    return this.dao.create(data);
  }

  async getNotifications(
    userId: string,
    limit: number = 50,
    offset: number = 0
  ): Promise<Notification[]> {
    return this.dao.getByUserId(userId, limit, offset);
  }

  async getUnreadCount(userId: string): Promise<number> {
    return this.dao.getUnreadCount(userId);
  }

  async markAsRead(
    notificationId: string,
    userId: string
  ): Promise<Notification> {
    const notification = await this.dao.findById(notificationId);
    if (!notification) {
      throw ErrorHandler.notFound('Notification', 'Notification not found');
    }

    if (notification.userId !== userId) {
      throw ErrorHandler.insufficientPermissions(
        'mark as read',
        'notification'
      );
    }

    return this.dao.markAsRead(notificationId, userId);
  }

  async markAllAsRead(userId: string): Promise<number> {
    return this.dao.markAllAsRead(userId);
  }

  async dismiss(notificationId: string, userId: string): Promise<Notification> {
    const notification = await this.dao.findById(notificationId);
    if (!notification) {
      throw ErrorHandler.notFound('Notification', 'Notification not found');
    }

    if (notification.userId !== userId) {
      throw ErrorHandler.insufficientPermissions('dismiss', 'notification');
    }

    return this.dao.dismiss(notificationId, userId);
  }

  async delete(notificationId: string, userId: string): Promise<boolean> {
    const notification = await this.dao.findById(notificationId);
    if (!notification) {
      throw ErrorHandler.notFound('Notification', 'Notification not found');
    }

    if (notification.userId !== userId) {
      throw ErrorHandler.insufficientPermissions('delete', 'notification');
    }

    return this.dao.delete(notificationId, userId);
  }

  async notifyOnMessage(
    recipientId: string,
    senderId: string,
    senderName: string,
    messageId: string,
    messagePreview: string
  ): Promise<Notification> {
    const preview =
      messagePreview.length > 50
        ? messagePreview.substring(0, 50) + '...'
        : messagePreview;

    return this.createNotification({
      userId: recipientId,
      type: NotificationType.MESSAGE,
      title: 'New Message',
      message: `${senderName}: ${preview}`,
      referenceId: messageId,
      referenceType: 'message',
      actorId: senderId,
    });
  }

  async notifyOnThreadReply(
    threadAuthorId: string,
    replierId: string,
    replierName: string,
    threadId: string,
    threadTitle: string,
    postId: string
  ): Promise<Notification> {
    return this.createNotification({
      userId: threadAuthorId,
      type: NotificationType.THREAD_REPLY,
      title: 'New Reply',
      message: `${replierName} replied to your thread "${threadTitle}"`,
      referenceId: postId,
      referenceType: 'post',
      actorId: replierId,
    });
  }

  async notifyOnFriendRequest(
    recipientId: string,
    requesterId: string,
    requesterName: string
  ): Promise<Notification> {
    return this.createNotification({
      userId: recipientId,
      type: NotificationType.FRIEND_REQUEST,
      title: 'Friend Request',
      message: `${requesterName} sent you a friend request`,
      referenceId: requesterId,
      referenceType: 'user',
      actorId: requesterId,
    });
  }

  async notifyOnFriendAccepted(
    requesterId: string,
    accepterId: string,
    accepterName: string
  ): Promise<Notification> {
    return this.createNotification({
      userId: requesterId,
      type: NotificationType.FRIEND_ACCEPTED,
      title: 'Friend Request Accepted',
      message: `${accepterName} accepted your friend request`,
      referenceId: accepterId,
      referenceType: 'user',
      actorId: accepterId,
    });
  }
}
