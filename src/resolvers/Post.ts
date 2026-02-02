import { Resolver, Query, Mutation, Arg, Ctx } from 'type-graphql';
import { Post } from '../entities/Post';
import { PostsModel } from '../models/posts.model';
import { InputType, Field, ID } from 'type-graphql';
import { GraphQLContext } from '../graphql/context';
import { PostType } from '../graphql/enums/PostType';

@InputType()
export class CreatePostInput {
  @Field()
  content!: string;

  @Field(() => ID)
  threadId!: string;

  @Field(() => PostType)
  type!: PostType;

  @Field(() => String, { nullable: true })
  metadata?: Record<string, any>;
}

@InputType()
export class UpdatePostInput {
  @Field({ nullable: true })
  content?: string;

  @Field(() => PostType, { nullable: true })
  type?: PostType;

  @Field(() => String, { nullable: true })
  metadata?: Record<string, any>;
}

@InputType()
export class UpdatePostPinnedInput {
  @Field(() => ID)
  postId!: string;

  @Field()
  isPinned!: boolean;
}

@InputType()
export class PostQueryInput {
  @Field(() => ID, { nullable: true })
  id?: string;

  @Field(() => ID, { nullable: true })
  threadId?: string;

  @Field(() => Number, { nullable: true })
  limit?: number;

  @Field(() => Number, { nullable: true })
  offset?: number;

  @Field(() => Boolean, { nullable: true })
  pinnedOnly?: boolean;
}

export type returnedPost = {
  id?: string;
  type: PostType;
  content?: string;
  isPinned?: boolean;
  author?: any; // User type
  thread?: any; // Thread type
  createdAt?: Date;
  updatedAt?: Date;
  metadata?: JSON;
};

@Resolver()
export class PostResolver {
  private model = new PostsModel();

  @Mutation(() => Post)
  async createPost(
    @Arg('input') data: CreatePostInput,
    @Ctx() ctx: GraphQLContext
  ): Promise<returnedPost> {
    if (!ctx.user) throw new Error('Authentication required');
    return this.model.createPost(data, ctx.user.userId);
  }

  @Query(() => Post, { nullable: true })
  async post(
    @Arg('id', () => ID) id: string,
    @Ctx() ctx: GraphQLContext
  ): Promise<returnedPost | null> {
    // Read operations don't require authentication
    return this.model.getPost({ id });
  }

  @Query(() => [Post])
  async postsByThread(
    @Arg('threadId', () => ID) threadId: string,
    @Arg('limit', () => Number, { nullable: true }) limit?: number,
    @Arg('offset', () => Number, { nullable: true }) offset?: number,
    @Ctx() ctx?: GraphQLContext
  ): Promise<returnedPost[] | null> {
    // Read operations don't require authentication
    return this.model.listPostsByThread({ threadId, limit, offset });
  }

  @Query(() => [Post])
  async pinnedPosts(
    @Arg('threadId', () => ID, { nullable: true }) threadId?: string,
    @Ctx() ctx?: GraphQLContext
  ): Promise<returnedPost[] | null> {
    if (!threadId) {
      // If no threadId provided, return all pinned posts from all threads
      // This would require a different DAO method, for now return empty array
      return [];
    }
    return this.model.listPostsByThread({
      threadId,
      limit: undefined,
      offset: undefined,
      pinnedOnly: true,
    });
  }

  @Mutation(() => Post)
  async updatePost(
    @Arg('id', () => ID) id: string,
    @Arg('input') data: UpdatePostInput,
    @Ctx() ctx: GraphQLContext
  ): Promise<returnedPost> {
    if (!ctx.user) throw new Error('Authentication required');
    return this.model.updatePost(data, ctx.user.userId, id);
  }

  @Mutation(() => Boolean)
  async deletePost(
    @Arg('id', () => ID) id: string,
    @Ctx() ctx: GraphQLContext
  ): Promise<boolean> {
    if (!ctx.user) throw new Error('Authentication required');
    return this.model.deletePost(id, ctx.user.userId);
  }

  @Mutation(() => Post)
  async updatePostPin(
    @Arg('input') data: UpdatePostPinnedInput,
    @Ctx() ctx: GraphQLContext
  ): Promise<returnedPost | null> {
    if (!ctx.user) throw new Error('Authentication required');
    return this.model.updatePostPin(data, ctx.user.userId);
  }
}
