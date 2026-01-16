import { AppDataSource } from "../data-source";
import { ThreadAdmin } from "../entities/ThreadAdmin";
import { User } from "../entities/User";
import { Thread } from "../entities/Thread";

export class ThreadAdminDao {
 
  private repo = AppDataSource.getRepository(ThreadAdmin);
  // CREATE a new ThreadAdmin entry
  // LIST all admins for a thread
  // LIST all threads a user is admin of
  // REVOKE an admin role (soft delete)

  async isThreadAdmin(userId: string, threadId: string): Promise<ThreadAdmin> {
    const result = await AppDataSource.query(
      `
      SELECT 1
      FROM thread_admin
      WHERE userId = $1
        AND threadId = $2
      LIMIT 1
      `,
      [userId, threadId] 
    );
    return result
  }

  async grantOrRestoreThreadAdmin(
   userId: string,
   threadId: string,
   grantedById: string | null
  ): Promise<ThreadAdmin> {
    const result = await AppDataSource.query(
        `
        INSERT INTO thread_admin (
        id, "userId", "threadId", "grantedById", "createdAt"
        )
        VALUES (
        gen_random_uuid(), $1, $2, $3, NOW()
        )
        ON CONFLICT ("userId", "threadId")
        DO UPDATE SET
        "revokedAt" = NULL,
        "grantedById" = EXCLUDED."grantedById"
        RETURNING *
        `,
        [userId, threadId, grantedById]
    );
  return result[0];
}

}
