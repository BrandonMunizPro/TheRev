import 'dotenv/config';
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { User } from './entities/User';
import { Thread } from './entities/Thread';
import { Post } from './entities/Post';
import { ThreadAdmin } from './entities/ThreadAdmin';
import { TaskEntity, TaskEvent, TaskMetrics, Worker } from './entities/Task';
import { NewsArticle } from './entities/NewsArticle';
import { ThreadVote } from './entities/ThreadVote';
import { Friend } from './entities/Friend';
import { Server } from './entities/Server';
import { Channel } from './entities/Channel';
import { ServerMember } from './entities/ServerMember';
import { Message } from './entities/Message';
import {
  MigrationState,
  UserStorageLocation,
  MigrationBatchLog,
} from './entities/MigrationState';

const isTest = process.env.NODE_ENV === 'test';
const isDevelopment = process.env.NODE_ENV === 'development';

export const AppDataSource = new DataSource({
  type: 'postgres',
  host:
    isTest && !process.env.DOCKER_ENV
      ? process.env.DB_HOST || 'localhost'
      : process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database:
    process.env.DB_DATABASE ||
    (isTest ? process.env.DB_TEST_DATABASE : process.env.DB_DATABASE),
  synchronize: true, // true for development to auto-create tables
  logging: isDevelopment,
  entities: [
    User,
    Thread,
    Post,
    ThreadAdmin,
    TaskEntity,
    TaskEvent,
    TaskMetrics,
    Worker,
    MigrationState,
    UserStorageLocation,
    MigrationBatchLog,
    NewsArticle,
    ThreadVote,
    Friend,
    Server,
    Channel,
    ServerMember,
    Message,
  ],
  migrations: isTest ? undefined : ['./src/migrations/*.ts'],
  subscribers: [],

  extra: {
    connectionLimit: 10,
    acquireTimeout: 60000,
    timeout: 60000,
  },
});
