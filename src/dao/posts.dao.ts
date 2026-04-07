import { AppDataSource } from '../data-source';
import { Post } from '../entities/Post';
import { DeepPartial, Repository, In } from 'typeorm';
import { ErrorHandler } from '../errors/ErrorHandler';
import { Perspective } from '../graphql/enums/Perspective';

export class PostsDao {
  private get repo(): Repository<Post> {
    return AppDataSource.getRepository(Post);
  }

  async create(data: Partial<Post>): Promise<Post> {
    const post = this.repo.create(data);
    return this.repo.save(post);
  }

  async createPostRaw(
    content: string,
    authorId: string,
    threadId: string,
    postType: string,
    createdAt?: Date,
    metadata?: {
      thumbnailUrl?: string;
      duration?: number;
      provider?: 'youtube' | 'vimeo';
    },
    isPinned: boolean = false,
    parentId?: string,
    perspective?: Perspective
  ) {
    const result = await AppDataSource.query(
      `
      INSERT INTO post (content, "authorId", "threadId", type, "createdAt", "updatedAt", metadata, "isPinned", "parentId", perspective)
      VALUES ($1, $2, $3, $4, $5, $5, $6, $7, $8, $9)
      RETURNING id, content, type, "authorId", "threadId", "createdAt", "updatedAt", metadata, "isPinned", "parentId", perspective
      `,
      [
        content,
        authorId,
        threadId,
        postType,
        createdAt || new Date(),
        metadata ? JSON.stringify(metadata) : null,
        isPinned,
        parentId || null,
        perspective || Perspective.NEUTRAL,
      ]
    );

    return result[0];
  }

  async findAllByThreadId(
    threadId: string,
    perspectives?: Perspective[]
  ): Promise<Post[]> {
    const where: any = {
      thread: {
        id: threadId,
      },
    };

    if (perspectives && perspectives.length > 0) {
      where.perspective = In(perspectives);
    }

    return this.repo.find({
      where,
      relations: ['thread'],
      order: { createdAt: 'ASC' },
    });
  }

  async updatePost(id: string, data: DeepPartial<Post>): Promise<Post> {
    data.updatedAt = new Date();
    await this.repo.update({ id }, data);
    const updated = await this.repo.findOne({ where: { id } });
    if (!updated) {
      throw ErrorHandler.postNotFound(id);
    }
    return updated;
  }

  async findAll(): Promise<Post[]> {
    return this.repo.find();
  }

  async findById(id: string): Promise<Post | null> {
    return this.repo.findOne({ where: { id } });
  }

  async deletePost(id: string): Promise<boolean> {
    const result = await this.repo.delete({ id });
    return result.affected === 1;
  }

  async findByAuthorId(authorId: string, limit = 50): Promise<Post[]> {
    const results = await AppDataSource.query(
      `
      SELECT 
        p.id, p.content, p.type, p."isPinned", p.perspective, 
        p."createdAt", p."updatedAt", p.metadata, p."parentId",
        t.id as "threadId", t.title as "threadTitle",
        u.id as "authorId", u."userName" as "authorUserName",
        parent_post.id as "parentPostId",
        parent_post.content as "parentPostContent",
        parent_u.id as "parentAuthorId",
        parent_u."userName" as "parentAuthorUserName"
      FROM post p
      LEFT JOIN thread t ON p."threadId" = t.id
      LEFT JOIN users u ON p."authorId" = u.id
      LEFT JOIN post parent_post ON p."parentId" = parent_post.id
      LEFT JOIN users parent_u ON parent_post."authorId" = parent_u.id
      WHERE p."authorId" = $1
      ORDER BY p."createdAt" DESC
      LIMIT $2
      `,
      [authorId, limit]
    );

    return results.map((row: any) => ({
      id: row.id,
      content: row.content,
      type: row.type,
      isPinned: row.isPinned,
      perspective: row.perspective,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      metadata: row.metadata,
      author: {
        id: row.authorId,
        userName: row.authorUserName,
      },
      thread: {
        id: row.threadId,
        title: row.threadTitle,
      },
      parent: row.parentPostId
        ? {
            id: row.parentPostId,
            content: row.parentPostContent,
            author: {
              id: row.parentAuthorId,
              userName: row.parentAuthorUserName,
            },
          }
        : null,
    }));
  }

  async getPerspectiveCountsForThreads(
    threadIds: string[]
  ): Promise<
    Map<
      string,
      { PRO: number; AGAINST: number; NEUTRAL: number; total: number }
    >
  > {
    const result = await AppDataSource.query(
      `
      SELECT "threadId", perspective, COUNT(*) as count
      FROM post
      WHERE "threadId" = ANY($1)
      GROUP BY "threadId", perspective
      `,
      [threadIds]
    );
    console.log('[getPerspectiveCountsForThreads] Raw result:', result);

    const countsMap = new Map<
      string,
      { PRO: number; AGAINST: number; NEUTRAL: number; total: number }
    >();

    for (const threadId of threadIds) {
      countsMap.set(threadId, { PRO: 0, AGAINST: 0, NEUTRAL: 0, total: 0 });
    }

    for (const row of result) {
      const counts = countsMap.get(row.threadId) || {
        PRO: 0,
        AGAINST: 0,
        NEUTRAL: 0,
        total: 0,
      };
      const count = parseInt(row.count, 10);
      if (row.perspective === 'PRO') {
        counts.PRO = count;
      } else if (row.perspective === 'AGAINST') {
        counts.AGAINST = count;
      } else {
        counts.NEUTRAL = count;
      }
      counts.total += count;
      countsMap.set(row.threadId, counts);
    }

    return countsMap;
  }
}
