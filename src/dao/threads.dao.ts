import { AppDataSource } from '../data-source';
import { Thread, ThreadVoteCounts } from '../entities/Thread';
import { DeepPartial, In, Repository } from 'typeorm';
import { ErrorHandler } from '../errors/ErrorHandler';
import { Perspective } from '../graphql/enums/Perspective';

export class ThreadsDao {
  private get repo(): Repository<Thread> {
    return AppDataSource.getRepository(Thread);
  }

  async findAll(): Promise<Thread[]> {
    return this.repo.find({
      relations: ['author', 'posts', 'posts.author'],
    });
  }

  async findAllWithMetadata(): Promise<Thread[]> {
    return this.repo.find({
      relations: [
        'author',
        'posts',
        'posts.author',
        'posts.replies',
        'posts.replies.author',
      ],
      order: {
        isPinned: 'DESC',
        createdAt: 'DESC',
        posts: {
          createdAt: 'ASC',
        },
      },
    });
  }

  async getVoteCountsForThreads(
    threadIds: string[]
  ): Promise<Map<string, ThreadVoteCounts>> {
    if (threadIds.length === 0) {
      return new Map();
    }

    const result = await AppDataSource.query(
      `
      SELECT "threadId", perspective, COUNT(*) as count
      FROM thread_vote
      WHERE "threadId" = ANY($1)
      GROUP BY "threadId", perspective
      `,
      [threadIds]
    );

    const voteCountsMap = new Map<string, ThreadVoteCounts>();

    // Initialize all threads with zero counts
    threadIds.forEach((id) => {
      voteCountsMap.set(id, { PRO: 0, AGAINST: 0, NEUTRAL: 0, total: 0 });
    });

    // Populate with actual counts
    result.forEach((row) => {
      const counts = voteCountsMap.get(row.threadId);
      if (counts) {
        if (row.perspective === Perspective.PRO) {
          counts.PRO = parseInt(row.count);
        } else if (row.perspective === Perspective.AGAINST) {
          counts.AGAINST = parseInt(row.count);
        } else {
          counts.NEUTRAL = parseInt(row.count);
        }
        counts.total += parseInt(row.count);
      }
    });

    return voteCountsMap;
  }

  async findById(id: string): Promise<Thread | null> {
    return this.repo.findOne({
      where: { id },
      relations: ['author', 'posts', 'posts.author'],
    });
  }

  async findByIdWithReplies(id: string): Promise<Thread | null> {
    return this.repo.findOne({
      where: { id },
      relations: [
        'author',
        'posts',
        'posts.author',
        'posts.replies',
        'posts.replies.author',
      ],
      order: {
        posts: {
          isPinned: 'DESC',
          createdAt: 'ASC',
        },
      },
    });
  }

  async findAllByUserId(userId: string): Promise<Thread[]> {
    return this.repo.find({
      where: {
        author: {
          id: userId,
        },
      },
      relations: ['author', 'posts'],
    });
  }

  async findThreadsUserParticipatedIn(
    userId: string,
    limit = 20
  ): Promise<Thread[]> {
    // Get threads where user is author OR has posted (participated)
    // First get thread IDs where user participated
    const participatedThreads = await this.repo
      .createQueryBuilder('thread')
      .leftJoin('thread.posts', 'post')
      .where('thread.author = :userId', { userId })
      .orWhere('post.author = :userId', { userId })
      .select('thread.id')
      .distinct()
      .getMany();

    const threadIds = participatedThreads.map((t) => t.id);

    if (threadIds.length === 0) {
      return [];
    }

    // Then fetch full thread data with all relations including parent posts
    return this.repo.find({
      where: { id: In(threadIds) },
      relations: [
        'author',
        'posts',
        'posts.author',
        'posts.parent',
        'posts.parent.author',
      ],
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  async createThread(data: Partial<Thread>): Promise<Thread> {
    const thread = this.repo.create(data);
    return this.repo.save(thread);
  }

  async updateThread(id: string, data: DeepPartial<Thread>): Promise<Thread> {
    data.updatedAt = new Date();
    await this.repo.update({ id }, data);
    const updated = await this.repo.findOne({ where: { id } });

    if (!updated) {
      throw ErrorHandler.threadNotFound(id);
    }
    return updated;
  }

  async deleteThread(id: string): Promise<boolean> {
    const result = await this.repo.delete({ id });
    return result.affected === 1;
  }
}
