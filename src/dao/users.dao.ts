import { AppDataSource } from "../data-source";
import { User } from "../entities/User";
import { DeepPartial } from "typeorm";

export class UsersDao {
  private repo = AppDataSource.getRepository(User);

  async findAll(): Promise<User[]> {
    return this.repo.find();
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.repo.findOne({ where: { email } });
  }

  async findById(id: string): Promise<User | null> {
    return this.repo.findOne({ where: { id } });
  }

   async findByUsername(userName: string): Promise<User | null> {
    return this.repo.findOne({ where: { userName } });
  }

  async create(data: Partial<User>): Promise<User> {
    const user = this.repo.create(data);
    return this.repo.save(user);
  }

  async updateUser(id: string, data: DeepPartial<User>): Promise<User> {
    await this.repo.update({ id }, data);
    const updated = await this.repo.findOne({ where: { id } });

    if (!updated) {
      throw new Error(`User with id ${id} not found`);
    }
    return updated;
  }


  async saveUserPasswordByName(
    userName: string,
    hashedPassword: string
  ): Promise<void> {
    const user = await this.repo.findOne({ where: { userName } });
    if (!user) {
      throw new Error(`User ${userName} not found`);
    }

    user.password = hashedPassword;
    await this.repo.save(user);
  }

  async deleteUser(id: string): Promise<boolean> {
    const result = await this.repo.delete({ id });
    return result.affected === 1;
  }
}
