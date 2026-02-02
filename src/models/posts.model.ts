import { Post } from '../entities/Post';
import { User } from '../entities/User';
import { Thread } from '../entities/Thread';
import { PostsDao } from '../dao/posts.dao';
import { UsersDao } from '../dao/users.dao';
import { ThreadsDao } from '../dao/threads.dao';
import { DeepPartial } from 'typeorm';
import {
  CreatePostInput,
  returnedPost,
  PostQueryInput,
  UpdatePostInput,
  UpdatePostPinnedInput,
} from '../resolvers/Post';
import { PermissionsService } from '../services/permissionsService';

export class PostsModel {
  private dao = new PostsDao();
  private usersDao = new UsersDao();
  private threadsDao = new ThreadsDao();
  private permissionsService = new PermissionsService();

  async createPost(
    data: CreatePostInput,
    userId: string
  ): Promise<returnedPost> {
    const user = await this.usersDao.findById(userId);
    if (!user) throw new Error('User not found');

    const thread = await this.threadsDao.findById(data.threadId);
    if (!thread) throw new Error('Thread not found');
    if (thread.isLocked)
      throw new Error('Thread Admin has locked anyone else from interacting');

    const newDate = new Date();
    const createdPost = await this.dao.createPostRaw(
      data.content,
      userId,
      data.threadId,
      data.type,
      newDate,
      data.metadata
    );

    return {
      id: createdPost.id,
      content: createdPost.content,
      type: createdPost.type,
      isPinned: createdPost.is_pinned,
      author: user,
      thread: thread,
      createdAt: createdPost.created_at,
      metadata: createdPost.metadata
        ? JSON.parse(createdPost.metadata)
        : undefined,
    };
  }

  async getPost(data: PostQueryInput): Promise<returnedPost | null> {
    if (!data) {
      throw new Error("Please provide ThreadId or Author's UserId");
    }

    let post: Post | null = null;

    if (data.id) {
      post = await this.dao.findById(data.id);
    }
    if (!post) return null;

    return {
      id: post.id,
      type: post.type,
      content: post.content,
      isPinned: post.isPinned,
      author: post.author,
      thread: post.thread,
      createdAt: post.createdAt,
      updatedAt: post.updatedAt,
    };
  }

  async listPostsByThread(data: PostQueryInput): Promise<returnedPost[]> {
    if (!data?.threadId) {
      throw new Error('threadId is required');
    }
    const posts = this.dao.findAllByThreadId(data.threadId);
    const allPosts = await posts;

    let filteredPosts = allPosts;
    if (data.pinnedOnly) {
      filteredPosts = allPosts.filter((post) => post.isPinned);
    }

    let paginatedPosts = filteredPosts;
    if (data.limit !== undefined || data.offset !== undefined) {
      const offset = data.offset || 0;
      const limit = data.limit || filteredPosts.length;
      paginatedPosts = filteredPosts.slice(offset, offset + limit);
    }

    return paginatedPosts.map((post) => ({
      id: post.id,
      type: post.type,
      content: post.content,
      isPinned: post.isPinned,
      author: post.author,
      thread: post.thread,
      createdAt: post.createdAt,
      updatedAt: post.updatedAt,
    }));
  }

  async updatePost(
    data: UpdatePostInput,
    userId: string,
    postId: string
  ): Promise<returnedPost> {
    const post = await this.dao.findById(postId);
    if (!post) throw new Error('Post not found');

    await this.permissionsService.checkThreadPermissions(
      post.thread.id,
      userId,
      'update this post'
    );

    const updatePayload: DeepPartial<Post> = {};
    if (data.content !== undefined) updatePayload.content = data.content;
    if (data.type !== undefined) updatePayload.type = data.type;
    if (data.metadata !== undefined) updatePayload.metadata = data.metadata;
    updatePayload.updatedAt = new Date();

    const updatedPost = await this.dao.updatePost(postId, updatePayload);
    return {
      id: updatedPost.id,
      type: updatedPost.type,
      content: updatedPost.content,
      isPinned: updatedPost.isPinned,
      author: updatedPost.author,
      thread: updatedPost.thread,
      createdAt: updatedPost.createdAt,
      updatedAt: updatedPost.updatedAt,
    };
  }

  async deletePost(postId: string, userId: string): Promise<boolean> {
    const post = await this.dao.findById(postId);
    if (!post) throw new Error('Post not found');

    await this.permissionsService.checkThreadPermissions(
      post.thread.id,
      userId,
      'delete this post'
    );

    return this.dao.deletePost(postId);
  }

  async updatePostPin(
    data: UpdatePostPinnedInput,
    userId: string
  ): Promise<returnedPost> {
    const post = await this.dao.findById(data.postId);
    if (!post) throw new Error('Post not found');

    const thread = await this.dao.findById(post.thread.id);

    if (!thread) {
      throw new Error('Thread not found');
    }
    await this.permissionsService.checkThreadPermissions(
      post.thread.id,
      userId,
      'update this post'
    );

    if (!data.isPinned) {
      throw new Error('Select pin to update');
    }
    const updatedPost = await this.dao.updatePost(post.id, data);

    return {
      id: updatedPost.id,
      type: updatedPost.type,
      content: updatedPost.content,
      isPinned: updatedPost.isPinned,
      author: updatedPost.author,
      thread: updatedPost.thread,
      createdAt: updatedPost.createdAt,
      updatedAt: updatedPost.updatedAt,
    } as returnedPost;
  }
}
