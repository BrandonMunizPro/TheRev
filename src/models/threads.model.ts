import { Thread } from "../entities/Thread";
import { ThreadsDao } from "../dao/threads.dao";
import { 
    CreateThreadInput, 
    UpdateThreadInput, 
    ThreadQueryInput,
    UpdateThreadPinOrLockInput,
    returnedThread,
    returnedThreadWithLockAndPins
 } from "../resolvers/Thread";
import { UsersDao } from "../dao/users.dao";
import { PostsDao } from "../dao/posts.dao";
import { PermissionsService } from "../services/permissionsService";

export class ThreadsModel {
    private readonly dao: ThreadsDao;
    private readonly usersDao: UsersDao;
    private readonly postsDao: PostsDao;
    private readonly permissionsService: PermissionsService;

     constructor() {
        this.dao = new ThreadsDao();
        this.usersDao = new UsersDao();
        this.postsDao = new PostsDao();
        this.permissionsService = new PermissionsService();
     }

    async getThread(data: ThreadQueryInput): 
      Promise<returnedThread | null> 
    {
      if (!data.id) {
        throw new Error("Please provide ThreadId");
      }
   
      let thread: Thread | null = null;
      thread = await this.dao.findById(data.id);
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

    async listAllThreads (userId: string): Promise<returnedThread[] | null>
    {
      const user = await this.usersDao.findById(userId);
      if (!user) {
        throw new Error("User not found");
      }
      const threads = this.dao.findAll();
      return threads
    }

    async listThreadsByUser (userId: string, userIdContext: string): Promise<returnedThread[] | null>
    {
      const user = await this.usersDao.findById(userIdContext);

      if (!user) {
        throw new Error("User not found");
      }

      const isAdmin = await this.permissionsService.checkGlobalAdmin(userId);
      if (!isAdmin || user.id !== userId ){
        throw new Error("You do not have permission to see all threads listed by user.")
      }

      const threads = this.dao.findAllByUserId(userId);
      return threads
    }

    async createThread(
     input: CreateThreadInput,
     authorId: string
    ): Promise<returnedThread> {
      const author = await this.usersDao.findById(authorId);
      if (!author) throw new Error("User not found");

      const thread = await this.dao.createThread({
          title: input.title,
          author,
      });

      const post = await this.postsDao.createPostRaw(
        input.content,
        author.id,
        thread.id,
        input.type,
        new Date()
      );

      thread.posts = [post];

      return {
        id: thread.id,
        title: thread.title,
        author: thread.author,
        posts: thread.posts,
        createdAt: thread.createdAt,
        updatedAt: thread.updatedAt
      };
    }

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
      const isAdmin = await this.permissionsService.checkAdminOrThreadAdmin(userId);

      if (!isAdmin && !isOwner) {
        throw new Error("The user has no permission to delete this thread");
      }

      return this.dao.deleteThread(id);
    }


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
      const isAdmin = await this.permissionsService.checkAdminOrThreadAdmin(userId);

      if (!isAdmin && !isOwner) {
        throw new Error("The user has no permission to edit this thread");
      }

      return this.dao.updateThread(data.threadId, data);
    }

   
    async threadPinAndLockToggler(
      data: UpdateThreadPinOrLockInput,
      userId: string
    ): Promise<returnedThreadWithLockAndPins> {
      const thread = await this.dao.findById(data.threadId);

      if (!thread) {
        throw new Error("Thread not found");
      }

      const user = await this.usersDao.findById(userId);

      if (!user) {
        throw new Error("User not found");
      }

      const isOwner = thread.author.id === userId;
      const isAdmin = await this.permissionsService.checkAdminOrThreadAdmin(userId);

      if (!isAdmin && !isOwner) {
        throw new Error("The user has no permission to edit this thread");
      }

      if(!data.isLocked && !data.isPinned){
        throw new Error("Select either a thread or pin to update")
      }
      const updatedThread = await this.dao.updateThread(data.threadId, data);
      return {
       id: updatedThread.id,
       title: updatedThread.title,
       isLocked: updatedThread.isLocked,
       isPinned: updatedThread.isPinned,
       updatedAt: updatedThread.updatedAt,
       createdAt: updatedThread.createdAt
      } as returnedThreadWithLockAndPins
    }
}
