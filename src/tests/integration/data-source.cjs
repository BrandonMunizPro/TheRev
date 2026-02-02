require('dotenv').config();
require('reflect-metadata');

const { DataSource } = require('typeorm');
const path = require('path');
const fs = require('fs');

console.log(
  'DEBUG: Loading entities from:',
  path.resolve(__dirname, '../../entities')
);

function loadEntities() {
  const entitiesDir = path.resolve(__dirname, '../../entities');
  const entityFiles = fs
    .readdirSync(entitiesDir)
    .filter((file) => file.endsWith('.ts'));

  const entities = [];

  for (const file of entityFiles) {
    try {
      const filePath = path.join(entitiesDir, file);
      console.log(`DEBUG: Loading entity from ${filePath}`);

      const entityModule = require(filePath);

      const entityClass =
        entityModule.default ||
        entityModule[file.replace('.ts', '')] ||
        entityModule;

      if (entityClass && typeof entityClass === 'function') {
        entities.push(entityClass);
        console.log(`DEBUG: Successfully loaded entity: ${file}`);
      } else {
        console.warn(`DEBUG: Could not extract entity class from ${file}`);
      }
    } catch (error) {
      console.error(`DEBUG: Error loading entity ${file}:`, error.message);
    }
  }

  console.log(
    `DEBUG: Loaded ${entities.length} entities:`,
    entities.map((e) => e.name || 'unnamed')
  );
  return entities;
}

const dataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  username: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD || 'Bjornmaximus11',
  database:
    process.env.DB_DATABASE ||
    (process.env.NODE_ENV === 'test' ? 'therev_test' : 'therev'),
  synchronize: true,
  logging: process.env.NODE_ENV === 'development',
  entities: loadEntities(),
  migrations: [],
  subscribers: [],

  extra: {
    connectionLimit: 10,
    acquireTimeout: 60000,
    timeout: 60000,
  },
});

async function ensureDatabaseSynchronized() {
  console.log('🔍 Ensuring database is synchronized...');
  if (!dataSource.isInitialized) {
    await dataSource.initialize();
    console.log('✅ Database initialized');
  }

  // Force synchronization - this should create tables
  try {
    await dataSource.synchronize(true);
    console.log('✅ Database synchronized successfully');
  } catch (error) {
    console.error('❌ Database synchronization failed:', error.message);
    console.log('🔄 Attempting manual table creation...');

    try {
      await dataSource.query(`
        CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
        
        CREATE TABLE IF NOT EXISTS "user" (
          "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
          "userName" character varying NOT NULL,
          "firstName" character varying NOT NULL,
          "lastName" character varying NOT NULL,
          email character varying NOT NULL,
          password character varying NOT NULL,
          bio text,
          ideology character varying,
          "profilePicUrl" character varying,
          role character varying NOT NULL DEFAULT 'user',
          "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
          "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
          CONSTRAINT "PK_user_id" PRIMARY KEY ("id")
        );

        CREATE TABLE IF NOT EXISTS "thread" (
          "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
          "title" character varying NOT NULL,
          "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
          "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
          "createdById" uuid,
          "isLocked" boolean NOT NULL DEFAULT false,
          CONSTRAINT "PK_thread_id" PRIMARY KEY ("id"),
          CONSTRAINT "FK_thread_createdById" FOREIGN KEY ("createdById") REFERENCES "user" ("id") ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS "post" (
          "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
          "content" character varying NOT NULL,
          "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
          "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
          "authorId" uuid NOT NULL,
          "threadId" uuid NOT NULL,
          "parentId" uuid,
          "postType" character varying NOT NULL DEFAULT 'comment',
          "isPinned" boolean NOT NULL DEFAULT false,
          CONSTRAINT "PK_post_id" PRIMARY KEY ("id"),
          CONSTRAINT "FK_post_authorId" FOREIGN KEY ("authorId") REFERENCES "user" ("id") ON DELETE CASCADE,
          CONSTRAINT "FK_post_threadId" FOREIGN KEY ("threadId") REFERENCES "thread" ("id") ON DELETE CASCADE,
          CONSTRAINT "FK_post_parentId" FOREIGN KEY ("parentId") REFERENCES "post" ("id") ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS "thread_admin" (
          "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
          "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
          "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
          "userId" uuid NOT NULL,
          "threadId" uuid NOT NULL,
          "grantedById" uuid,
          "revokedAt" TIMESTAMP,
          CONSTRAINT "PK_thread_admin_id" PRIMARY KEY ("id"),
          CONSTRAINT "FK_thread_admin_userId" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE CASCADE,
          CONSTRAINT "FK_thread_admin_threadId" FOREIGN KEY ("threadId") REFERENCES "thread" ("id") ON DELETE CASCADE,
          CONSTRAINT "FK_thread_admin_grantedById" FOREIGN KEY ("grantedById") REFERENCES "user" ("id") ON DELETE SET NULL
        );
      `);
      console.log('✅ Manual table creation successful');
    } catch (manualError) {
      console.error('❌ Manual table creation failed:', manualError.message);
    }

    try {
      await dataSource.query('SELECT 1');
      console.log('✅ Database connection successful');
    } catch (checkError) {
      console.error('❌ Database connection failed:', checkError.message);
    }
  }
}

module.exports = {
  dataSource,
  ensureDatabaseSynchronized,
};
