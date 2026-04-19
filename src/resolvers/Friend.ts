import { InputType, Field, ID, ObjectType } from 'type-graphql';
import { Resolver, Query, Mutation, Arg } from 'type-graphql';
import { FriendsModel, FriendWithUser } from '../models/friends.model';
import { Friend } from '../entities/Friend';
import { FriendStatus } from '../graphql/enums/FriendStatus';
import { NotificationsModel } from '../models/notifications.model';
import { UsersDao } from '../dao/users.dao';
import { ErrorHandler } from '../errors/ErrorHandler';

@InputType()
export class SendFriendRequestInput {
  @Field(() => ID)
  recipientId!: string;
}

@ObjectType()
export class FriendWithUserOutput {
  @Field(() => ID)
  id!: string;

  @Field(() => ID)
  userId!: string;

  @Field()
  userName!: string;

  @Field()
  firstName!: string;

  @Field()
  lastName!: string;

  @Field({ nullable: true })
  profilePicUrl?: string;

  @Field({ nullable: true })
  avatarUrl?: string;

  @Field(() => FriendStatus, { nullable: true })
  status?: FriendStatus;

  @Field({ nullable: true })
  createdAt?: Date;
}

@Resolver()
export class FriendResolver {
  private model = new FriendsModel();
  private notificationsModel = new NotificationsModel();
  private usersDao = new UsersDao();

  @Query(() => [FriendWithUserOutput])
  async getFriends(
    @Arg('userId', () => ID) userId: string
  ): Promise<FriendWithUser[]> {
    return this.model.getFriendsList(userId);
  }

  @Query(() => [FriendWithUserOutput])
  async getPendingRequests(
    @Arg('userId', () => ID) userId: string
  ): Promise<FriendWithUser[]> {
    return this.model.getPendingRequests(userId);
  }

  @Query(() => [FriendWithUserOutput])
  async searchUsers(
    @Arg('query') query: string,
    @Arg('userId', () => ID) userId: string,
    @Arg('limit', { nullable: true }) limit?: number
  ): Promise<FriendWithUser[]> {
    return this.model.searchUsers(query, userId, limit);
  }

  @Query(() => Boolean)
  async isFriend(
    @Arg('userId', () => ID) userId: string,
    @Arg('otherUserId', () => ID) otherUserId: string
  ): Promise<boolean> {
    return this.model.isFriend(userId, otherUserId);
  }

  @Query(() => FriendWithUserOutput, { nullable: true })
  async getFriend(
    @Arg('friendId', () => ID) friendId: string
  ): Promise<FriendWithUser | null> {
    return this.model.getFriendById(friendId);
  }

  @Mutation(() => Friend)
  async sendFriendRequest(
    @Arg('requesterId', () => ID) requesterId: string,
    @Arg('data') data: SendFriendRequestInput
  ): Promise<Friend> {
    const friend = await this.model.sendFriendRequest(
      requesterId,
      data.recipientId
    );

    // Send notification to recipient
    const requester = await this.usersDao.findById(requesterId);
    if (requester) {
      const requesterName =
        `${requester.firstName} ${requester.lastName}`.trim() ||
        requester.userName;
      await this.notificationsModel.notifyOnFriendRequest(
        data.recipientId,
        requesterId,
        requesterName
      );
    }

    return friend;
  }

  @Mutation(() => Friend)
  async acceptFriendRequest(
    @Arg('friendId', () => ID) friendId: string,
    @Arg('userId', () => ID) userId: string
  ): Promise<Friend> {
    const friend = await this.model.acceptRequest(friendId, userId);

    // Send notification to requester
    if (friend.requesterId) {
      const accepter = await this.usersDao.findById(userId);
      if (accepter) {
        const accepterName =
          `${accepter.firstName} ${accepter.lastName}`.trim() ||
          accepter.userName;
        await this.notificationsModel.notifyOnFriendAccepted(
          friend.requesterId,
          userId,
          accepterName
        );
      }
    }

    return friend;
  }

  @Mutation(() => Boolean)
  async declineFriendRequest(
    @Arg('friendId', () => ID) friendId: string,
    @Arg('userId', () => ID) userId: string
  ): Promise<boolean> {
    return this.model.declineRequest(friendId, userId);
  }

  @Mutation(() => Boolean)
  async unfriend(
    @Arg('userId', () => ID) userId: string,
    @Arg('friendId', () => ID) friendId: string
  ): Promise<boolean> {
    return this.model.unfriend(userId, friendId);
  }

  @Mutation(() => Boolean)
  async cancelFriendRequest(
    @Arg('userId', () => ID) userId: string,
    @Arg('friendId', () => ID) friendId: string
  ): Promise<boolean> {
    return this.model.cancelRequest(userId, friendId);
  }

  @Mutation(() => Friend)
  async blockUser(
    @Arg('requesterId', () => ID) requesterId: string,
    @Arg('recipientId', () => ID) recipientId: string
  ): Promise<Friend> {
    return this.model.blockUser(requesterId, recipientId);
  }
}
