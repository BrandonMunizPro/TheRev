import { InputType, Field, ID, ObjectType } from 'type-graphql';
import { Resolver, Query, Mutation, Arg, Authorized, Ctx } from 'type-graphql';
import { AppDataSource } from '../data-source';
import { Server, ServerType } from '../entities/Server';
import { Channel, ChannelType } from '../entities/Channel';
import { ServerMember, ServerRole } from '../entities/ServerMember';
import { ErrorHandler } from '../errors/ErrorHandler';
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
  private serverRepo = AppDataSource.getRepository(Server);
  private channelRepo = AppDataSource.getRepository(Channel);
  private memberRepo = AppDataSource.getRepository(ServerMember);

  @Query(() => [ServerWithChannels])
  async getServers(): Promise<ServerWithChannels[]> {
    const servers = await this.serverRepo.find({
      relations: ['channels'],
      order: { createdAt: 'DESC' },
    });

    const results: ServerWithChannels[] = [];
    for (const server of servers) {
      const memberCount = await this.memberRepo.count({
        where: { serverId: server.id },
      });
      results.push({
        ...server,
        channels: server.channels || [],
        memberCount,
        userRole: null,
      });
    }
    return results;
  }

  @Query(() => ServerWithChannels, { nullable: true })
  async getServer(
    @Arg('serverId', () => ID) serverId: string,
    @Arg('userId', () => ID, { nullable: true }) userId?: string
  ): Promise<ServerWithChannels | null> {
    const server = await this.serverRepo.findOne({
      where: { id: serverId },
      relations: ['channels'],
    });

    if (!server) return null;

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
      channels: server.channels || [],
      memberCount,
      userRole,
    };
  }

  @Query(() => [UserServerMembership])
  async getUserServers(
    @Arg('userId', () => ID) userId: string
  ): Promise<UserServerMembership[]> {
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
        })),
      });
    }

    return results;
  }

  @Query(() => [ChannelOutput])
  async getServerChannels(
    @Arg('serverId', () => ID) serverId: string
  ): Promise<ChannelOutput[]> {
    const channels = await this.channelRepo.find({
      where: { serverId },
      order: { createdAt: 'ASC' },
    });

    return channels.map((c) => ({
      ...c,
      lastMessage: null,
      unreadCount: 0,
    }));
  }

  @Mutation(() => ServerWithChannels)
  async createServer(
    @Arg('data') data: CreateServerInput,
    @Arg('userId', () => ID) userId: string
  ): Promise<ServerWithChannels> {
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

    const server = await this.serverRepo.save({
      name: data.name,
      description: data.description,
      type: data.type || ServerType.PUBLIC,
      iconUrl: iconUrl,
      ownerId: userId,
    });

    // Create default "general" text channel
    const generalChannel = await this.channelRepo.save({
      name: 'general',
      description: 'General discussion',
      type: ChannelType.TEXT,
      serverId: server.id,
    });

    // Add creator as owner
    await this.memberRepo.save({
      userId,
      serverId: server.id,
      role: ServerRole.OWNER,
    });

    return {
      ...server,
      channels: [generalChannel],
      memberCount: 1,
      userRole: ServerRole.OWNER,
    };
  }

  @Mutation(() => ChannelOutput)
  async createChannel(
    @Arg('data') data: CreateChannelInput
  ): Promise<ChannelOutput> {
    const channel = await this.channelRepo.save({
      name: data.name,
      description: data.description,
      type: data.type,
      serverId: data.serverId,
      parentChannelId: data.parentChannelId,
    });

    return {
      ...channel,
      lastMessage: null,
      unreadCount: 0,
    };
  }

  @Mutation(() => Boolean)
  async joinServer(@Arg('data') data: JoinServerInput): Promise<boolean> {
    // Check if already a member
    const existing = await this.memberRepo.findOne({
      where: { serverId: data.serverId, userId: data.userId },
    });

    if (existing) return true;

    await this.memberRepo.save({
      userId: data.userId,
      serverId: data.serverId,
      role: ServerRole.MEMBER,
    });

    return true;
  }

  @Mutation(() => Boolean)
  async leaveServer(
    @Arg('serverId', () => ID) serverId: string,
    @Arg('userId', () => ID) userId: string
  ): Promise<boolean> {
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

    await this.memberRepo.remove(membership);
    return true;
  }

  @Mutation(() => Boolean)
  async deleteServer(
    @Arg('serverId', () => ID) serverId: string,
    @Arg('userId', () => ID) userId: string
  ): Promise<boolean> {
    const membership = await this.memberRepo.findOne({
      where: { serverId, userId },
    });

    if (!membership || membership.role !== ServerRole.OWNER) {
      throw ErrorHandler.insufficientPermissions('delete server', 'server');
    }

    // Delete all members first
    await this.memberRepo.delete({ serverId });
    // Delete all channels
    await this.channelRepo.delete({ serverId });
    // Delete server
    await this.serverRepo.delete(serverId);

    return true;
  }

  @Query(() => [Server])
  async searchServers(
    @Arg('query') query: string,
    @Arg('limit', { nullable: true }) limit?: number
  ): Promise<Server[]> {
    return this.serverRepo
      .createQueryBuilder('server')
      .where('LOWER(server.name) LIKE LOWER(:query)', { query: `%${query}%` })
      .orWhere('LOWER(server.description) LIKE LOWER(:query)', {
        query: `%${query}%`,
      })
      .take(limit || 20)
      .getMany();
  }
}
