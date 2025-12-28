import { Thread } from "../entities/Thread";
import { ThreadsDao } from "../dao/threads.dao";
import { 
    CreateThreadInput, 
    UpdateThreadInput, 
    ThreadQueryInput,
    returnedThread
 } from "../resolvers/Thread";
import { UsersDao } from "../dao/users.dao";
import { PostsDao } from "../dao/posts.dao";
import { UserRole } from "../graphql/enums/UserRole";

export class ThreadsModel {
    private readonly dao: ThreadsDao;
    private readonly usersDao: UsersDao;
    private readonly postsDao: PostsDao;

     constructor() {
        this.dao = new ThreadsDao();
        this.usersDao = new UsersDao();
        this.postsDao = new PostsDao();
     }

     //GET Threads
    async getThread(data: ThreadQueryInput): 
       Promise<returnedThread | null> 
     {
   
       if (!data) {
         throw new Error("Please provide ThreadId or Author's UserId");
       }
   
       let thread: Thread | null = null;
   
       if (data.id) {
         thread = await this.dao.findById(data.id);
       }
       if (data.authorId){
         thread = await this.dao.findByUserId(data.authorId);
       }
   
       if (!thread) return null;
   
       return {
         id: thread.id,
         author: thread.author,
         title: thread.title,
         posts: thread.posts,
         createdAt: thread.createdAt,
         updatedAt: thread.updatedAt,
       };
     }

     //listAllThreads
     async listAllThreads (userId: string): Promise<returnedThread[] | null>
     {
      const user = await this.usersDao.findById(userId);

      if (!user) {
        throw new Error("User not found");
      }
      const threads = this.dao.findAll();
      return threads
     }

     //ListThreadByUsers
    async listThreadsByUser (userId: string, userIdContext: string): Promise<returnedThread[] | null>
    {
      const user = await this.usersDao.findById(userIdContext);

      if (!user) {
        throw new Error("User not found");
      }

      const isAdmin = user.role === UserRole.ADMIN;
      if (!isAdmin || user.id !== userId ){
        throw new Error("You do not have permission to see all threads listed by user.")
      }

      const threads = this.dao.findAllByUserId(userId);
      return threads
    }

     //CREATE THREAD
    async createThread(
     input: CreateThreadInput,
     authorId: string
    ): Promise<returnedThread> {
        // 1. Fetch author
        const author = await this.usersDao.findById(authorId);
        if (!author) throw new Error("User not found");

        // 2. Create thread
        const thread = await this.dao.createThread({
            title: input.title,
            author,
        });

        // 3. Create initial post
        const post = await this.postsDao.create({
            content: input.content,
            author,
            thread,
        });

        thread.posts = [post];

        return {
            id: thread.id,
            title: thread.title,
            author: thread.author,
            posts: thread.posts,
            createdAt: thread.createdAt,
            updatedAt: thread.updatedAt,
        };
    }

    // DELETE Thread
      async deleteThread(id: string, userId: string): Promise<boolean> {
      const thread = await this.dao.findById(id);

      if (!thread) {
        throw new Error("Thread not found");
      }

      const user = await this.usersDao.findById(userId);

      if (!user) {
        throw new Error("User not found");
      }

      const isOwner = thread.author.id === userId;
      const isAdmin =
        user.role === UserRole.ADMIN ||
        user.role === UserRole.THREAD_ADMIN;

      if (!isAdmin && !isOwner) {
        throw new Error("The user has no permission to delete this thread");
      }

      return this.dao.deleteThread(id);
    }


    //UpdateThread
    async editThread(
    data: UpdateThreadInput,
    userId: string
    ): Promise<returnedThread> {
      const thread = await this.dao.findById(data.threadId);

      if (!thread) {
        throw new Error("Thread not found");
      }

      const user = await this.usersDao.findById(userId);

      if (!user) {
        throw new Error("User not found");
      }

      const isOwner = thread.author.id === userId;
      const isAdmin =
        user.role === UserRole.ADMIN ||
        user.role === UserRole.THREAD_ADMIN;

      if (!isAdmin && !isOwner) {
        throw new Error("The user has no permission to edit this thread");
      }

      return this.dao.updateThread(data.threadId, data);
    }

}
