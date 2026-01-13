import { AppDataSource } from "../data-source";
import { Post } from "../entities/Post";
import { DeepPartial } from "typeorm";

export class PostsDao {
  private repo = AppDataSource.getRepository(Post);


  async create(data: Partial<Post>): Promise<Post> {
    const post = this.repo.create(data);
    return this.repo.save(post);
  }

  
  async createPostRaw(
    content: string,
    authorId: string,
    threadId: string,
    type: string,
    createdAt?: Date,
    metadata?: { thumbnailUrl?: string; duration?: number; provider?: "youtube" | "vimeo" },
    isPinned: boolean = false
  ) {
    const result = await AppDataSource.query(
      `
      INSERT INTO post (content, author_id, thread_id, type, created_at, updated_at, metadata, is_pinned)
      VALUES ($1, $2, $3, $4, $5, $5, $6, $7)
      RETURNING id, content, type, author_id, thread_id, created_at, updated_at, metadata, is_pinned
      `,
      [
        content,
        authorId,
        threadId,
        type,
        createdAt || new Date(),
        metadata ? JSON.stringify(metadata) : null,
        isPinned,
      ]
    );

    return result[0]; // return the inserted row
  }

    async updatePost(id: string, data: DeepPartial<Post>): Promise<Post> {
       data.updatedAt = new Date();
      await this.repo.update({ id }, data);
      const updated = await this.repo.findOne({ where: { id } });
  
      if (!updated) {
        throw new Error(`Thread with id ${id} not found`);
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
          relations: ["thread"],
        });
      }
  
    async findById(id: string): Promise<Post | null> {
      return this.repo.findOne({ where: { id } });
    }



}
