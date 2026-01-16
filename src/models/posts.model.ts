import { Post } from "../entities/Post";
import { User } from "../entities/User";
import { Thread } from "../entities/Thread";
import { PostsDao } from "../dao/posts.dao";
import { ThreadAdminDao } from "../dao/threadAdmin.dao";
import { UsersDao } from "../dao/users.dao";
import { ThreadsDao } from "../dao/threads.dao";
import { UserRole } from "../graphql/enums/UserRole";
import { DeepPartial } from "typeorm";
import { CreatePostInput, returnedPost, PostQueryInput, UpdatePostInput, UpdatePostPinnedInput} from "../resolvers/Post";

export class PostsModel {
  private dao = new PostsDao();
  private usersDao = new UsersDao();
  private threadsDao = new ThreadsDao();
  private threadAdminDao = new ThreadAdminDao();

  // CREATE POST
  async createPost(data: CreatePostInput, userId: string): Promise<returnedPost> {
  const user = await this.usersDao.findById(userId);
  if (!user) throw new Error("User not found");

  const thread = await this.threadsDao.findById(data.threadId);
  if (!thread) throw new Error("Thread not found");
  if (thread.isLocked) throw new Error("Thread Admin has locked anyone else from interacting");

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
    author: user,
    thread: thread,
    createdAt: createdPost.created_at,
    metadata: createdPost.metadata ? JSON.parse(createdPost.metadata) : undefined
  };
}


  // GET POST
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
      author: post.author,
      thread: post.thread,
      createdAt: post.createdAt,
      updatedAt: post.updatedAt
    };
  }

  // LIST POSTS BY THREAD
  async listPostsByThread(data: PostQueryInput): Promise<returnedPost[]> {
     if (!data?.threadId) {
    throw new Error("threadId is required");
  }
    const posts = this.dao.findAllByThreadId(data.threadId);
    return (await posts).map((post) => ({
      id: post.id,
      type: post.type,
      content: post.content,
      author: post.author,
      thread: post.thread,
      createdAt: post.createdAt,
      updatedAt: post.updatedAt
    }));
  }

    // UPDATE POST
  async updatePost(
    data: UpdatePostInput,
    userId: string
  ): Promise<returnedPost> {
    const post = await this.dao.findById(data.postId);
    if (!post) throw new Error("Post not found");

    const user = await this.usersDao.findById(userId);
    if (!user) throw new Error("User not found");

    const isAuthor = post.author.id === userId;
    const isGlobalAdmin = user.role === UserRole.ADMIN;

    const isThreadAdmin = await this.threadAdminDao.isThreadAdmin(
      userId,
      post.thread.id
    );
    
    if(isThreadAdmin.revokedAt){
      throw new Error(`Your privilege as an admin on this thread was revoked on ${isThreadAdmin.revokedAt.toISOString()}`);
    }
    if (!isAuthor && !isGlobalAdmin && !isThreadAdmin) {
      throw new Error("No permission to update this post");
    }

    // Build the update payload — only include fields the user is allowed to edit
    const updatePayload: DeepPartial<Post> = {};
    if (data.content !== undefined) updatePayload.content = data.content;
    if (data.type !== undefined) updatePayload.type = data.type;
    if (data.metadata !== undefined) updatePayload.metadata = data.metadata;
    updatePayload.updatedAt = new Date();

    const updatedPost =  await this.dao.updatePost(data.postId, updatePayload);
    return {
      id: updatedPost.id,
      type: updatedPost.type,
      content: updatedPost.content,
      author: updatedPost.author,
      thread: updatedPost.thread,
      createdAt: updatedPost.createdAt,
      updatedAt: updatedPost.updatedAt
    }
  }

  async deletePost(postId: string, userId: string): Promise<boolean> {
    const post = await this.dao.findById(postId);
    if (!post) throw new Error("Post not found");

    const user = await this.usersDao.findById(userId);
    if (!user) throw new Error("User not found");

    const isAuthor = post.author.id === userId;
    const isGlobalAdmin = user.role === UserRole.ADMIN;

    const isThreadAdmin = await this.threadAdminDao.isThreadAdmin(
      userId,
      post.thread.id
    );
    
    if(isThreadAdmin.revokedAt){
      throw new Error(`Your privilege as an admin on this thread was revoked on ${isThreadAdmin.revokedAt.toISOString()}`);
    }
    
    if (!isAuthor && !isGlobalAdmin && !isThreadAdmin) {
      throw new Error("No permission to delete this post");
    }

    return this.dao.deletePost(postId);
  }
  

  async updatePostPin(
    data: UpdatePostPinnedInput,
    userId: string
  ): Promise<returnedPost> {

    const post = await this.dao.findById(data.postId);
    if (!post) throw new Error("Post not found");

    const thread = await this.dao.findById(post.thread.id);
  
    if (!thread) {
      throw new Error("Thread not found");
    }
    const user = await this.usersDao.findById(userId);
    if (!user) {
      throw new Error("User not found");
    }
  
    const isAuthor = post.author.id === userId;
    const isGlobalAdmin = user.role === UserRole.ADMIN;

    const isThreadAdmin = await this.threadAdminDao.isThreadAdmin(
      userId,
      post.thread.id
    );
    
    if(isThreadAdmin.revokedAt){
      throw new Error(`Your privilege as an admin on this thread was revoked on ${isThreadAdmin.revokedAt.toISOString()}`);
    }
    
    if (!isAuthor && !isGlobalAdmin && !isThreadAdmin) {
      throw new Error("No permission to update this post");
    }
  
    if(!data.isPinned){
      throw new Error("Select pin to update")
    }
    const updatedPost = await this.dao.updatePost(post.id, data);
        
    return {
      id: updatedPost.id,
      type: updatedPost.type,
      content: updatedPost.content,
      author: updatedPost.author,
      thread: updatedPost.thread,
      createdAt: updatedPost.createdAt,
      updatedAt: updatedPost.updatedAt
    } as returnedPost
  }
}
