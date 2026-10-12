import { InputType, Field, ID, ObjectType } from 'type-graphql';
import { Resolver, Query, Mutation, Arg, Authorized, Ctx } from 'type-graphql';
import { AppDataSource } from '../data-source';
import { Server, ServerType } from '../entities/Server';
import { Channel, ChannelType } from '../entities/Channel';
import { ServerMember, ServerRole } from '../entities/ServerMember';
import { ErrorHandler } from '../errors/ErrorHandler';
import { GraphQLContext } from '../graphql/context';
import { messagingActor, MessagingAccess } from '../services/MessagingAccess';
import { MessagesDao } from '../dao/messages.dao';
import { Message } from '../entities/Message';
import { User } from '../entities/User';
import { publishMessageEvent } from '../services/MessageEventsService';
import * as fs from 'fs';
import * as path from 'path';

@InputType()
export class CreateServerInput {
  @Field()
  name!: string;

  @Field({ nullable: true })
  description?: string;

  @Field(() => ServerType, { nullable: true })
  type?: ServerType;

  @Field({ nullable: true })
  iconUrl?: string;

  @Field({ nullable: true })
  iconBase64?: string;
}

@InputType()
export class CreateChannelInput {
  @Field()
  name!: string;

  @Field({ nullable: true })
  description?: string;

  @Field(() => ChannelType)
  type!: ChannelType;

  @Field(() => ID)
  serverId!: string;

  @Field(() => ID, { nullable: true })
  parentChannelId?: string;
}

@InputType()
export class JoinServerInput {
  @Field(() => ID)
  serverId!: string;

  @Field(() => ID)
  userId!: string;
}

@ObjectType()
export class ServerWithChannels {
  @Field(() => ID)
  id!: string;

  @Field()
  name!: string;

  @Field({ nullable: true })
  description?: string;

  @Field(() => ServerType)
  type!: ServerType;

  @Field({ nullable: true })
  iconUrl?: string;

  @Field(() => ID)
  ownerId!: string;

  @Field(() => [ChannelOutput])
  channels!: ChannelOutput[];

  @Field()
  memberCount!: number;

  @Field(() => ServerRole, { nullable: true })
  userRole?: ServerRole;
}

@ObjectType()
export class ChannelOutput {
  @Field(() => ID)
  id!: string;

  @Field()
  name!: string;

  @Field({ nullable: true })
  description?: string;

  @Field(() => ChannelType)
  type!: ChannelType;

  @Field(() => ID)
  serverId!: string;

  @Field({ nullable: true })
  parentChannelId?: string;

  @Field({ nullable: true })
  lastMessage?: string;

  @Field({ nullable: true })
  unreadCount?: number;
}

@ObjectType()
export class UserServerMembership {
  @Field(() => ID)
  serverId!: string;

  @Field()
  serverName!: string;

  @Field({ nullable: true })
  iconUrl?: string;

  @Field(() => ServerRole)
  role!: ServerRole;

  @Field()
  joinedAt!: Date;

  @Field(() => [ChannelOutput], { nullable: true })
  channels?: ChannelOutput[];
}

@Resolver(() => Server)
export class ServerResolver {
  private access = new MessagingAccess();
  private messagesDao = new MessagesDao();
  private serverRepo = AppDataSource.getRepository(Server);
  private channelRepo = AppDataSource.getRepository(Channel);
  private memberRepo = AppDataSource.getRepository(ServerMember);

  @Query(() => [ServerWithChannels])
  async getServers(@Ctx() ctx: GraphQLContext): Promise<ServerWithChannels[]> {
    const userId = messagingActor(ctx);
    const memberships = await this.memberRepo.find({ where: { userId } });
    const roles = new Map(memberships.map((m) => [m.serverId, m.role]));
    const servers = await this.serverRepo.find({
      relations: ['channels'],
      order: { createdAt: 'DESC' },
    });

    const results: ServerWithChannels[] = [];
    for (const server of servers) {
      if (server.type === ServerType.PRIVATE && !roles.has(server.id)) continue;
      const memberCount = await this.memberRepo.count({
        where: { serverId: server.id },
      });
      results.push({
        ...server,
        channels: roles.has(server.id) ? server.channels || [] : [],
        memberCount,
        userRole: roles.get(server.id) || null,
      });
    }
    return results;
  }

  @Query(() => ServerWithChannels, { nullable: true })
  async getServer(
    @Ctx() ctx: GraphQLContext,
    @Arg('serverId', () => ID) serverId: string,
    @Arg('userId', () => ID, { nullable: true }) userId?: string
  ): Promise<ServerWithChannels | null> {
    userId = messagingActor(ctx, userId);
    console.log('[getServer] Fetching server:', serverId);

    const server = await this.serverRepo.findOne({
      where: { id: serverId },
    });

    if (!server) {
      console.log('[getServer] Server not found:', serverId);
      return null;
    }

    await this.access.member(userId, serverId);

    const channels = await this.channelRepo.find({
      where: { serverId: server.id },
      order: { createdAt: 'ASC' },
    });

    console.log(
      '[getServer] Channels found:',
      channels.length,
      channels.map((c) => c.name)
    );

    const channelOutputs: ChannelOutput[] = await Promise.all(
      channels.map(async (channel) => ({
        id: channel.id,
        name: channel.name,
        description: channel.description,
        type: channel.type,
        serverId: channel.serverId,
        parentChannelId: channel.parentChannelId,
        lastMessage: null,
        unreadCount: await this.messagesDao.channelUnread(userId, channel.id),
      }))
    );

    const memberCount = await this.memberRepo.count({
      where: { serverId: server.id },
    });

    let userRole: ServerRole | null = null;
    if (userId) {
      const membership = await this.memberRepo.findOne({
        where: { serverId, userId },
      });
      userRole = membership?.role || null;
    }

    return {
      ...server,
      channels: channelOutputs,
      memberCount,
      userRole,
    };
  }

  @Query(() => [UserServerMembership])
  async getUserServers(
    @Ctx() ctx: GraphQLContext,
    @Arg('userId', () => ID) userId: string
  ): Promise<UserServerMembership[]> {
    userId = messagingActor(ctx, userId);
    const memberships = await this.memberRepo.find({
      where: { userId },
      relations: ['server'],
      order: { joinedAt: 'DESC' },
    });

    const results = [];
    for (const m of memberships) {
      const channels = await this.channelRepo.find({
        where: { serverId: m.serverId },
        order: { createdAt: 'ASC' },
      });

      results.push({
        serverId: m.serverId,
        serverName: m.server.name,
        iconUrl: m.server.iconUrl,
        role: m.role,
        joinedAt: m.joinedAt,
        channels: channels.map((c) => ({
          id: c.id,
          name: c.name,
          type: c.type,
          serverId: c.serverId,
        })),
      });
    }

    return results;
  }

  @Query(() => [ChannelOutput])
  async getServerChannels(
    @Ctx() ctx: GraphQLContext,
    @Arg('serverId', () => ID) serverId: string
  ): Promise<ChannelOutput[]> {
    const userId = messagingActor(ctx);
    await this.access.member(userId, serverId);
    const channels = await this.channelRepo.find({
      where: { serverId },
      order: { createdAt: 'ASC' },
    });

    return Promise.all(
      channels.map(async (c) => ({
        ...c,
        lastMessage: null,
        unreadCount: await this.messagesDao.channelUnread(userId, c.id),
      }))
    );
  }

  @Mutation(() => ServerWithChannels)
  async createServer(
    @Ctx() ctx: GraphQLContext,
    @Arg('data') data: CreateServerInput,
    @Arg('userId', () => ID) userId: string
  ): Promise<ServerWithChannels> {
    userId = messagingActor(ctx, userId);
    if (!data.name?.trim() || data.name.length > 100)
      throw ErrorHandler.invalidInput(
        'Server names must contain 1 to 100 characters'
      );
    let iconUrl = data.iconUrl;

    // If iconBase64 is provided, save it
    if (data.iconBase64) {
      try {
        const base64Data = data.iconBase64.replace(
          /^data:image\/\w+;base64,/,
          ''
        );
        const imageBuffer = Buffer.from(base64Data, 'base64');

        let extension = 'jpg';
        if (data.iconBase64.includes('image/png')) extension = 'png';
        else if (data.iconBase64.includes('image/gif')) extension = 'gif';
        else if (data.iconBase64.includes('image/webp')) extension = 'webp';

        const tempServerId = `new_${Date.now()}`;
        const fileName = `server_${tempServerId}.${extension}`;
        const uploadsDir = path.join(
          __dirname,
          '..',
          '..',
          'uploads',
          'servers'
        );
        const filePath = path.join(uploadsDir, fileName);

        if (!fs.existsSync(uploadsDir)) {
          fs.mkdirSync(uploadsDir, { recursive: true });
        }

        fs.writeFileSync(filePath, imageBuffer);
        iconUrl = `/uploads/servers/${fileName}`;
        console.log(`[Server] Icon uploaded: ${iconUrl}`);
      } catch (iconError) {
        console.error('[Server] Icon upload error:', iconError);
      }
    }

    return AppDataSource.transaction(async (manager) => {
      const server = await manager.getRepository(Server).save({
        name: data.name.trim(),
        description: data.description,
        type: data.type || ServerType.PUBLIC,
        iconUrl,
        ownerId: userId,
      });
      const generalChannel = await manager.getRepository(Channel).save({
        name: 'general',
        description: 'General discussion',
        type: ChannelType.TEXT,
        serverId: server.id,
      });
      await manager
        .getRepository(ServerMember)
        .save({ userId, serverId: server.id, role: ServerRole.OWNER });
      await publishMessageEvent(manager, {
        kind: 'membership',
        serverId: server.id,
        userIds: [userId],
      });
      return {
        ...server,
        channels: [generalChannel],
        memberCount: 1,
        userRole: ServerRole.OWNER,
      };
    });
  }

  @Mutation(() => ChannelOutput)
  async createChannel(
    @Ctx() ctx: GraphQLContext,
    @Arg('data') data: CreateChannelInput,
    @Arg('userId', () => ID) userId: string
  ): Promise<ChannelOutput> {
    userId = messagingActor(ctx, userId);
    const server = await this.serverRepo.findOne({
      where: { id: data.serverId },
    });

    if (!server) {
      throw ErrorHandler.notFound('Server', data.serverId);
    }

    await this.access.manage(userId, data.serverId);
    if (data.parentChannelId) {
      const parent = await this.access.channel(userId, data.parentChannelId);
      if (parent.serverId !== data.serverId)
        throw ErrorHandler.invalidInput(
          'Parent channel must belong to this server'
        );
    }

    if (!data.name?.trim() || data.name.length > 100)
      throw ErrorHandler.invalidInput(
        'Channel names must contain 1 to 100 characters'
      );
    const channel = await AppDataSource.transaction(async (manager) => {
      const saved = await manager.getRepository(Channel).save({
        name: data.name.trim(),
        description: data.description,
        type: data.type,
        serverId: data.serverId,
        parentChannelId: data.parentChannelId,
      });
      const members = await manager
        .getRepository(ServerMember)
        .find({ where: { serverId: data.serverId } });
      await publishMessageEvent(manager, {
        kind: 'membership',
        serverId: data.serverId,
        userIds: members.map((m) => m.userId),
      });
      return saved;
    });

    console.log('[ServerResolver] Channel created:', channel.id, channel.name);

    return {
      ...channel,
      lastMessage: null,
      unreadCount: 0,
    };
  }

  @Mutation(() => Boolean)
  async deleteChannel(
    @Ctx() ctx: GraphQLContext,
    @Arg('channelId', () => ID) channelId: string,
    @Arg('userId', () => ID) userId: string
  ): Promise<boolean> {
    userId = messagingActor(ctx, userId);
    const channel = await this.channelRepo.findOne({
      where: { id: channelId },
      relations: ['server'],
    });

    if (!channel) {
      throw ErrorHandler.notFound('Channel', channelId);
    }

    const membership = await this.memberRepo.findOne({
      where: { serverId: channel.serverId, userId },
    });

    if (
      !membership ||
      ![ServerRole.OWNER, ServerRole.ADMIN].includes(membership.role)
    ) {
      throw ErrorHandler.insufficientPermissions('delete channel', 'channel');
    }

    await AppDataSource.transaction(async (manager) => {
      await manager.getRepository(Message).delete({ channelId });
      await manager.getRepository(Channel).delete(channelId);
      const members = await manager
        .getRepository(ServerMember)
        .find({ where: { serverId: channel.serverId } });
      await publishMessageEvent(manager, {
        kind: 'membership',
        serverId: channel.serverId,
        userIds: members.map((m) => m.userId),
      });
    });
    return true;
  }

  private async addMember(
    serverId: string,
    targetId: string,
    actorId: string,
    invitation: boolean
  ): Promise<boolean> {
    return AppDataSource.transaction(async (manager) => {
      const server = await manager
        .getRepository(Server)
        .findOne({
          where: { id: serverId },
          lock: { mode: 'pessimistic_write' },
        });
      if (!server) throw ErrorHandler.notFound('Server', serverId);
      if (invitation) await this.access.manage(actorId, serverId);
      const repo = manager.getRepository(ServerMember);
      if (!(await repo.findOne({ where: { serverId, userId: targetId } }))) {
        if (!invitation && server.type === ServerType.PRIVATE)
          throw ErrorHandler.forbidden('Private servers require an invitation');
        if (
          !(await manager
            .getRepository(User)
            .findOne({ where: { id: targetId } }))
        )
          throw ErrorHandler.userNotFound(targetId);
        await repo.save({
          serverId,
          userId: targetId,
          role: ServerRole.MEMBER,
        });
        await publishMessageEvent(manager, {
          kind: 'membership',
          serverId,
          userIds: [targetId],
        });
      }
      return true;
    });
  }

  @Mutation(() => Boolean)
  async joinServer(
    @Ctx() ctx: GraphQLContext,
    @Arg('data') data: JoinServerInput
  ): Promise<boolean> {
    const actorId = messagingActor(ctx, data.userId);
    return this.addMember(data.serverId, actorId, actorId, false);
  }

  @Mutation(() => Boolean)
  async inviteServerMember(
    @Ctx() ctx: GraphQLContext,
    @Arg('data') data: JoinServerInput
  ): Promise<boolean> {
    return this.addMember(
      data.serverId,
      data.userId,
      messagingActor(ctx),
      true
    );
  }

  @Mutation(() => Boolean)
  async leaveServer(
    @Ctx() ctx: GraphQLContext,
    @Arg('serverId', () => ID) serverId: string,
    @Arg('userId', () => ID) userId: string
  ): Promise<boolean> {
    userId = messagingActor(ctx, userId);
    const membership = await this.memberRepo.findOne({
      where: { serverId, userId },
    });

    if (!membership) return false;

    // Can't leave if you're the owner
    if (membership.role === ServerRole.OWNER) {
      throw ErrorHandler.operationNotAllowed(
        'Owners cannot leave their server. Transfer ownership first or delete the server.'
      );
    }

    await AppDataSource.transaction(async (manager) => {
      await manager.getRepository(ServerMember).remove(membership);
      await publishMessageEvent(manager, {
        kind: 'membership',
        serverId,
        userIds: [userId],
      });
    });
    return true;
  }

  @Mutation(() => Boolean)
  async deleteServer(
    @Ctx() ctx: GraphQLContext,
    @Arg('serverId', () => ID) serverId: string,
    @Arg('userId', () => ID) userId: string
  ): Promise<boolean> {
    userId = messagingActor(ctx, userId);
    const membership = await this.memberRepo.findOne({
      where: { serverId, userId },
    });

    if (!membership || membership.role !== ServerRole.OWNER) {
      throw ErrorHandler.insufficientPermissions('delete server', 'server');
    }

    await AppDataSource.transaction(async (manager) => {
      const members = await manager
        .getRepository(ServerMember)
        .find({ where: { serverId } });
      const channels = await manager
        .getRepository(Channel)
        .find({ where: { serverId } });
      for (const channel of channels)
        await manager.getRepository(Message).delete({ channelId: channel.id });
      await manager.getRepository(Message).delete({ serverId });
      await manager.getRepository(ServerMember).delete({ serverId });
      await manager.getRepository(Channel).delete({ serverId });
      await manager.getRepository(Server).delete(serverId);
      await publishMessageEvent(manager, {
        kind: 'membership',
        serverId,
        userIds: members.map((m) => m.userId),
      });
    });

    return true;
  }

  @Query(() => [Server])
  async searchServers(
    @Ctx() ctx: GraphQLContext,
    @Arg('query') query: string,
    @Arg('limit', { nullable: true }) limit?: number
  ): Promise<Server[]> {
    const userId = messagingActor(ctx);
    return this.serverRepo
      .createQueryBuilder('server')
      .where(
        '(LOWER(server.name) LIKE LOWER(:query) OR LOWER(server.description) LIKE LOWER(:query))',
        { query: `%${query}%` }
      )
      .andWhere(
        '(server.type <> :private OR EXISTS (SELECT 1 FROM server_member member WHERE member.server_id = server.id AND member.user_id = :userId))',
        { private: ServerType.PRIVATE, userId }
      )
      .take(limit || 20)
      .getMany();
  }
}
