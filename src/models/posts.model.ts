import { Post } from "../entities/Post";
import { User } from "../entities/User";
import { Thread } from "../entities/Thread";
import { PostsDao } from "../dao/posts.dao";
import { UsersDao } from "../dao/users.dao";
import { ThreadsDao } from "../dao/threads.dao";
import { UserRole } from "../graphql/enums/UserRole";
import { CreatePostInput, returnedPost} from "../resolvers/Post";

export class PostsModel {
  private dao = new PostsDao();
  private usersDao = new UsersDao();
  private threadsDao = new ThreadsDao();

  // CREATE POST
  async createPost(data: CreatePostInput, userId: string): Promise<returnedPost> {
  const user = await this.usersDao.findById(userId);
  if (!user) throw new Error("User not found");

  const thread = await this.threadsDao.findById(data.threadId);
  if (!thread) throw new Error("Thread not found");

  const newDate = new Date();
  const createdPost = await this.dao.createPostRaw(
    data.content,
    userId,
    data.threadId,
    data.type,
    newDate,
    data.metadata // just pass it along
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
  async getPost(postId: string): Promise<Post | null> {
    return this.dao.findById(postId, { relations: ["author", "thread"] });
  }

  // LIST POSTS BY THREAD
  async listPostsByThread(threadId: string): Promise<Post[]> {
    return this.dao.findAll({ where: { thread: { id: threadId } }, relations: ["author", "thread"], order: { createdAt: "ASC" } });
  }

  // UPDATE POST
  async updatePost(postId: string, content: string, userId: string): Promise<Post> {
    const post = await this.dao.findById(postId, { relations: ["author"] });
    if (!post) throw new Error("Post not found");

    const user = await this.usersDao.findById(userId);
    if (!user) throw new Error("User not found");

    if (post.author.id !== userId && !(user.role === UserRole.ADMIN || user.role === UserRole.THREAD_ADMIN)) {
      throw new Error("No permission to update this post");
    }

    return this.dao.updatePost(postId, { content });
  }

  // DELETE POST
  async deletePost(postId: string, userId: string): Promise<boolean> {
    const post = await this.dao.findById(postId, { relations: ["author"] });
    if (!post) throw new Error("Post not found");

    const user = await this.usersDao.findById(userId);
    if (!user) throw new Error("User not found");

    if (post.author.id !== userId && !(user.role === UserRole.ADMIN || user.role === UserRole.THREAD_ADMIN)) {
      throw new Error("No permission to delete this post");
    }

    await this.dao.deletePost(postId);
    return true;
  }
}
