import { AppDataSource } from '../data-source';
import { Friend } from '../entities/Friend';
import { FriendStatus } from '../graphql/enums/FriendStatus';
import { Repository } from 'typeorm';
import { ErrorHandler } from '../errors/ErrorHandler';

export class FriendsDao {
  private get repo(): Repository<Friend> {
    return AppDataSource.getRepository(Friend);
  }

  async findById(id: string): Promise<Friend | null> {
    return this.repo.findOne({
      where: { id },
      relations: ['requester', 'recipient'],
    });
  }

  async findByUsers(
    requesterId: string,
    recipientId: string
  ): Promise<Friend | null> {
    return this.repo
      .createQueryBuilder('friend')
      .where(
        '(friend.requesterId = :user1 AND friend.recipientId = :user2) OR (friend.requesterId = :user2 AND friend.recipientId = :user1)',
        { user1: requesterId, user2: recipientId }
      )
      .getOne();
  }

  async findSentRequest(
    requesterId: string,
    recipientId: string
  ): Promise<Friend | null> {
    return this.repo
      .createQueryBuilder('friend')
      .where(
        'friend.requesterId = :requesterId AND friend.recipientId = :recipientId',
        {
          requesterId,
          recipientId,
        }
      )
      .getOne();
  }

  async create(requesterId: string, recipientId: string): Promise<Friend> {
    if (requesterId === recipientId) {
      throw ErrorHandler.operationNotAllowed('Cannot add yourself as a friend');
    }

    const existing = await this.findByUsers(requesterId, recipientId);
    if (existing) {
      throw ErrorHandler.operationNotAllowed('Friend request already exists');
    }

    const friend = this.repo.create({
      requesterId,
      recipientId,
      status: FriendStatus.PENDING,
    });

    return this.repo.save(friend);
  }

  async updateStatus(id: string, status: FriendStatus): Promise<Friend> {
    const friend = await this.findById(id);
    if (!friend) {
      throw ErrorHandler.notFound('Friend', 'Friend request not found');
    }

    friend.status = status;
    return this.repo.save(friend);
  }

  async getFriendsList(userId: string): Promise<Friend[]> {
    return this.repo
      .createQueryBuilder('friend')
      .leftJoinAndSelect('friend.requester', 'requester')
      .leftJoinAndSelect('friend.recipient', 'recipient')
      .where(
        '(friend.requesterId = :userId OR friend.recipientId = :userId) AND friend.status = :status',
        { userId, status: FriendStatus.ACCEPTED }
      )
      .orderBy('friend.createdAt', 'DESC')
      .getMany();
  }

  async getPendingRequests(userId: string): Promise<Friend[]> {
    return this.repo
      .createQueryBuilder('friend')
      .leftJoinAndSelect('friend.requester', 'requester')
      .leftJoinAndSelect('friend.recipient', 'recipient')
      .where('friend.recipientId = :userId AND friend.status = :status', {
        userId,
        status: FriendStatus.PENDING,
      })
      .orderBy('friend.createdAt', 'DESC')
      .getMany();
  }

  async getSentRequests(userId: string): Promise<Friend[]> {
    return this.repo
      .createQueryBuilder('friend')
      .leftJoinAndSelect('friend.requester', 'requester')
      .leftJoinAndSelect('friend.recipient', 'recipient')
      .where('friend.requesterId = :userId AND friend.status = :status', {
        userId,
        status: FriendStatus.PENDING,
      })
      .orderBy('friend.createdAt', 'DESC')
      .getMany();
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.repo.delete({ id });
    return result.affected === 1;
  }

  async deleteByUsers(
    requesterId: string,
    recipientId: string
  ): Promise<boolean> {
    const result = await this.repo
      .createQueryBuilder('friend')
      .where(
        '(friend.requesterId = :user1 AND friend.recipientId = :user2) OR (friend.requesterId = :user2 AND friend.recipientId = :user1)',
        { user1: requesterId, user2: recipientId }
      )
      .delete()
      .execute();
    return result.affected === 1;
  }

  async blockUser(requesterId: string, recipientId: string): Promise<Friend> {
    const existing = await this.findByUsers(requesterId, recipientId);

    if (existing) {
      existing.status = FriendStatus.BLOCKED;
      return this.repo.save(existing);
    }

    const friend = this.repo.create({
      requesterId,
      recipientId,
      status: FriendStatus.BLOCKED,
    });

    return this.repo.save(friend);
  }
}
