import { AppDataSource } from '../data-source';
import { Message } from '../entities/Message';
import { Repository } from 'typeorm';

export class MessagesDao {
  private get repo(): Repository<Message> {
    return AppDataSource.getRepository(Message);
  }

  async findById(id: string): Promise<Message | null> {
    return this.repo.findOne({ where: { id } });
  }

  async findByChannel(
    channelId: string,
    options: { limit?: number; before?: string }
  ): Promise<Message[]> {
    const query = this.repo
      .createQueryBuilder('message')
      .leftJoinAndSelect('message.sender', 'sender')
      .where('message.channelId = :channelId', { channelId })
      .orderBy('message.createdAt', 'DESC')
      .take(options.limit || 50);

    if (options.before) {
      query.andWhere('message.id < :before', { before: options.before });
    }

    return query.getMany();
  }

  async findDirectMessages(
    userId: string,
    otherUserId: string,
    options: { limit?: number; before?: string }
  ): Promise<Message[]> {
    const query = this.repo
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

    return query.getMany();
  }

  async findConversations(userId: string): Promise<{ otherUserId: string }[]> {
    return this.repo
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
  }

  async findByThread(
    threadId: string,
    options: { limit?: number; before?: string }
  ): Promise<Message[]> {
    const query = this.repo
      .createQueryBuilder('message')
      .leftJoinAndSelect('message.sender', 'sender')
      .where('message.threadId = :threadId', { threadId })
      .orderBy('message.createdAt', 'DESC')
      .take(options.limit || 50);

    if (options.before) {
      query.andWhere('message.id < :before', { before: options.before });
    }

    return query.getMany();
  }

  async create(data: Partial<Message>): Promise<Message> {
    const message = this.repo.create(data);
    return this.repo.save(message);
  }

  async save(message: Message): Promise<Message> {
    return this.repo.save(message);
  }

  async remove(message: Message): Promise<void> {
    await this.repo.remove(message);
  }

  async countUnread(userId: string, senderId: string): Promise<number> {
    return this.repo.count({
      where: {
        senderId,
        recipientId: userId,
        isRead: false,
      },
    });
  }
}
