import { ThreadAdminDao } from "../dao/threadAdmin.dao";
import { UsersDao } from "../dao/users.dao";
import { ThreadsDao } from "../dao/threads.dao";
import { UserRole } from "../graphql/enums/UserRole";
import { GrantThreadAdminInput } from "../resolvers/threadPermission";
import { ThreadAdmin } from "../entities/ThreadAdmin";


export class ThreadAdminModel {
    private readonly dao: ThreadAdminDao;
    private readonly threadsDao: ThreadsDao;
    private readonly usersDao: UsersDao;

     constructor() {
        this.dao = new ThreadAdminDao();
        this.threadsDao = new ThreadsDao();
        this.usersDao = new UsersDao();
     }

     //GET Threads
    async grantAdmin(data: GrantThreadAdminInput, userId: string): 
      Promise<ThreadAdmin> 
    {
   
      if (!data.threadId || !data.suggestedUserId) {
        throw new Error("Please provide ThreadId and suggested UserId");
      }
   
      const thread = await this.threadsDao.findById(data.threadId);

      if (!thread) {
        throw new Error("Thread not found");
      }

      const user = await this.usersDao.findById(userId);
      const suggestedUser = await this.usersDao.findById(data.suggestedUserId);
      if (!user) throw new Error("User not found");
      if (!suggestedUser) throw new Error("Suggested User not found");
      
      const isAuthor = thread.author.id === userId;
      const isGlobalAdmin = user.role === UserRole.ADMIN;
      
      const isThreadAdmin = await this.dao.isThreadAdmin(
      userId,
      data.threadId
      );
          
      if(isThreadAdmin.revokedAt){
        throw new Error(`Your privilege as an admin on this thread was revoked on ${isThreadAdmin.revokedAt.toISOString()}`);
      }
          
      if (!isAuthor && !isGlobalAdmin && !isThreadAdmin) {
        throw new Error("You don't have permission to grant admin privilege for this Thread");
      }

      const grantedThreadAdminPrivilege = await this.dao.grantOrRestoreThreadAdmin(suggestedUser.id, thread.id, userId );
      return grantedThreadAdminPrivilege;    
    }

    // async threadAdmins(userId: string): Promise<>
    // {

    // }

    // async myAdminThreads (userId: string, userIdContext: string): Promise<>
    // {

    // }
}