import { InputType, Field, ID, Int, ObjectType } from 'type-graphql';
import { Resolver, Query, Mutation, Arg } from 'type-graphql';
import { User } from '../entities/User';
import { UsersModel } from '../models/users.model';
import { FriendsModel } from '../models/friends.model';
import { IsOptional, IsString, IsEmail } from 'class-validator';
import { AppDataSource } from '../data-source';
import { ErrorHandler } from '../errors/ErrorHandler';
import { Thread } from '../entities/Thread';
import { Post } from '../entities/Post';

@ObjectType()
export class UserStats {
  @Field(() => Int)
  threads!: number;

  @Field(() => Int)
  posts!: number;

  @Field(() => Int)
  replies!: number;
}

//WE NEED TO ADD ROLES TO USER AS WELL
@InputType()
export class CreateUserInput {
  @Field()
  userName!: string;

  @Field()
  firstName!: string;

  @Field()
  lastName!: string;

  @Field()
  email!: string;

  @Field()
  password!: string;

  @Field({ nullable: true })
  bio?: string;

  @Field({ nullable: true })
  ideology?: string;
}

@InputType()
export class EditUserInput {
  @Field({ nullable: true })
  userName?: string;

  @Field({ nullable: true })
  firstName?: string;

  @Field({ nullable: true })
  lastName?: string;

  @Field({ nullable: true })
  email?: string;

  @Field({ nullable: true })
  password?: string;

  @Field({ nullable: true })
  bio?: string;

  @Field({ nullable: true })
  ideology?: string;
}

@InputType()
export class GetUserInput {
  @Field(() => ID, { nullable: true })
  id?: string;

  @Field({ nullable: true })
  userName?: string;

  @Field({ nullable: true })
  email?: string;
}

export type UserIdentifier = {
  userName?: string;
  email?: string;
};

@InputType()
export class UserIdentifierInput {
  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  userName?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsEmail()
  email?: string;
}

export type returnedUser = {
  id?: string;
  userName?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  role?: string;
  bio?: string;
  ideology?: string;
  profilePicUrl?: string;
  isOnline?: boolean;
  password?: string; // only internal
  jwt?: string; // returned after login
  createdAt?: Date;
  updatedAt?: Date;
};

@Resolver()
export class UserResolver {
  private model = new UsersModel();

  @Query(() => [User])
  async users(): Promise<User[]> {
    return this.model.getAllUsers();
  }

  @Query(() => User, { nullable: true })
  async user(@Arg('data') data: GetUserInput): Promise<returnedUser | null> {
    if (!data.id && !data.userName && !data.email) {
      throw ErrorHandler.missingRequiredFields(['id', 'username', 'email']);
    }
    return this.model.getUser(data);
  }

  @Mutation(() => User)
  async createUser(@Arg('data') data: CreateUserInput): Promise<returnedUser> {
    return this.model.registerUser(data);
  }

  @Mutation(() => User)
  async editUser(
    @Arg('id', () => ID) id: string,
    @Arg('data') data: EditUserInput
  ): Promise<returnedUser> {
    return this.model.editUser(id, data);
  }

  @Mutation(() => Boolean)
  async deleteUser(@Arg('id', () => ID) id: string): Promise<boolean> {
    return this.model.deleteUser(id);
  }

  @Mutation(() => User)
  async updateUserAvatar(
    @Arg('userId', () => ID) userId: string,
    @Arg('avatarUrl', { nullable: true }) avatarUrl?: string,
    @Arg('avatarConfig', { nullable: true }) avatarConfig?: string
  ): Promise<User> {
    const userRepo = AppDataSource.getRepository(User);
    const user = await userRepo.findOne({ where: { id: userId } });

    if (!user) {
      throw ErrorHandler.userNotFound(userId);
    }

    if (avatarUrl !== undefined) {
      user.avatarUrl = avatarUrl;
    }
    if (avatarConfig !== undefined) {
      user.avatarConfig = avatarConfig;
    }

    await userRepo.save(user);
    return user;
  }

  @Query(() => User, { nullable: true })
  async getUserAvatar(
    @Arg('userId', () => ID) userId: string
  ): Promise<User | null> {
    const userRepo = AppDataSource.getRepository(User);
    return userRepo.findOne({ where: { id: userId } });
  }

  @Query(() => UserStats)
  async getUserStats(
    @Arg('userId', () => ID) userId: string
  ): Promise<UserStats> {
    const threadRepo = AppDataSource.getRepository(Thread);
    const postRepo = AppDataSource.getRepository(Post);

    const threads = await threadRepo.count({
      where: { author: { id: userId } },
    });

    const posts = await postRepo
      .createQueryBuilder('post')
      .leftJoin('post.thread', 'thread')
      .where('post.authorId = :userId', { userId })
      .andWhere('post.parent IS NULL')
      .getCount();

    const replies = await postRepo
      .createQueryBuilder('post')
      .where('post.authorId = :userId', { userId })
      .andWhere('post.parent IS NOT NULL')
      .getCount();

    return { threads, posts, replies };
  }

  @Mutation(() => Boolean)
  async setOnlineStatus(
    @Arg('userId', () => ID) userId: string,
    @Arg('isOnline') isOnline: boolean
  ): Promise<boolean> {
    const userRepo = AppDataSource.getRepository(User);
    await userRepo.update(userId, {
      isOnline,
      lastActive: new Date(),
    });
    return true;
  }

  @Query(() => [User])
  async getOnlineFriends(
    @Arg('userId', () => ID) userId: string
  ): Promise<User[]> {
    const friendsModel = new FriendsModel();
    const friends = await friendsModel.getFriendsList(userId);

    const friendUserIds = friends.map((f) => f.userId);

    if (friendUserIds.length === 0) return [];

    const users = await AppDataSource.getRepository(User)
      .createQueryBuilder('user')
      .where('user.id IN (:...friendUserIds)', { friendUserIds })
      .andWhere('user.isOnline = true')
      .getMany();

    return users;
  }
}
