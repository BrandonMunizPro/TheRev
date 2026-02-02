import { AppDataSource } from '../data-source';
import { ThreadAdmin } from '../entities/ThreadAdmin';

export class ThreadAdminDao {
  private repo = AppDataSource.getRepository(ThreadAdmin);

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
    return result;
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

  async revokeThreadAdmin(
    userId: string,
    threadId: string
  ): Promise<ThreadAdmin> {
    const result = await AppDataSource.query(
      `
      UPDATE thread_admin
      SET "revokedAt" = NOW()
      WHERE "userId" = $1
        AND "threadId" = $2
        AND "revokedAt" IS NULL
      RETURNING *
      `,
      [userId, threadId]
    );
    return result[0];
  }

  async listAdminsForThread(threadId: string): Promise<ThreadAdmin[]> {
    const result = await AppDataSource.query(
      `
      SELECT *
      FROM thread_admin
      WHERE "threadId" = $1
        AND "revokedAt" IS NULL
      ORDER BY "createdAt" ASC
      `,
      [threadId]
    );
    return result;
  }

  async listThreadsForUser(userId: string): Promise<ThreadAdmin[]> {
    const result = await AppDataSource.query(
      `
      SELECT *
      FROM thread_admin
      WHERE "userId" = $1
        AND "revokedAt" IS NULL
      ORDER BY "createdAt" ASC
      `,
      [userId]
    );
    return result;
  }
}
