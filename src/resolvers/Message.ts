import { InputType, Field, ID, ObjectType } from 'type-graphql';
import { Resolver, Query, Mutation, Arg, Ctx } from 'type-graphql';
import {
  MessagesModel,
  MessageWithSender,
  messageOutput,
} from '../models/messages.model';
import { NotificationsModel } from '../models/notifications.model';
import { UsersDao } from '../dao/users.dao';
import { ErrorHandler } from '../errors/ErrorHandler';
import { GraphQLContext } from '../graphql/context';
import { messagingActor } from '../services/MessagingAccess';

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

  @Field({ nullable: true })
  senderProfilePicUrl?: string;

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

  @Field({ nullable: true })
  cursor?: string;
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
    @Ctx() ctx: GraphQLContext,
    @Arg('channelId', () => ID) channelId: string,
    @Arg('limit', { nullable: true }) limit?: number,
    @Arg('before', { nullable: true }) before?: string
  ): Promise<MessageOutput[]> {
    const userId = messagingActor(ctx);
    const messages = await this.model.getChannelMessages(
      channelId,
      {
        limit,
        before,
      },
      userId
    );
    return messages;
  }

  @Query(() => [MessageOutput])
  async getDirectMessages(
    @Ctx() ctx: GraphQLContext,
    @Arg('userId', () => ID) userId: string,
    @Arg('otherUserId', () => ID) otherUserId: string,
    @Arg('limit', { nullable: true }) limit?: number,
    @Arg('before', { nullable: true }) before?: string
  ): Promise<MessageOutput[]> {
    userId = messagingActor(ctx, userId);
    return this.model.getDirectMessages(userId, otherUserId, { limit, before });
  }

  @Query(() => [ConversationOutput])
  async getConversations(
    @Ctx() ctx: GraphQLContext,
    @Arg('userId', () => ID) userId: string
  ): Promise<ConversationOutput[]> {
    userId = messagingActor(ctx, userId);
    return this.model.getConversations(userId);
  }

  @Mutation(() => MessageOutput)
  async sendMessage(
    @Ctx() ctx: GraphQLContext,
    @Arg('senderId', () => ID) senderId: string,
    @Arg('data') data: SendMessageInput
  ): Promise<MessageOutput> {
    senderId = messagingActor(ctx, senderId);
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
        await this.notificationsModel
          .notifyOnMessage(
            data.recipientId,
            senderId,
            senderName,
            message.id,
            data.content
          )
          .catch((error) =>
            console.error(
              '[Messages] Notification delivery failed:',
              error.message
            )
          );
      }
    }

    return messageOutput(message);
  }

  @Mutation(() => MessageOutput)
  async addReaction(
    @Ctx() ctx: GraphQLContext,
    @Arg('userId', () => ID) userId: string,
    @Arg('data') data: ReactionInput
  ): Promise<MessageOutput> {
    userId = messagingActor(ctx, userId);
    const message = await this.model.addReaction(
      data.messageId,
      userId,
      data.emoji
    );

    return messageOutput(message);
  }

  @Mutation(() => MessageOutput)
  async removeReaction(
    @Ctx() ctx: GraphQLContext,
    @Arg('userId', () => ID) userId: string,
    @Arg('data') data: ReactionInput
  ): Promise<MessageOutput> {
    userId = messagingActor(ctx, userId);
    const message = await this.model.removeReaction(
      data.messageId,
      userId,
      data.emoji
    );

    return messageOutput(message);
  }

  @Mutation(() => Boolean)
  async markMessageAsRead(
    @Ctx() ctx: GraphQLContext,
    @Arg('messageId', () => ID) messageId: string,
    @Arg('userId', () => ID) userId: string
  ): Promise<boolean> {
    userId = messagingActor(ctx, userId);
    return this.model.markAsRead(messageId, userId);
  }

  @Mutation(() => Boolean)
  async deleteMessage(
    @Ctx() ctx: GraphQLContext,
    @Arg('messageId', () => ID) messageId: string,
    @Arg('userId', () => ID) userId: string
  ): Promise<boolean> {
    userId = messagingActor(ctx, userId);
    return this.model.deleteMessage(messageId, userId);
  }
  @Mutation(() => MessageOutput)
  async editMessage(
    @Ctx() ctx: GraphQLContext,
    @Arg('messageId', () => ID) messageId: string,
    @Arg('content') content: string
  ): Promise<MessageOutput> {
    return messageOutput(
      await this.model.editMessage(messageId, messagingActor(ctx), content)
    );
  }

  @Query(() => MessageOutput, { nullable: true })
  async messageById(
    @Ctx() ctx: GraphQLContext,
    @Arg('messageId', () => ID) messageId: string
  ): Promise<MessageOutput | null> {
    return this.model.getMessage(messageId, messagingActor(ctx));
  }

  @Mutation(() => Boolean)
  async markConversationRead(
    @Ctx() ctx: GraphQLContext,
    @Arg('throughMessageId', () => ID) throughMessageId: string,
    @Arg('channelId', () => ID, { nullable: true }) channelId?: string,
    @Arg('otherUserId', () => ID, { nullable: true }) otherUserId?: string
  ): Promise<boolean> {
    return this.model.markConversationRead(
      messagingActor(ctx),
      throughMessageId,
      channelId,
      otherUserId
    );
  }
}
