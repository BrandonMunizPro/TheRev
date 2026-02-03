import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { User } from './entities/User';
import { Thread } from './entities/Thread';
import { Post } from './entities/Post';
import { ThreadAdmin } from './entities/ThreadAdmin';

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
  synchronize: isTest, // true for tests, false for production
  logging: isDevelopment,
  entities: [User, Thread, Post, ThreadAdmin],
  migrations: isTest ? undefined : ['./src/migrations/*.ts'],
  subscribers: [],

  extra: {
    connectionLimit: 10,
    acquireTimeout: 60000,
    timeout: 60000,
  },
});
