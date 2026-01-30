import { UserRole } from './enums/UserRole';

export interface GraphQLContext {
  request: any;
  user?: {
    userId: string;
    role: UserRole;
  };
}
