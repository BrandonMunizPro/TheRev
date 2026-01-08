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

}
