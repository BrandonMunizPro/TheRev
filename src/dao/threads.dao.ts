import { AppDataSource } from '../data-source';
import { Thread } from '../entities/Thread';
import { DeepPartial, Repository } from 'typeorm';
import { ErrorHandler } from '../errors/ErrorHandler';

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
      },
    });
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
          createdAt: 'DESC',
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
      relations: ['author'],
    });
  }

  async findThreadsUserParticipatedIn(
    userId: string,
    limit = 20
  ): Promise<Thread[]> {
    // Get threads where user is author OR has posted (participated)
    return this.repo
      .createQueryBuilder('thread')
      .leftJoinAndSelect('thread.author', 'author')
      .leftJoinAndSelect('thread.posts', 'post')
      .where('thread.author.id = :userId', { userId })
      .orWhere('post.author.id = :userId', { userId })
      .distinct(true)
      .orderBy('thread.createdAt', 'DESC')
      .limit(limit)
      .getMany();
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
