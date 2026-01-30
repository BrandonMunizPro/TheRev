import { ObjectType, Field } from 'type-graphql';
import { User } from './User';

@ObjectType()
export class AuthResponse {
  @Field(() => User)
  user!: User;

  @Field()
  jwt!: string;
}
