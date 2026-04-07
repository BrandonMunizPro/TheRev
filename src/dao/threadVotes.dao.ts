import { AppDataSource } from '../data-source';
import { ThreadVote } from '../entities/ThreadVote';
import { Repository } from 'typeorm';
import { Perspective } from '../graphql/enums/Perspective';

export class ThreadVotesDao {
  private get repo(): Repository<ThreadVote> {
    return AppDataSource.getRepository(ThreadVote);
  }

  async create(data: Partial<ThreadVote>): Promise<ThreadVote> {
    const vote = this.repo.create(data);
    return this.repo.save(vote);
  }

  async findByUserAndThread(
    userId: string,
    threadId: string
  ): Promise<ThreadVote | null> {
    return this.repo.findOne({
      where: {
        user: { id: userId },
        thread: { id: threadId },
      },
    });
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.repo.delete({ id });
    return result.affected === 1;
  }

  async deleteByUserAndThread(
    userId: string,
    threadId: string
  ): Promise<boolean> {
    const result = await this.repo.delete({
      user: { id: userId },
      thread: { id: threadId },
    });
    return result.affected === 1;
  }

  async getCountsByThread(threadId: string): Promise<{
    PRO: number;
    AGAINST: number;
    NEUTRAL: number;
    total: number;
  }> {
    const votes = await this.repo.find({
      where: { thread: { id: threadId } },
    });

    const counts = {
      PRO: 0,
      AGAINST: 0,
      NEUTRAL: 0,
      total: votes.length,
    };

    votes.forEach((vote) => {
      if (vote.perspective === Perspective.PRO) counts.PRO++;
      else if (vote.perspective === Perspective.AGAINST) counts.AGAINST++;
      else counts.NEUTRAL++;
    });

    return counts;
  }
}
