require('dotenv').config();
require('reflect-metadata');

// Import main data source using require
const { AppDataSource } = require('../../data-source');

module.exports = async function globalSetup() {
  process.env.INTEGRATION_TESTS = 'true';

  // Verify Docker environment
  if (!process.env.DOCKER_ENV) {
    console.error('Integration tests must be run inside Docker containers');
    console.error('Please use: npm run docker:test');
    process.exit(1);
  }

  // Ensure database tables are created
  try {
    console.log('🔍 Ensuring database is synchronized...');
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
      console.log('✅ Database initialized');
    }

    // Force synchronization - this should create tables
    await AppDataSource.synchronize(true); // Force drop and recreate schema
    console.log('✅ Database synchronized successfully');
    console.log('✅ Integration test database setup complete');
  } catch (error) {
    console.error('❌ Integration test database setup failed:', error.message);
    process.exit(1);
  }

  console.log('🐳 Docker integration test setup complete');
};
