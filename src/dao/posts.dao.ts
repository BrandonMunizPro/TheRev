import { AppDataSource } from "../data-source";
import { Post } from "../entities/Post";
import { DeepPartial } from "typeorm";

export class PostsDao {
  private repo = AppDataSource.getRepository(Post);


  async create(data: Partial<Post>): Promise<Post> {
    const post = this.repo.create(data);
    return this.repo.save(post);
  }



}
