import { Message } from '../entities/Message';
import { ServerMember } from '../entities/ServerMember';
import { User } from '../entities/User';
import { MessagesDao } from '../dao/messages.dao';
import { UsersDao } from '../dao/users.dao';
import { ServerMembersDao } from '../dao/serverMembers.dao';
import { ErrorHandler } from '../errors/ErrorHandler';

export type MessageWithSender = {
  id: string;
  content: string;
  senderId: string;
  senderUserName?: string;
  senderFirstName?: string;
  senderLastName?: string;
  senderAvatarUrl?: string;
  channelId?: string;
  serverId?: string;
  threadId?: string;
  isRead: boolean;
  reactions?: { emoji: string; users: string[] }[];
  createdAt: Date;
};

export class MessagesModel {
  private readonly messagesDao = new MessagesDao();
  private readonly usersDao = new UsersDao();
  private readonly membersDao = new ServerMembersDao();

  async sendMessage(
    senderId: string,
    content: string,
    options: {
      channelId?: string;
      serverId?: string;
      threadId?: string;
      recipientId?: string;
    }
  ): Promise<Message> {
    const { channelId, serverId, threadId, recipientId } = options;

    if (!senderId) {
      throw ErrorHandler.notAuthenticated();
    }

    // If in a server/channel, check membership
    if (serverId) {
      const membership = await this.membersDao.findByUserAndServer(
        senderId,
        serverId
      );
      if (!membership) {
        throw ErrorHandler.insufficientPermissions('send message in', 'server');
      }
    }

    const message = await this.messagesDao.create({
      senderId,
      content,
      recipientId: serverId ? null : recipientId || null,
      channelId: channelId || null,
      serverId: serverId || null,
      threadId: threadId || null,
      isRead: false,
    });

    return message;
  }

  async getChannelMessages(
    channelId: string,
    options: { limit?: number; before?: string }
  ): Promise<MessageWithSender[]> {
    const messages = await this.messagesDao.findByChannel(channelId, options);

    return messages.map((m) => ({
      id: m.id,
      content: m.content,
      senderId: m.senderId,
      senderUserName: m.sender?.userName,
      senderFirstName: m.sender?.firstName,
      senderLastName: m.sender?.lastName,
      senderAvatarUrl: m.sender?.avatarUrl,
      channelId: m.channelId || undefined,
      serverId: m.serverId || undefined,
      threadId: m.threadId || undefined,
      isRead: m.isRead,
      reactions: m.reactions || [],
      createdAt: m.createdAt,
    }));
  }

  async getDirectMessages(
    userId: string,
    otherUserId: string,
    options: { limit?: number; before?: string }
  ): Promise<MessageWithSender[]> {
    const messages = await this.messagesDao.findDirectMessages(
      userId,
      otherUserId,
      options
    );

    return messages.map((m) => ({
      id: m.id,
      content: m.content,
      senderId: m.senderId,
      senderUserName: m.sender?.userName,
      senderFirstName: m.sender?.firstName,
      senderLastName: m.sender?.lastName,
      senderAvatarUrl: m.sender?.avatarUrl,
      isRead: m.isRead,
      reactions: m.reactions || [],
      createdAt: m.createdAt,
    }));
  }

  async getConversations(userId: string): Promise<any[]> {
    const rawConversations = await this.messagesDao.findConversations(userId);

    const conversations = [];
    for (const msg of rawConversations) {
      const otherUser = await this.usersDao.findById(msg.otherUserId);
      if (otherUser) {
        // Get last message
        const lastMessages = await this.messagesDao.findDirectMessages(
          userId,
          msg.otherUserId,
          { limit: 1 }
        );
        const lastMessage = lastMessages[0];

        // Get unread count
        const unreadCount = await this.messagesDao.countUnread(
          userId,
          msg.otherUserId
        );

        conversations.push({
          odlFriendId: otherUser.id,
          odlFriendUserName: otherUser.userName,
          odlFriendFirstName: otherUser.firstName,
          odlFriendLastName: otherUser.lastName,
          odlFriendProfilePicUrl: otherUser.profilePicUrl,
          odlFriendAvatarUrl: otherUser.avatarUrl,
          lastMessage: lastMessage?.content || '',
          lastMessageDate: lastMessage?.createdAt || new Date(),
          unreadCount,
        });
      }
    }

    return conversations.sort(
      (a, b) =>
        new Date(b.lastMessageDate).getTime() -
        new Date(a.lastMessageDate).getTime()
    );
  }

  async addReaction(
    messageId: string,
    userId: string,
    emoji: string
  ): Promise<Message> {
    const message = await this.messagesDao.findById(messageId);

    if (!message) {
      throw ErrorHandler.notFound('Message', 'Message not found');
    }

    const reactions = message.reactions || [];
    const existingReaction = reactions.find((r) => r.emoji === emoji);
    if (existingReaction) {
      if (!existingReaction.users.includes(userId)) {
        existingReaction.users.push(userId);
      }
    } else {
      reactions.push({ emoji, users: [userId] });
    }

    message.reactions = reactions;
    return this.messagesDao.save(message);
  }

  async removeReaction(
    messageId: string,
    userId: string,
    emoji: string
  ): Promise<Message> {
    const message = await this.messagesDao.findById(messageId);

    if (!message) {
      throw ErrorHandler.notFound('Message', 'Message not found');
    }

    const reactions = message.reactions || [];
    const reactionIndex = reactions.findIndex((r) => r.emoji === emoji);

    if (reactionIndex >= 0) {
      reactions[reactionIndex].users = reactions[reactionIndex].users.filter(
        (u) => u !== userId
      );
      if (reactions[reactionIndex].users.length === 0) {
        reactions.splice(reactionIndex, 1);
      }
    }

    message.reactions = reactions;
    return this.messagesDao.save(message);
  }

  async markAsRead(messageId: string, userId: string): Promise<boolean> {
    const message = await this.messagesDao.findById(messageId);

    if (!message) return false;
    if (message.recipientId !== userId) return false;

    message.isRead = true;
    await this.messagesDao.save(message);
    return true;
  }

  async deleteMessage(messageId: string, userId: string): Promise<boolean> {
    const message = await this.messagesDao.findById(messageId);

    if (!message) return false;

    if (message.senderId !== userId) {
      throw ErrorHandler.insufficientPermissions('delete', 'message');
    }

    await this.messagesDao.remove(message);
    return true;
  }
}
