require('dotenv').config();
require('reflect-metadata');

const path = require('path');

function safeRequire(modulePath) {
  const module = require(modulePath);
  return module.default || module;
}

console.log('Testing entity imports...');

try {
  const User = safeRequire(path.resolve(__dirname, 'src/entities/User'));
  console.log('✅ User loaded:', !!User, User.name);

  const Post = safeRequire(path.resolve(__dirname, 'src/entities/Post'));
  console.log('✅ Post loaded:', !!Post, Post.name);

  const Thread = safeRequire(path.resolve(__dirname, 'src/entities/Thread'));
  console.log('✅ Thread loaded:', !!Thread, Thread.name);

  const ThreadAdmin = safeRequire(
    path.resolve(__dirname, 'src/entities/ThreadAdmin')
  );
  console.log('✅ ThreadAdmin loaded:', !!ThreadAdmin, ThreadAdmin.name);

  const { DataSource } = require('typeorm');
  const testDataSource = new DataSource({
    type: 'postgres',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    username: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD,
    database: process.env.DB_TEST_DATABASE || 'therev_test',
    synchronize: true,
    logging: true,
    entities: [User, Post, Thread, ThreadAdmin],
  });

  console.log('🚀 Initializing data source...');
  await testDataSource.initialize();
  console.log('✅ Data source initialized successfully!');

  const userMeta = testDataSource.getMetadata('User');
  const postMeta = testDataSource.getMetadata('Post');
  const threadMeta = testDataSource.getMetadata('Thread');

  console.log('📋 Entity metadata:');
  console.log('  User:', !!userMeta);
  console.log('  Post:', !!postMeta);
  console.log('  Thread:', !!threadMeta);

  await testDataSource.destroy();
  console.log('✅ Test completed successfully!');
} catch (error) {
  console.error('❌ Error:', error.message);
  console.error(error);
}
