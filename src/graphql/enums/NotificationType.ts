import { registerEnumType } from 'type-graphql';

export enum NotificationType {
  MESSAGE = 'MESSAGE',
  THREAD_REPLY = 'THREAD_REPLY',
  FRIEND_REQUEST = 'FRIEND_REQUEST',
  FRIEND_ACCEPTED = 'FRIEND_ACCEPTED',
  THREAD_MENTION = 'THREAD_MENTION',
  POST_UPVOTE = 'POST_UPVOTE',
  SERVER_INVITE = 'SERVER_INVITE',
  CHANNEL_MESSAGE = 'CHANNEL_MESSAGE',
}

registerEnumType(NotificationType, {
  name: 'NotificationType',
  description: 'Type of notification',
});

export enum NotificationStatus {
  UNREAD = 'UNREAD',
  READ = 'READ',
  DISMISSED = 'DISMISSED',
}

registerEnumType(NotificationStatus, {
  name: 'NotificationStatus',
  description: 'Notification read status',
});
