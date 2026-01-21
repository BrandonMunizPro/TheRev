import { ThreadAdminDao } from "../dao/threadAdmin.dao";
import { GrantThreadAdminInput, RevokeThreadAdminInput } from "../resolvers/ThreadPermissions";
import { ThreadQueryInput } from "../resolvers/Thread";
import { ThreadAdmin } from "../entities/ThreadAdmin";
import { PermissionsService } from "../services/permissionsService";


export class ThreadAdminModel {
    private readonly dao: ThreadAdminDao;
    private readonly permissionsService: PermissionsService;

     constructor() {
        this.dao = new ThreadAdminDao();
        this.permissionsService = new PermissionsService();
     }

async grantAdmin(data: GrantThreadAdminInput, userId: string): 
      Promise<ThreadAdmin> 
    {
   
      if (!data.threadId || !data.suggestedUserId) {
        throw new Error("Please provide ThreadId and suggested UserId");
      }
   
      await this.permissionsService.checkThreadPermissions(data.threadId, userId, "grant admin privilege");

      const suggestedUser = await this.permissionsService.checkUserExists(data.suggestedUserId);

      const grantedThreadAdminPrivilege = await this.dao.grantOrRestoreThreadAdmin(suggestedUser.id, data.threadId, userId );
      return grantedThreadAdminPrivilege;    
    }

async revokeAdmin(data: RevokeThreadAdminInput, userId: string): Promise<ThreadAdmin> {
    if (!data.threadId) {
      throw new Error("Thread ID is required");
    }

    await this.permissionsService.checkThreadPermissions(data.threadId, userId, "revoke admin privilege");

    if (!data.authorId) {
      throw new Error("Author ID is required to revoke admin");
    }

    return await this.dao.revokeThreadAdmin(data.authorId, data.threadId);
  }

  async listAdminsForThread(data: ThreadQueryInput, userId: string): Promise<ThreadAdmin[]> {
    if (!data.id) {
      throw new Error("Thread ID is required");
    }

    await this.permissionsService.checkThreadPermissions(data.id, userId, "view admins for this Thread");

    return await this.dao.listAdminsForThread(data.id);
  }

  async listThreadsForUser(userId: string): Promise<ThreadAdmin[]> {
    await this.permissionsService.checkUserExists(userId);

    return await this.dao.listThreadsForUser(userId);
  }
}