import { AppDataSource } from '../data-source';
import { Post } from '../entities/Post';
import { DeepPartial, Repository } from 'typeorm';
import { ErrorHandler } from '../errors/ErrorHandler';

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
    parentId?: string
  ) {
    const result = await AppDataSource.query(
      `
      INSERT INTO post (content, "authorId", "threadId", type, "createdAt", "updatedAt", metadata, "isPinned", "parentId")
      VALUES ($1, $2, $3, $4, $5, $5, $6, $7, $8)
      RETURNING id, content, type, "authorId", "threadId", "createdAt", "updatedAt", metadata, "isPinned", "parentId"
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
      ]
    );

    return result[0];
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

  async findAllByThreadId(threadId: string): Promise<Post[]> {
    return this.repo.find({
      where: {
        thread: {
          id: threadId,
        },
      },
      relations: ['thread'],
    });
  }

  async findById(id: string): Promise<Post | null> {
    return this.repo.findOne({ where: { id } });
  }

  async deletePost(id: string): Promise<boolean> {
    const result = await this.repo.delete({ id });
    return result.affected === 1;
  }
}
