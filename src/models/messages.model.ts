import { AppDataSource } from '../data-source';
import { Message } from '../entities/Message';
import { ServerMember } from '../entities/ServerMember';
import { User } from '../entities/User';
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
  private messageRepo = AppDataSource.getRepository(Message);
  private memberRepo = AppDataSource.getRepository(ServerMember);
  private userRepo = AppDataSource.getRepository(User);

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

    // Validate sender exists
    if (!senderId) {
      throw ErrorHandler.notAuthenticated();
    }

    // If in a server/channel, check membership
    if (serverId) {
      const membership = await this.memberRepo.findOne({
        where: { serverId, userId: senderId },
      });
      if (!membership) {
        throw ErrorHandler.insufficientPermissions('send message in', 'server');
      }
    }

    // For server messages, recipientId should be null (not needed)
    // For DMs, recipientId is required
    const finalRecipientId = serverId ? null : recipientId || null;
    const finalChannelId = channelId || null;
    const finalServerId = serverId || null;

    const message = this.messageRepo.create({
      senderId,
      content,
      recipientId: finalRecipientId,
      channelId: finalChannelId,
      serverId: finalServerId,
      threadId: threadId || null,
      isRead: false,
    });

    return this.messageRepo.save(message);
  }

  async getChannelMessages(
    channelId: string,
    options: { limit?: number; before?: string }
  ): Promise<MessageWithSender[]> {
    const query = this.messageRepo
      .createQueryBuilder('message')
      .leftJoinAndSelect('message.sender', 'sender')
      .where('message.channelId = :channelId', { channelId })
      .orderBy('message.createdAt', 'DESC')
      .take(options.limit || 50);

    if (options.before) {
      query.andWhere('message.id < :before', { before: options.before });
    }

    const messages = await query.getMany();

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
    const query = this.messageRepo
      .createQueryBuilder('message')
      .leftJoinAndSelect('message.sender', 'sender')
      .where(
        '(message.senderId = :userId AND message.recipientId = :otherUserId) OR (message.senderId = :otherUserId AND message.recipientId = :userId)',
        { userId, otherUserId }
      )
      .andWhere('message.serverId IS NULL')
      .andWhere('message.channelId IS NULL')
      .orderBy('message.createdAt', 'DESC')
      .take(options.limit || 50);

    if (options.before) {
      query.andWhere('message.id < :before', { before: options.before });
    }

    const messages = await query.getMany();

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
    // Get all unique conversations (other users user has messaged with)
    const messages = await this.messageRepo
      .createQueryBuilder('message')
      .select(
        'DISTINCT CASE WHEN message.senderId = :userId THEN message.recipientId ELSE message.senderId END',
        'otherUserId'
      )
      .setParameter('userId', userId)
      .where('message.serverId IS NULL')
      .andWhere('message.channelId IS NULL')
      .andWhere(
        '(message.senderId = :userId OR message.recipientId = :userId)',
        { userId }
      )
      .getRawMany();

    const conversations = [];
    for (const msg of messages) {
      const otherUser = await this.userRepo.findOne({
        where: { id: msg.otherUserId },
      });
      if (otherUser) {
        // Get last message
        const lastMessage = await this.messageRepo
          .createQueryBuilder('message')
          .where(
            '(message.senderId = :userId AND message.recipientId = :otherUserId) OR (message.senderId = :otherUserId AND message.recipientId = :userId)',
            { userId, otherUserId: msg.otherUserId }
          )
          .orderBy('message.createdAt', 'DESC')
          .limit(1)
          .getOne();

        // Get unread count
        const unreadCount = await this.messageRepo.count({
          where: {
            senderId: msg.otherUserId,
            recipientId: userId,
            isRead: false,
          },
        });

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
    const message = await this.messageRepo.findOne({
      where: { id: messageId },
    });

    if (!message) {
      throw ErrorHandler.notFound('Message', 'Message not found');
    }

    const reactions = message.reactions || [];

    // Find existing emoji reaction
    const existingReaction = reactions.find((r) => r.emoji === emoji);
    if (existingReaction) {
      if (!existingReaction.users.includes(userId)) {
        existingReaction.users.push(userId);
      }
    } else {
      reactions.push({ emoji, users: [userId] });
    }

    message.reactions = reactions;
    return this.messageRepo.save(message);
  }

  async removeReaction(
    messageId: string,
    userId: string,
    emoji: string
  ): Promise<Message> {
    const message = await this.messageRepo.findOne({
      where: { id: messageId },
    });

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
    return this.messageRepo.save(message);
  }

  async markAsRead(messageId: string, userId: string): Promise<boolean> {
    const message = await this.messageRepo.findOne({
      where: { id: messageId },
    });

    if (!message) return false;

    if (message.recipientId !== userId) {
      return false;
    }

    message.isRead = true;
    await this.messageRepo.save(message);
    return true;
  }

  async deleteMessage(messageId: string, userId: string): Promise<boolean> {
    const message = await this.messageRepo.findOne({
      where: { id: messageId },
    });

    if (!message) return false;

    if (message.senderId !== userId) {
      throw ErrorHandler.insufficientPermissions('delete', 'message');
    }

    await this.messageRepo.remove(message);
    return true;
  }
}
