import { InputType, Field, ID } from 'type-graphql';
import { Resolver, Query, Mutation, Arg } from 'type-graphql';
import { User } from '../entities/User';
import { UsersModel } from '../models/users.model';
import { IsOptional, IsString, IsEmail } from 'class-validator';

//WE NEED TO ADD ROLES TO USER AS WELL
@InputType()
export class CreateUserInput {
  @Field()
  userName!: string;

  @Field()
  firstName!: string;

  @Field()
  lastName!: string;

  @Field()
  email!: string;

  @Field()
  password!: string;

  @Field({ nullable: true })
  bio?: string;

  @Field({ nullable: true })
  ideology?: string;
}

@InputType()
export class EditUserInput {
  @Field({ nullable: true })
  userName?: string;

  @Field({ nullable: true })
  firstName?: string;

  @Field({ nullable: true })
  lastName?: string;

  @Field({ nullable: true })
  email?: string;

  @Field({ nullable: true })
  password?: string;

  @Field({ nullable: true })
  bio?: string;

  @Field({ nullable: true })
  ideology?: string;
}

@InputType()
export class GetUserInput {
  @Field(() => ID, { nullable: true })
  id?: string;

  @Field({ nullable: true })
  userName?: string;

  @Field({ nullable: true })
  email?: string;
}

export type UserIdentifier = {
  userName?: string;
  email?: string;
};

@InputType()
export class UserIdentifierInput {
  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  userName?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsEmail()
  email?: string;
}

export type returnedUser = {
  id?: string;
  userName?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  role?: string;
  bio?: string;
  ideology?: string;
  profilePicUrl?: string;
  password?: string; // only internal
  jwt?: string; // returned after login
  createdAt?: Date;
  updatedAt?: Date;
};

@Resolver()
export class UserResolver {
  private model = new UsersModel();

  @Query(() => [User])
  async users(): Promise<User[]> {
    return this.model.getAllUsers();
  }

  @Query(() => User, { nullable: true })
  async user(@Arg('data') data: GetUserInput): Promise<returnedUser | null> {
    if (!data.id && !data.userName && !data.email) {
      throw new Error('Please provide either id, username, or email.');
    }
    return this.model.getUser(data);
  }

  @Mutation(() => User)
  async createUser(@Arg('data') data: CreateUserInput): Promise<returnedUser> {
    return this.model.registerUser(data);
  }

  @Mutation(() => User)
  async editUser(
    @Arg('id', () => ID) id: string,
    @Arg('data') data: EditUserInput
  ): Promise<returnedUser> {
    return this.model.editUser(id, data);
  }

  @Mutation(() => Boolean)
  async deleteUser(@Arg('id', () => ID) id: string): Promise<boolean> {
    return this.model.deleteUser(id);
  }
}
