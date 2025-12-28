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
    async deleteThread(id: string): Promise<boolean> {
      //pass context see if user is superadmin or if thread belongs to them if so we can delete if not we throw error
      return this.dao.deleteThread(id);
    }

    //UpdateThread
    async editThread( data: UpdateThreadInput): Promise<returnedThread> {
       //pass context see if user is superadmin or if thread belongs to them if so we can delete if not we throw error
      const id = data.threadId;
      const updated = await this.dao.updateThread(id, data);
      return updated;
    }
}
