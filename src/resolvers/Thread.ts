import { Resolver, Query, Mutation, Arg, Ctx } from 'type-graphql';
import { Thread, ThreadVoteCounts } from '../entities/Thread';
import { ThreadsModel } from '../models/threads.model';
import { InputType, Field, ID } from 'type-graphql';
import { User } from '../entities/User';
import { Post } from '../entities/Post';
import { GraphQLContext } from '../graphql/context';
import { PostType } from '../graphql/enums/PostType';
import { ErrorHandler } from '../errors/ErrorHandler';

@InputType()
export class CreateThreadInput {
  @Field()
  title!: string;

  @Field()
  content!: string;

  @Field(() => PostType, { defaultValue: PostType.TEXT })
  type!: PostType;
}

@InputType()
export class UpdateThreadInput {
  @Field(() => ID)
  threadId!: string;

  @Field({ nullable: true })
  title?: string;

  @Field({ nullable: true })
  content?: string;
}

@InputType()
export class UpdateThreadPinOrLockInput {
  @Field(() => ID)
  threadId!: string;

  @Field({ nullable: true })
  isPinned?: boolean;

  @Field({ nullable: true })
  isLocked?: boolean;
}

@InputType()
export class ThreadQueryInput {
  @Field(() => ID, { nullable: true })
  id?: string;

  @Field({ nullable: true })
  authorId?: string;
}

export type returnedThread = {
  id?: string;
  title?: string;
  content?: string;
  author?: User;
  posts?: Post[];
  voteCounts?: ThreadVoteCounts;
  createdAt?: Date;
  updatedAt?: Date;
};

export type returnedThreadWithLockAndPins = {
  id?: string;
  title?: string;
  content?: string;
  author?: User;
  posts?: Post[];
  voteCounts?: ThreadVoteCounts;
  createdAt?: Date;
  updatedAt?: Date;
  isLocked?: Boolean;
  isPinned?: Boolean;
};

@Resolver()
export class ThreadResolver {
  private model = new ThreadsModel();

  @Mutation(() => Thread)
  async createThread(
    @Arg('input') input: CreateThreadInput,
    @Ctx() ctx: GraphQLContext
  ) {
    if (!ctx.user) {
      throw ErrorHandler.notAuthenticated();
    }
    return this.model.createThread(input, ctx.user.userId);
  }

  @Query(() => Thread, { nullable: true })
  async getThread(
    @Arg('data') data: ThreadQueryInput
  ): Promise<returnedThread | null> {
    return this.model.getThread(data);
  }

  @Query(() => [Thread])
  async listThreads(
    @Ctx() ctx: GraphQLContext
  ): Promise<returnedThread[] | null> {
    // Return empty array if not authenticated instead of throwing error
    if (!ctx.user) {
      console.log('[listThreads] No user in context, returning empty array');
      return [];
    }
    return this.model.listAllThreads(ctx.user.userId);
  }

  @Query(() => [Thread])
  async listThreadsByUser(
    @Arg('data') data: ThreadQueryInput,
    @Ctx() ctx: GraphQLContext
  ): Promise<returnedThread[] | null> {
    if (!ctx.user) {
      throw ErrorHandler.notAuthenticated();
    }
    return this.model.listThreadsByUser(data.authorId!, ctx.user.userId);
  }

  @Query(() => [Thread])
  async listUserParticipatedThreads(
    @Arg('data') data: ThreadQueryInput,
    @Ctx() ctx: GraphQLContext
  ): Promise<returnedThread[] | null> {
    console.log('[listUserParticipatedThreads] userId:', data.authorId);
    if (!ctx.user) {
      console.log('[listUserParticipatedThreads] Not authenticated');
      return [];
    }
    const result = await this.model.listUserParticipatedIn(data.authorId!);
    console.log('[listUserParticipatedThreads] Found threads:', result?.length);
    return result;
  }

  @Query(() => [Thread])
  async myParticipatedThreads(
    @Ctx() ctx: GraphQLContext
  ): Promise<returnedThread[] | null> {
    // Return empty array if not authenticated instead of throwing error
    if (!ctx.user) {
      return [];
    }
    return this.model.listThreadsUserParticipatedIn(ctx.user.userId);
  }

  @Mutation(() => Thread)
  async updateThread(
    @Arg('data') data: UpdateThreadInput,
    @Ctx() ctx: GraphQLContext
  ): Promise<returnedThread> {
    if (!ctx.user) {
      throw ErrorHandler.notAuthenticated();
    }
    return this.model.editThread(data, ctx.user.userId);
  }

  @Mutation(() => Boolean)
  async deleteThread(
    @Arg('threadId') threadId: string,
    @Ctx() ctx: GraphQLContext
  ): Promise<boolean> {
    if (!ctx.user) {
      throw ErrorHandler.notAuthenticated();
    }
    return this.model.deleteThread(threadId, ctx.user.userId);
  }

  @Mutation(() => Thread)
  async updateThreadPinOrLock(
    @Arg('data') data: UpdateThreadPinOrLockInput,
    @Ctx() ctx: GraphQLContext
  ): Promise<returnedThreadWithLockAndPins | null> {
    if (!ctx.user) throw ErrorHandler.notAuthenticated();
    return this.model.threadPinAndLockToggler(data, ctx.user.userId);
  }
}
