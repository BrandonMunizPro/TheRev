// resolvers/AuthResolver.ts
import { Resolver, Mutation, Arg } from "type-graphql";
import { UsersModel } from "../models/users.model";
import { returnedUser } from "./User";
import { User } from "../entities/User";

@Resolver()
export class AuthResolver {
  private usersModel = new UsersModel();

  @Mutation(() => User)
  async login(
    @Arg("email") email: string,
    @Arg("password") password: string
  ): Promise<returnedUser> {
    const user = await this.usersModel.verifyUser({ email }, password);
    return user;
  }
}
