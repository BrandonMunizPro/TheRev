import { Resolver, Query, Mutation, Arg, Ctx } from 'type-graphql';
import { Post } from '../entities/Post';
import { PostsModel } from '../models/posts.model';
import { InputType, Field, ID } from 'type-graphql';
import { GraphQLContext } from '../graphql/context';
import { PostType } from '../graphql/enums/PostType';
import { Perspective } from '../graphql/enums/Perspective';
import { ErrorHandler } from '../errors/ErrorHandler';

@InputType()
export class CreatePostInput {
  @Field()
  content!: string;

  @Field(() => ID)
  threadId!: string;

  @Field(() => PostType, { defaultValue: PostType.TEXT })
  type!: PostType;

  @Field(() => String, { nullable: true })
  metadata?: string;

  @Field(() => ID, { nullable: true })
  parentId?: string;

  @Field(() => Perspective, { defaultValue: Perspective.NEUTRAL })
  perspective!: Perspective;
}

@InputType()
export class CreatePostMetadataInput {
  @Field(() => String, { nullable: true })
  thumbnailUrl?: string;

  @Field(() => Number, { nullable: true })
  duration?: number;

  @Field(() => String, { nullable: true })
  provider?: string;
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

  @Field(() => Perspective, { nullable: true })
  perspective?: Perspective;
}

export type returnedPost = {
  id?: string;
  type: PostType;
  content?: string;
  isPinned?: boolean;
  perspective?: Perspective;
  author?: any; // User type
  thread?: any; // Thread type
  parent?: any; // Parent post
  replies?: any[]; // Child posts
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
    if (!ctx.user) throw ErrorHandler.notAuthenticated();
    return this.model.createPost(data, ctx.user.userId);
  }

  @Query(() => Post, { nullable: true })
  async post(@Arg('id', () => ID) id: string): Promise<returnedPost | null> {
    // Read operations don't require authentication
    return this.model.getPost({ id });
  }

  @Query(() => [Post])
  async postsByThread(
    @Arg('threadId', () => ID) threadId: string,
    @Arg('limit', () => Number, { nullable: true }) limit?: number,
    @Arg('offset', () => Number, { nullable: true }) offset?: number,
    @Arg('perspective', () => Perspective, { nullable: true })
    perspective?: Perspective
  ): Promise<returnedPost[] | null> {
    // Read operations don't require authentication
    return this.model.listPostsByThread({
      threadId,
      limit,
      offset,
      perspective,
    });
  }

  @Query(() => [Post])
  async pinnedPosts(
    @Arg('threadId', () => ID, { nullable: true }) threadId?: string
  ): Promise<returnedPost[] | null> {
    if (!threadId) {
      return [];
    }
    return this.model.listPostsByThread({
      threadId,
      limit: undefined,
      offset: undefined,
      pinnedOnly: true,
    });
  }

  @Query(() => [Post])
  async myPosts(@Ctx() ctx: GraphQLContext): Promise<returnedPost[] | null> {
    if (!ctx.user) {
      return [];
    }
    return this.model.getPostsByUser(ctx.user.userId);
  }

  @Mutation(() => Post)
  async updatePost(
    @Arg('id', () => ID) id: string,
    @Arg('input') data: UpdatePostInput,
    @Ctx() ctx: GraphQLContext
  ): Promise<returnedPost> {
    if (!ctx.user) throw ErrorHandler.notAuthenticated();
    return this.model.updatePost(data, ctx.user.userId, id);
  }

  @Mutation(() => Boolean)
  async deletePost(
    @Arg('id', () => ID) id: string,
    @Ctx() ctx: GraphQLContext
  ): Promise<boolean> {
    if (!ctx.user) throw ErrorHandler.notAuthenticated();
    return this.model.deletePost(id, ctx.user.userId);
  }

  @Mutation(() => Post)
  async updatePostPin(
    @Arg('input') data: UpdatePostPinnedInput,
    @Ctx() ctx: GraphQLContext
  ): Promise<returnedPost | null> {
    if (!ctx.user) throw ErrorHandler.notAuthenticated();
    return this.model.updatePostPin(data, ctx.user.userId);
  }
}
