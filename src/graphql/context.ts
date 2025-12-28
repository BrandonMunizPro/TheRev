export interface GraphQLContext {
  user?: {
    userId: string;
    userName: string;
    email: string;
    iat: number;
    exp: number;
  };
}
