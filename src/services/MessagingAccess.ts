import { AppDataSource } from '../data-source';
import { Channel, ChannelType } from '../entities/Channel';
import { Message } from '../entities/Message';
import { ServerMember, ServerRole } from '../entities/ServerMember';
import { ErrorHandler } from '../errors/ErrorHandler';
import { GraphQLContext } from '../graphql/context';

// Legacy GraphQL identity arguments remain compatible, but never grant authority.
export function messagingActor(
  ctx: GraphQLContext,
  claimedId?: string
): string {
  const id = ctx.user?.userId;
  if (!id) throw ErrorHandler.notAuthenticated();
  if (claimedId && claimedId !== id) throw ErrorHandler.userMismatch();
  return id;
}

export class MessagingAccess {
  async member(userId: string, serverId: string): Promise<ServerMember> {
    if (!userId) throw ErrorHandler.notAuthenticated();
    const member = await AppDataSource.getRepository(ServerMember).findOne({
      where: { userId, serverId },
    });
    if (!member) throw ErrorHandler.forbidden('Server membership required');
    return member;
  }

  async manage(userId: string, serverId: string): Promise<ServerMember> {
    const member = await this.member(userId, serverId);
    if (![ServerRole.OWNER, ServerRole.ADMIN].includes(member.role)) {
      throw ErrorHandler.forbidden('Server owner or administrator required');
    }
    return member;
  }

  async channel(
    userId: string,
    channelId: string,
    writing = false
  ): Promise<Channel> {
    const channel = await AppDataSource.getRepository(Channel).findOne({
      where: { id: channelId },
    });
    if (!channel) throw ErrorHandler.notFound('Channel', channelId);
    const member = await this.member(userId, channel.serverId);
    if (writing && channel.type === ChannelType.VOICE) {
      throw ErrorHandler.invalidInput(
        'Voice channels do not accept text messages'
      );
    }
    if (
      writing &&
      channel.type === ChannelType.ANNOUNCEMENT &&
      ![ServerRole.OWNER, ServerRole.ADMIN, ServerRole.MODERATOR].includes(
        member.role
      )
    ) {
      throw ErrorHandler.forbidden('Only server staff can post announcements');
    }
    return channel;
  }

  async message(userId: string, message: Message): Promise<void> {
    if (!userId) throw ErrorHandler.notAuthenticated();
    if (message.channelId) {
      const channel = await this.channel(userId, message.channelId);
      if (message.serverId && channel.serverId !== message.serverId)
        throw ErrorHandler.forbidden();
    } else if (
      message.serverId ||
      message.threadId ||
      (message.senderId !== userId && message.recipientId !== userId)
    ) {
      throw ErrorHandler.forbidden('Message participant access required');
    }
  }
}
