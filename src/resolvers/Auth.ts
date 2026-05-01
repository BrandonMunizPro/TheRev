import { Resolver, Mutation, Arg } from 'type-graphql';
import { UsersModel } from '../models/users.model';
import { returnedUser, UserIdentifierInput } from './User';
import { User } from '../entities/User';
import { AuthResponse } from '../entities/AuthResponse';
import { UserRole } from '../graphql/enums/UserRole';

@Resolver()
export class AuthResolver {
  private usersModel = new UsersModel();

  @Mutation(() => String)
  async forgotPassword(@Arg('userName') userName: string): Promise<string> {
    const result = await this.usersModel.forgotPassword(userName);
    return result;
  }

  @Mutation(() => String)
  async resetPassword(
    @Arg('userName') userName: string,
    @Arg('resetToken') resetToken: string,
    @Arg('newPassword') newPassword: string
  ): Promise<string> {
    const result = await this.usersModel.resetPassword(
      userName,
      resetToken,
      newPassword
    );
    return result;
  }

  @Mutation(() => User)
  async login(
    @Arg('email') email: string,
    @Arg('password') password: string
  ): Promise<returnedUser> {
    const user = await this.usersModel.verifyUser({ email }, password);
    return user;
  }

  @Mutation(() => AuthResponse)
  async verifyUser(
    @Arg('identifier') identifier: UserIdentifierInput,
    @Arg('password') password: string
  ): Promise<AuthResponse> {
    const user = await this.usersModel.verifyUser(identifier, password);
    return {
      user: {
        id: user.id || '',
        userName: user.userName || '',
        firstName: user.firstName || '',
        lastName: user.lastName || '',
        email: user.email || '',
        password: '', // Not exposed
        role: (user.role as UserRole) || UserRole.STANDARD,
        bio: user.bio,
        ideology: user.ideology,
        profilePicUrl: user.profilePicUrl,
        isOnline: user.isOnline || false,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
      jwt: user.jwt || '',
    };
  }
}
