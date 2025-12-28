import { Resolver, Query, Mutation, Arg, Ctx } from "type-graphql";
import { Thread } from "../entities/Thread";
import { ThreadsModel } from "../models/threads.model";
import { InputType, Field, ID } from "type-graphql";
import { User } from "../entities/User";
import { Post } from "../entities/Post";
import { GraphQLContext } from "../graphql/context";


@InputType()
export class CreateThreadInput {
  @Field()
  title!: string;

  @Field()
  content!: string;

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
  createdAt?: Date;
  updatedAt?: Date;
};



@Resolver()
export class ThreadResolver {
  private model = new ThreadsModel();

  // CREATE
  @Mutation(() => Thread)
  async createThread(
    @Arg("input") input: CreateThreadInput,
    @Ctx() ctx: GraphQLContext
  ) {
    if (!ctx.user) {
    throw new Error("Not authenticated");
  }
    return this.model.createThread(input, ctx.user.userId);
  }


  // GET single thread by id
  @Query(() => Thread, { nullable: true })
  async getThread(
    @Arg("data") data: ThreadQueryInput
  ): Promise<returnedThread | null> {
    return this.model.getThread(data);
  }

  // LIST all threads when roles created/Superadmin
  @Query(() => [Thread])
  async listThreads(
    @Ctx() ctx: GraphQLContext
  ): Promise<returnedThread[] | null> {
    if (!ctx.user) {
      throw new Error("Not authenticated");
    }
    return this.model.listAllThreads(ctx.user.userId);
  }

  // LIST all threads by a specific user superadmin sees all user can only see their own if not superadmin or follower of user
  @Query(() => [Thread])
  async listThreadsByUser(
    @Arg("data") data: ThreadQueryInput,
    @Ctx() ctx: GraphQLContext
  ): Promise<returnedThread[] | null> {
    if (!ctx.user) {
      throw new Error("Not authenticated");
    }
    return this.model.listThreadsByUser(data.authorId!, ctx.user.userId);
  }

  // UPDATE THREAD
  @Mutation(() => Thread)
  async updateThread(
    @Arg("data") data: UpdateThreadInput,
    @Ctx() ctx: GraphQLContext
  ): Promise<returnedThread> {
    if (!ctx.user) {
      throw new Error("Not authenticated");
    }
    return this.model.editThread(data, ctx.user.userId);
  }

  // DELETE THREAD
  @Mutation(() => Boolean)
  async deleteThread(
    @Arg("threadId") threadId: string,
    @Ctx() ctx: GraphQLContext
  ): Promise<boolean> {
    if (!ctx.user) {
      throw new Error("Not authenticated");
    }
    return this.model.deleteThread(threadId, ctx.user.userId);
  }

  // MODERATION
 
  @Mutation(() => Thread)
  async lockThread(@Arg("threadId") threadId: string): Promise<Thread> {
    return this.model.lockThread(threadId);
  }

  @Mutation(() => Thread)
  async unlockThread(@Arg("threadId") threadId: string): Promise<Thread> {
    return this.model.unlockThread(threadId);
  }

  @Mutation(() => Thread)
  async pinThread(@Arg("threadId") threadId: string): Promise<Thread> {
    return this.model.pinThread(threadId);
  }

  @Mutation(() => Thread)
  async unpinThread(@Arg("threadId") threadId: string): Promise<Thread> {
    return this.model.unpinThread(threadId);
  }
}
