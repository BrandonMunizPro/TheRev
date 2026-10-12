import { Message } from '../entities/Message';
import { ServerRole } from '../entities/ServerMember';
import {
  MessagesDao,
  CursorMessage,
  MessagePageOptions,
} from '../dao/messages.dao';
import { UsersDao } from '../dao/users.dao';
import { MessagingAccess } from '../services/MessagingAccess';
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
  cursor?: string;
};
export function messageOutput(m: CursorMessage): MessageWithSender {
  return {
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
    cursor: m.cursor,
  };
}
export class MessagesModel {
  private readonly messagesDao = new MessagesDao();
  private readonly usersDao = new UsersDao();
  private readonly access = new MessagingAccess();

  private content(content: string): string {
    if (
      typeof content !== 'string' ||
      !content.trim() ||
      content.length > 10000
    ) {
      throw ErrorHandler.invalidInput(
        'Messages must contain 1 to 10000 characters'
      );
    }
    return content;
  }
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
    if (!senderId) throw ErrorHandler.notAuthenticated();
    content = this.content(content);
    const { channelId, serverId, threadId, recipientId } = options;
    if (threadId)
      throw ErrorHandler.invalidInput(
        'Use a discussion channel for threaded messages'
      );
    if (
      !!channelId === !!recipientId ||
      (recipientId && serverId) ||
      (serverId && !channelId)
    ) {
      throw ErrorHandler.invalidInput(
        'Choose exactly one channel or direct-message recipient'
      );
    }
    let destinationServer: string;
    if (channelId) {
      const channel = await this.access.channel(senderId, channelId, true);
      if (serverId && serverId !== channel.serverId)
        throw ErrorHandler.forbidden('Channel does not belong to this server');
      destinationServer = channel.serverId;
    } else {
      if (recipientId === senderId)
        throw ErrorHandler.invalidInput('Choose another user');
      if (!(await this.usersDao.findById(recipientId)))
        throw ErrorHandler.userNotFound(recipientId);
    }
    return this.messagesDao.create({
      senderId,
      content,
      recipientId: recipientId || null,
      channelId: channelId || null,
      serverId: destinationServer || null,
      threadId: null,
      isRead: false,
    });
  }
  async getChannelMessages(
    channelId: string,
    options: MessagePageOptions,
    userId: string
  ): Promise<MessageWithSender[]> {
    await this.access.channel(userId, channelId);
    return (await this.messagesDao.findByChannel(channelId, options)).map(
      messageOutput
    );
  }
  async getDirectMessages(
    userId: string,
    otherUserId: string,
    options: MessagePageOptions
  ): Promise<MessageWithSender[]> {
    if (!userId) throw ErrorHandler.notAuthenticated();
    return (
      await this.messagesDao.findDirectMessages(userId, otherUserId, options)
    ).map(messageOutput);
  }
  async getMessage(
    messageId: string,
    userId: string
  ): Promise<MessageWithSender | null> {
    const message = await this.messagesDao.findById(messageId);
    if (!message) return null;
    await this.access.message(userId, message);
    return messageOutput(message);
  }
  async getConversations(userId: string): Promise<any[]> {
    if (!userId) throw ErrorHandler.notAuthenticated();
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

  private async mutate(
    messageId: string,
    userId: string,
    action: (message: Message) => Promise<'delete' | void>
  ): Promise<Message> {
    return this.messagesDao.mutate(messageId, async (message) => {
      await this.access.message(userId, message);
      return action(message);
    });
  }
  async editMessage(
    messageId: string,
    userId: string,
    content: string
  ): Promise<Message> {
    content = this.content(content);
    return this.mutate(messageId, userId, async (message) => {
      if (message.senderId !== userId)
        throw ErrorHandler.forbidden('Only the sender can edit a message');
      if (message.channelId)
        await this.access.channel(userId, message.channelId, true);
      message.content = content;
    });
  }
  async addReaction(
    messageId: string,
    userId: string,
    emoji: string
  ): Promise<Message> {
    if (!emoji?.trim() || emoji.length > 32)
      throw ErrorHandler.invalidInput('Invalid reaction');
    return this.mutate(messageId, userId, async (message) => {
      const reactions = message.reactions || [];
      const existing = reactions.find((r) => r.emoji === emoji);
      if (existing) {
        if (!existing.users.includes(userId)) existing.users.push(userId);
      } else {
        if (reactions.length >= 30)
          throw ErrorHandler.invalidInput('Too many reactions');
        reactions.push({ emoji, users: [userId] });
      }
      message.reactions = reactions;
    });
  }
  async removeReaction(
    messageId: string,
    userId: string,
    emoji: string
  ): Promise<Message> {
    return this.mutate(messageId, userId, async (message) => {
      message.reactions = (message.reactions || [])
        .map((r) =>
          r.emoji === emoji
            ? { ...r, users: r.users.filter((id) => id !== userId) }
            : r
        )
        .filter((r) => r.users.length);
    });
  }
  async markAsRead(messageId: string, userId: string): Promise<boolean> {
    const message = await this.messagesDao.findById(messageId);
    if (!message) return false;
    await this.access.message(userId, message);
    if (message.channelId)
      await this.messagesDao.markChannelRead(
        userId,
        message.channelId,
        messageId
      );
    else {
      if (message.recipientId !== userId)
        throw ErrorHandler.forbidden(
          'Only the recipient can mark a DM as read'
        );
      await this.messagesDao.markDirectRead(
        userId,
        message.senderId,
        messageId
      );
    }
    return true;
  }
  async markConversationRead(
    userId: string,
    throughId: string,
    channelId?: string,
    otherUserId?: string
  ): Promise<boolean> {
    if (!!channelId === !!otherUserId)
      throw ErrorHandler.invalidInput('Choose one conversation');
    const message = await this.messagesDao.findById(throughId);
    if (!message) throw ErrorHandler.notFound('Message', throughId);
    await this.access.message(userId, message);
    if (channelId) {
      if (message.channelId !== channelId)
        throw ErrorHandler.forbidden('Read marker must belong to this channel');
      await this.messagesDao.markChannelRead(userId, channelId, throughId);
    } else {
      if (
        message.channelId ||
        !(
          (message.senderId === userId &&
            message.recipientId === otherUserId) ||
          (message.senderId === otherUserId && message.recipientId === userId)
        )
      )
        throw ErrorHandler.forbidden('Read marker must belong to this DM');
      await this.messagesDao.markDirectRead(userId, otherUserId, throughId);
    }
    return true;
  }
  async deleteMessage(messageId: string, userId: string): Promise<boolean> {
    await this.mutate(messageId, userId, async (message) => {
      if (message.senderId !== userId) {
        if (!message.channelId)
          throw ErrorHandler.forbidden('Only the sender can delete a DM');
        const channel = await this.access.channel(userId, message.channelId);
        const member = await this.access.member(userId, channel.serverId);
        if (
          ![ServerRole.OWNER, ServerRole.ADMIN, ServerRole.MODERATOR].includes(
            member.role
          )
        )
          throw ErrorHandler.forbidden(
            'Only the sender or server staff can delete a message'
          );
      }
      return 'delete';
    });
    return true;
  }
}
