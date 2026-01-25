import { ThreadAdminDao } from '../dao/threadAdmin.dao';
import { UsersDao } from '../dao/users.dao';
import { ThreadsDao } from '../dao/threads.dao';
import { UserRole } from '../graphql/enums/UserRole';
import { ErrorHandler } from '../errors/ErrorHandler';

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
      throw ErrorHandler.threadNotFound(threadId, { action });
    }

    const user = await this.usersDao.findById(userId);
    if (!user) throw ErrorHandler.userNotFound(userId, { action });

    const isAuthor = thread.author.id === userId;
    const isGlobalAdmin = user.role === UserRole.ADMIN;

    const isThreadAdmin = await this.threadAdminDao.isThreadAdmin(
      userId,
      threadId
    );

    if (isThreadAdmin && isThreadAdmin.revokedAt) {
      throw ErrorHandler.permissionRevoked(isThreadAdmin.revokedAt, {
        threadId,
        userId,
        action,
      });
    }

    if (!isAuthor && !isGlobalAdmin && !isThreadAdmin) {
      throw ErrorHandler.insufficientPermissions(action, 'this Thread', {
        threadId,
        userId,
      });
    }

    return { thread, user, isAuthor, isGlobalAdmin, isThreadAdmin };
  }

  async checkUserExists(userId: string): Promise<any> {
    const user = await this.usersDao.findById(userId);
    if (!user) throw ErrorHandler.userNotFound(userId);
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

  hasPermission(
    isAuthor: boolean,
    isGlobalAdmin: boolean,
    isThreadAdmin: { revokedAt?: Date | null } | null
  ): boolean {
    if (isAuthor || isGlobalAdmin) {
      return true;
    }

    if (!isThreadAdmin) {
      return false;
    }

    return !isThreadAdmin.revokedAt;
  }
}
