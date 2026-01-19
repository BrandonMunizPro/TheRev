import { ThreadAdminDao } from "../dao/threadAdmin.dao";
import { UsersDao } from "../dao/users.dao";
import { ThreadsDao } from "../dao/threads.dao";
import { UserRole } from "../graphql/enums/UserRole";

export interface PermissionResult {
  thread: any;
  user: any;
  isAuthor: boolean;
  isGlobalAdmin: boolean;
  isThreadAdmin: any;
}

export class PermissionsService {
  private readonly threadAdminDao: ThreadAdminDao;
  private readonly threadsDao: ThreadsDao;
  private readonly usersDao: UsersDao;

  constructor() {
    this.threadAdminDao = new ThreadAdminDao();
    this.threadsDao = new ThreadsDao();
    this.usersDao = new UsersDao();
  }

  async checkThreadPermissions(
    threadId: string, 
    userId: string,
    action: string
  ): Promise<PermissionResult> {
    const thread = await this.threadsDao.findById(threadId);
    if (!thread) {
      throw new Error("Thread not found");
    }

    const user = await this.usersDao.findById(userId);
    if (!user) throw new Error("User not found");

    const isAuthor = thread.author.id === userId;
    const isGlobalAdmin = user.role === UserRole.ADMIN;
    
    const isThreadAdmin = await this.threadAdminDao.isThreadAdmin(userId, threadId);
        
    if(isThreadAdmin && isThreadAdmin.revokedAt){
      throw new Error(`Your privilege as an admin on this thread was revoked on ${isThreadAdmin.revokedAt.toISOString()}`);
    }
        
    if (!isAuthor && !isGlobalAdmin && !isThreadAdmin) {
      throw new Error(`You don't have permission to ${action} for this Thread`);
    }

    return { thread, user, isAuthor, isGlobalAdmin, isThreadAdmin };
  }

  async checkUserExists(userId: string): Promise<any> {
    const user = await this.usersDao.findById(userId);
    if (!user) throw new Error("User not found");
    return user;
  }

  async checkGlobalAdmin(userId: string): Promise<boolean> {
    const user = await this.checkUserExists(userId);
    return user.role === UserRole.ADMIN;
  }

  async checkAdminOrThreadAdmin(userId: string): Promise<boolean> {
    const user = await this.checkUserExists(userId);
    return user.role === UserRole.ADMIN || user.role === UserRole.THREAD_ADMIN;
  }

  hasPermission(isAuthor: boolean, isGlobalAdmin: boolean, isThreadAdmin: any): boolean {
    return isAuthor || isGlobalAdmin || (isThreadAdmin && !isThreadAdmin.revokedAt);
  }
}