// resolvers/threadAdmin.resolver.ts
import {
  Resolver,
  Mutation,
  Query,
  Arg,
  Ctx,
} from "type-graphql";
import { ThreadAdmin } from "../entities/ThreadAdmin";
import { GraphQLContext } from "../graphql/context";
import { ThreadAdminModel } from "../models/threadAdmin.model";
import { InputType, Field, ID } from "type-graphql";
import { ThreadQueryInput } from "./Thread";

@InputType()
export class GrantThreadAdminInput {
  @Field(() => ID)
  threadId!: string;

  @Field({ nullable: true })
  authorId?: string;

  @Field({ nullable: true })
  suggestedUserId?: string;
}

@InputType()
export class RevokeThreadAdminInput {
  @Field(() => ID)
  threadId!: string;

  @Field(() => ID)
  authorId!: string;
}

@Resolver()
export class ThreadAdminResolver {
  private model = new ThreadAdminModel();

  @Mutation(() => ThreadAdmin)
  async grantThreadAdmin(
    @Arg("data") data: GrantThreadAdminInput,
    @Ctx() ctx: GraphQLContext
  ) {
    if (!ctx.user) throw new Error("Not authenticated");
    return this.model.grantAdmin(
      data,
      ctx.user.userId
    );
  }

@Mutation(() => Boolean)
  async revokeThreadAdmin(
    @Arg("data") data: RevokeThreadAdminInput,
    @Ctx() ctx: GraphQLContext
  ) {
    if (!ctx.user) throw new Error("Not authenticated");
    await this.model.revokeAdmin(
      data,
      ctx.user.userId
    );
    return true;
  }

  @Query(() => [ThreadAdmin])
  async threadAdmins(
    @Arg("data") data: ThreadQueryInput,
    @Ctx() ctx: GraphQLContext
  ) {
    if (!ctx.user) throw new Error("Not authenticated");
    return this.model.listAdminsForThread(
      data, 
      ctx.user.userId
    );
  }

  @Query(() => [ThreadAdmin])
  async myAdminThreads(
    @Ctx() ctx: GraphQLContext
  ) {
    if (!ctx.user) throw new Error("Not authenticated");
    return this.model.listThreadsForUser(ctx.user.userId);
  }
}
