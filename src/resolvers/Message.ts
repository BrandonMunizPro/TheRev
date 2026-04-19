import { InputType, Field, ID, ObjectType } from 'type-graphql';
import { Resolver, Query, Mutation, Arg, Ctx } from 'type-graphql';
import { MessagesModel, MessageWithSender } from '../models/messages.model';
import { NotificationsModel } from '../models/notifications.model';
import { UsersDao } from '../dao/users.dao';
import { ErrorHandler } from '../errors/ErrorHandler';

@InputType()
export class SendMessageInput {
  @Field()
  content!: string;

  @Field(() => ID, { nullable: true })
  channelId?: string;

  @Field(() => ID, { nullable: true })
  serverId?: string;

  @Field(() => ID, { nullable: true })
  threadId?: string;

  @Field(() => ID, { nullable: true })
  recipientId?: string;
}

@InputType()
export class ReactionInput {
  @Field(() => ID)
  messageId!: string;

  @Field()
  emoji!: string;
}

@ObjectType()
export class ReactionOutput {
  @Field()
  emoji!: string;

  @Field(() => [String])
  users!: string[];
}

@ObjectType()
export class MessageOutput implements MessageWithSender {
  @Field(() => ID)
  id!: string;

  @Field()
  content!: string;

  @Field(() => ID)
  senderId!: string;

  @Field({ nullable: true })
  senderUserName?: string;

  @Field({ nullable: true })
  senderFirstName?: string;

  @Field({ nullable: true })
  senderLastName?: string;

  @Field({ nullable: true })
  senderAvatarUrl?: string;

  @Field(() => ID, { nullable: true })
  channelId?: string;

  @Field(() => ID, { nullable: true })
  serverId?: string;

  @Field(() => ID, { nullable: true })
  threadId?: string;

  @Field()
  isRead!: boolean;

  @Field(() => [ReactionOutput], { nullable: true })
  reactions?: ReactionOutput[];

  @Field()
  createdAt!: Date;
}

@ObjectType()
export class ConversationOutput {
  @Field(() => ID)
  odlFriendId!: string;

  @Field()
  odlFriendUserName!: string;

  @Field()
  odlFriendFirstName!: string;

  @Field()
  odlFriendLastName!: string;

  @Field({ nullable: true })
  odlFriendProfilePicUrl?: string;

  @Field({ nullable: true })
  odlFriendAvatarUrl?: string;

  @Field()
  lastMessage!: string;

  @Field()
  lastMessageDate!: Date;

  @Field()
  unreadCount!: number;
}

@Resolver()
export class MessageResolver {
  private model = new MessagesModel();
  private notificationsModel = new NotificationsModel();
  private usersDao = new UsersDao();

  @Query(() => [MessageOutput])
  async getChannelMessages(
    @Arg('channelId', () => ID) channelId: string,
    @Arg('limit', { nullable: true }) limit?: number,
    @Arg('before', { nullable: true }) before?: string
  ): Promise<MessageOutput[]> {
    const messages = await this.model.getChannelMessages(channelId, {
      limit,
      before,
    });
    return messages;
  }

  @Query(() => [MessageOutput])
  async getDirectMessages(
    @Arg('userId', () => ID) userId: string,
    @Arg('otherUserId', () => ID) otherUserId: string,
    @Arg('limit', { nullable: true }) limit?: number,
    @Arg('before', { nullable: true }) before?: string
  ): Promise<MessageOutput[]> {
    return this.model.getDirectMessages(userId, otherUserId, { limit, before });
  }

  @Query(() => [ConversationOutput])
  async getConversations(
    @Arg('userId', () => ID) userId: string
  ): Promise<ConversationOutput[]> {
    return this.model.getConversations(userId);
  }

  @Mutation(() => MessageOutput)
  async sendMessage(
    @Arg('senderId', () => ID) senderId: string,
    @Arg('data') data: SendMessageInput
  ): Promise<MessageOutput> {
    const message = await this.model.sendMessage(senderId, data.content, {
      channelId: data.channelId,
      serverId: data.serverId,
      threadId: data.threadId,
      recipientId: data.recipientId,
    });

    // Send notification for direct messages
    if (data.recipientId) {
      const sender = await this.usersDao.findById(senderId);
      if (sender) {
        const senderName =
          `${sender.firstName} ${sender.lastName}`.trim() || sender.userName;
        await this.notificationsModel.notifyOnMessage(
          data.recipientId,
          senderId,
          senderName,
          message.id,
          data.content
        );
      }
    }

    return {
      id: message.id,
      content: message.content,
      senderId: message.senderId,
      senderUserName: message.sender?.userName,
      senderFirstName: message.sender?.firstName,
      senderLastName: message.sender?.lastName,
      senderAvatarUrl: message.sender?.avatarUrl,
      channelId: message.channelId || undefined,
      serverId: message.serverId || undefined,
      threadId: message.threadId || undefined,
      isRead: message.isRead,
      reactions: message.reactions || [],
      createdAt: message.createdAt,
    };
  }

  @Mutation(() => MessageOutput)
  async addReaction(
    @Arg('userId', () => ID) userId: string,
    @Arg('data') data: ReactionInput
  ): Promise<MessageOutput> {
    const message = await this.model.addReaction(
      data.messageId,
      userId,
      data.emoji
    );

    return {
      id: message.id,
      content: message.content,
      senderId: message.senderId,
      senderUserName: message.sender?.userName,
      senderFirstName: message.sender?.firstName,
      senderLastName: message.sender?.lastName,
      senderAvatarUrl: message.sender?.avatarUrl,
      isRead: message.isRead,
      reactions: message.reactions || [],
      createdAt: message.createdAt,
    };
  }

  @Mutation(() => MessageOutput)
  async removeReaction(
    @Arg('userId', () => ID) userId: string,
    @Arg('data') data: ReactionInput
  ): Promise<MessageOutput> {
    const message = await this.model.removeReaction(
      data.messageId,
      userId,
      data.emoji
    );

    return {
      id: message.id,
      content: message.content,
      senderId: message.senderId,
      senderUserName: message.sender?.userName,
      senderFirstName: message.sender?.firstName,
      senderLastName: message.sender?.lastName,
      senderAvatarUrl: message.sender?.avatarUrl,
      isRead: message.isRead,
      reactions: message.reactions || [],
      createdAt: message.createdAt,
    };
  }

  @Mutation(() => Boolean)
  async markMessageAsRead(
    @Arg('messageId', () => ID) messageId: string,
    @Arg('userId', () => ID) userId: string
  ): Promise<boolean> {
    return this.model.markAsRead(messageId, userId);
  }

  @Mutation(() => Boolean)
  async deleteMessage(
    @Arg('messageId', () => ID) messageId: string,
    @Arg('userId', () => ID) userId: string
  ): Promise<boolean> {
    return this.model.deleteMessage(messageId, userId);
  }
}
