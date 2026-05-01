import { AppDataSource } from '../data-source';
import { ServerMember } from '../entities/ServerMember';
import { Repository } from 'typeorm';

export class ServerMembersDao {
  private get repo(): Repository<ServerMember> {
    return AppDataSource.getRepository(ServerMember);
  }

  async findByUserAndServer(
    userId: string,
    serverId: string
  ): Promise<ServerMember | null> {
    return this.repo.findOne({
      where: { userId, serverId },
    });
  }

  async findByServer(serverId: string): Promise<ServerMember[]> {
    return this.repo.find({
      where: { serverId },
    });
  }

  async create(data: Partial<ServerMember>): Promise<ServerMember> {
    const member = this.repo.create(data);
    return this.repo.save(member);
  }

  async remove(member: ServerMember): Promise<void> {
    await this.repo.remove(member);
  }
}
