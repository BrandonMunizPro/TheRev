require('dotenv').config();
require('reflect-metadata');

const { AppDataSource } = require('../../data-source');

module.exports = async function globalSetup() {
  process.env.INTEGRATION_TESTS = 'true';

  if (!process.env.DOCKER_ENV) {
    console.error('Integration tests must be run inside Docker containers');
    console.error('Please use: npm run docker:test');
    process.exit(1);
  }

  try {
    console.log('🔍 Ensuring database is synchronized...');
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
      console.log('✅ Database initialized');
    }

    await AppDataSource.synchronize(true);
    console.log('✅ Database synchronized successfully');
    console.log('✅ Integration test database setup complete');
  } catch (error) {
    console.error('❌ Integration test database setup failed:', error.message);
    process.exit(1);
  }

  console.log('🐳 Docker integration test setup complete');
};
