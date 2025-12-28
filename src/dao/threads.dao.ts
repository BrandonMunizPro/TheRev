import { AppDataSource } from "../data-source";
import { Thread } from "../entities/Thread";
import { DeepPartial } from "typeorm";

export class ThreadsDao {
  private repo = AppDataSource.getRepository(Thread);

  async findAll(): Promise<Thread[]> {
    return this.repo.find();
  }

  async findById(id: string): Promise<Thread | null> {
    return this.repo.findOne({ where: { id } });
  }

   async findByUserId(userId: string): Promise<Thread | null> {
    return this.repo.findOne({ 
        where: {  
          author: {
           id: userId,
          }
        }, 
    });
   }

  async createThread(data: Partial<Thread>): Promise<Thread> {
    const thread = this.repo.create(data);
    return this.repo.save(thread);
  }

  async updateThread(id: string, data: DeepPartial<Thread>): Promise<Thread> {
    await this.repo.update({ id }, data);
    const updated = await this.repo.findOne({ where: { id } });

    if (!updated) {
      throw new Error(`Thread with id ${id} not found`);
    }
    return updated;
  }
  
  async deleteThread(id: string): Promise<boolean> {
    const result = await this.repo.delete({ id });
    return result.affected === 1;
  }
}
