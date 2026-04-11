import { FriendsDao } from '../dao/friends.dao';
import { Friend } from '../entities/Friend';
import { FriendStatus } from '../graphql/enums/FriendStatus';
import { UsersDao } from '../dao/users.dao';
import { ErrorHandler } from '../errors/ErrorHandler';

export type FriendWithUser = {
  id: string;
  userId: string;
  userName: string;
  firstName: string;
  lastName: string;
  profilePicUrl?: string;
  avatarUrl?: string;
  status?: FriendStatus;
  createdAt?: Date;
};

export class FriendsModel {
  private readonly dao: FriendsDao;
  private readonly usersDao: UsersDao;

  constructor() {
    this.dao = new FriendsDao();
    this.usersDao = new UsersDao();
  }

  async sendFriendRequest(
    requesterId: string,
    recipientId: string
  ): Promise<Friend> {
    const recipient = await this.usersDao.findById(recipientId);
    if (!recipient) {
      throw ErrorHandler.userNotFound(recipientId);
    }

    const existing = await this.dao.findByUsers(requesterId, recipientId);
    if (existing) {
      if (existing.status === FriendStatus.BLOCKED) {
        throw ErrorHandler.operationNotAllowed('Cannot send friend request');
      }
      if (existing.status === FriendStatus.PENDING) {
        throw ErrorHandler.operationNotAllowed(
          'Friend request already pending'
        );
      }
    }

    return this.dao.create(requesterId, recipientId);
  }

  async acceptRequest(friendId: string, userId: string): Promise<Friend> {
    const friend = await this.dao.findById(friendId);
    if (!friend) {
      throw ErrorHandler.notFound('Friend', 'Friend request not found');
    }

    if (friend.recipientId !== userId) {
      throw ErrorHandler.insufficientPermissions('accept', 'friend request');
    }

    if (friend.status !== FriendStatus.PENDING) {
      throw ErrorHandler.operationNotAllowed('Request already processed');
    }

    return this.dao.updateStatus(friendId, FriendStatus.ACCEPTED);
  }

  async declineRequest(friendId: string, userId: string): Promise<boolean> {
    const friend = await this.dao.findById(friendId);
    if (!friend) {
      throw ErrorHandler.notFound('Friend', 'Friend request not found');
    }

    if (friend.recipientId !== userId) {
      throw ErrorHandler.insufficientPermissions('decline', 'friend request');
    }

    return this.dao.delete(friendId);
  }

  async getFriendsList(userId: string): Promise<FriendWithUser[]> {
    const friends = await this.dao.getFriendsList(userId);
    return friends.map((friend) => this.mapFriendToUser(friend, userId));
  }

  async getPendingRequests(userId: string): Promise<FriendWithUser[]> {
    const requests = await this.dao.getPendingRequests(userId);
    return requests.map((friend) => ({
      id: friend.id,
      userId: friend.requesterId,
      userName: friend.requester?.userName || '',
      firstName: friend.requester?.firstName || '',
      lastName: friend.requester?.lastName || '',
      profilePicUrl: friend.requester?.profilePicUrl,
      avatarUrl: friend.requester?.avatarUrl,
      status: friend.status,
      createdAt: friend.createdAt,
    }));
  }

  async unfriend(userId: string, friendId: string): Promise<boolean> {
    const friend = await this.dao.findById(friendId);
    if (!friend) {
      throw ErrorHandler.notFound('Friend', 'Friend not found');
    }

    if (friend.requesterId !== userId && friend.recipientId !== userId) {
      throw ErrorHandler.insufficientPermissions('unfriend', 'friend');
    }

    return this.dao.delete(friendId);
  }

  async cancelRequest(userId: string, friendId: string): Promise<boolean> {
    const friend = await this.dao.findById(friendId);
    if (!friend) {
      throw ErrorHandler.notFound('Friend', 'Friend request not found');
    }

    if (friend.requesterId !== userId) {
      throw ErrorHandler.insufficientPermissions('cancel', 'friend request');
    }

    if (friend.status !== FriendStatus.PENDING) {
      throw ErrorHandler.operationNotAllowed('Request already processed');
    }

    return this.dao.delete(friendId);
  }

  async blockUser(requesterId: string, recipientId: string): Promise<Friend> {
    return this.dao.blockUser(requesterId, recipientId);
  }

  async searchUsers(
    query: string,
    currentUserId: string,
    limit: number = 20
  ): Promise<FriendWithUser[]> {
    const users = await this.usersDao.searchByUsername(query, limit);

    const results: FriendWithUser[] = [];
    for (const user of users) {
      if (user.id === currentUserId) continue;

      const existing = await this.dao.findByUsers(currentUserId, user.id);
      const sentRequest = await this.dao.findSentRequest(
        currentUserId,
        user.id
      );

      let friendId = '';
      let status: FriendStatus | undefined;
      let createdAt: Date | undefined;

      if (sentRequest) {
        friendId = sentRequest.id;
        status = sentRequest.status;
        createdAt = sentRequest.createdAt;
      } else if (existing) {
        friendId = existing.id;
        status = existing.status;
        createdAt = existing.createdAt;
      }

      results.push({
        id: friendId,
        userId: user.id,
        userName: user.userName,
        firstName: user.firstName,
        lastName: user.lastName,
        profilePicUrl: user.profilePicUrl,
        avatarUrl: user.avatarUrl,
        status,
        createdAt,
      });
    }

    return results;
  }

  async isFriend(userId: string, otherUserId: string): Promise<boolean> {
    const friend = await this.dao.findByUsers(userId, otherUserId);
    return friend?.status === FriendStatus.ACCEPTED;
  }

  async getFriendById(friendId: string): Promise<FriendWithUser | null> {
    const friend = await this.dao.findById(friendId);
    if (!friend) return null;

    const isRequester = friend.requesterId !== undefined;
    const otherUser = isRequester ? friend.recipient : friend.requester;

    return {
      id: friend.id,
      userId: otherUser?.id || '',
      userName: otherUser?.userName || '',
      firstName: otherUser?.firstName || '',
      lastName: otherUser?.lastName || '',
      profilePicUrl: otherUser?.profilePicUrl,
      avatarUrl: otherUser?.avatarUrl,
      status: friend.status,
      createdAt: friend.createdAt,
    };
  }

  private mapFriendToUser(
    friend: Friend,
    currentUserId: string
  ): FriendWithUser {
    const isRequester = friend.requesterId === currentUserId;
    const otherUser = isRequester ? friend.recipient : friend.requester;

    return {
      id: friend.id,
      userId: otherUser?.id || '',
      userName: otherUser?.userName || '',
      firstName: otherUser?.firstName || '',
      lastName: otherUser?.lastName || '',
      profilePicUrl: otherUser?.profilePicUrl,
      avatarUrl: otherUser?.avatarUrl,
      status: friend.status,
      createdAt: friend.createdAt,
    };
  }
}
