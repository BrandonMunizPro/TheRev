import 'dotenv/config';
import 'reflect-metadata';
import express, { type Express } from 'express';
import { getUserFromRequest } from '../../auth/getUserFromRequest';
import { createYoga } from 'graphql-yoga';
import { buildSchema } from 'type-graphql';
import { UserResolver } from '../../resolvers/User';
import { ThreadResolver } from '../../resolvers/Thread';
import { ThreadAdminResolver } from '../../resolvers/ThreadPermissions';
import { AuthResolver } from '../../resolvers/Auth';
import { PostResolver } from '../../resolvers/Post';
import { GraphQLContext } from '../../graphql/context';
import { AppDataSource } from '../../data-source';

export async function createTestApp(): Promise<Express> {
  const app: Express = express();

  if (!AppDataSource.isInitialized) {
    await AppDataSource.initialize();
    // Synchronize database schema for tests
    await AppDataSource.synchronize(true);
  }

  const schema = await buildSchema({
    resolvers: [
      UserResolver,
      ThreadResolver,
      ThreadAdminResolver,
      AuthResolver,
      PostResolver,
    ],
    validate: { forbidUnknownValues: true },
  });

  const yoga = createYoga({
    schema,
    context: ({ request }): GraphQLContext => ({
      request,
      user: getUserFromRequest(request),
    }),
    graphqlEndpoint: '/graphql',
  });

  // Use GraphQL Yoga as middleware
  app.use('/graphql', yoga);

  return app;
}
