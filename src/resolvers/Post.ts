import { Resolver, Query, Mutation, Arg, Ctx } from "type-graphql";
import { Post } from "../entities/Post";
import { PostsModel } from "../models/posts.model";
import { InputType, Field, ID } from "type-graphql";
import { GraphQLContext } from "../graphql/context";
import { PostType } from "../graphql/enums/PostType";

// Input Types
@InputType()
export class CreatePostInput {
  @Field()
  content!: string;

  @Field(() => ID)
  threadId!: string;

  @Field(() => PostType)
  type!: PostType;

  @Field({ nullable: true })
  metadata?: {
    thumbnailUrl?: string;
    duration?: number;
    provider?: "youtube" | "vimeo";
  };
}

@InputType()
export class UpdatePostInput {
  @Field(() => ID)
  postId!: string;

  @Field({ nullable: true })
  content?: string;

  @Field({ nullable: true })
  type?: PostType;

  @Field({ nullable: true })
  metadata?: {
    thumbnailUrl?: string;
    duration?: number;
    provider?: "youtube" | "vimeo";
  };
}


@InputType()
export class UpdatePostPinnedInput {
  @Field(() => ID)
  postId!: string;

  @Field({ nullable: true })
  content?: string;
  
  @Field()
  isPinned?: boolean;
}

@InputType()
export class PostQueryInput {
  @Field(() => ID, { nullable: true })
  id?: string;

  @Field(() => ID, { nullable: true })
  threadId?: string;
}

// Returned Types
export type returnedPost = {
  id?: string;
  type: PostType
  content?: string;
  isPinned?: boolean;
  author?: any; // User type
  thread?: any; // Thread type
  createdAt?: Date;
  updatedAt?: Date;
  metadata?: JSON
};

// Resolver
@Resolver()
export class PostResolver {
  private model = new PostsModel();

  // CREATE POST
  @Mutation(() => Post)
  async createPost(
    @Arg("data") data: CreatePostInput,
    @Ctx() ctx: GraphQLContext
  ): Promise<returnedPost> {
    if (!ctx.user) throw new Error("Not authenticated");
    return this.model.createPost(data, ctx.user.userId);
  }

  // GET SINGLE POST
  @Query(() => Post, { nullable: true })
  async getPost(
    @Arg("data") data: PostQueryInput,
    @Ctx() ctx: GraphQLContext
  ): Promise<returnedPost | null> {
    if (!ctx.user) throw new Error("Not authenticated");
    return this.model.getPost(data);
  }

  // LIST POSTS BY THREAD
  @Query(() => [Post])
  async listPostsByThread(
    @Arg("data") data: PostQueryInput,
    @Ctx() ctx: GraphQLContext
  ): Promise<returnedPost[] | null> {
    if (!ctx.user) throw new Error("Not authenticated");
    return this.model.listPostsByThread(data);
  }

  // UPDATE POST
  @Mutation(() => Post)
  async updatePost(
    @Arg("data") data: UpdatePostInput,
    @Ctx() ctx: GraphQLContext
  ): Promise<returnedPost> {
    if (!ctx.user) throw new Error("Not authenticated");
    return this.model.updatePost(data, ctx.user.userId);
  }

  // DELETE POST
  @Mutation(() => Boolean)
  async deletePost(
    @Arg("postId", () => ID) postId: string,
    @Ctx() ctx: GraphQLContext
  ): Promise<boolean> {
    if (!ctx.user) throw new Error("Not authenticated");
    return this.model.deletePost(postId, ctx.user.userId);
  }

  @Mutation(() => Post)
  async pinPost(
    @Arg("data") data: UpdatePostInput,
    @Ctx() ctx: GraphQLContext
  ) {
    if (!ctx.user) throw new Error("Not authenticated");

    return this.model.pinPost(data, ctx.user.userId);
  }

}
