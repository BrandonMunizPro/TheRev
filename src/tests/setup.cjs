const { reflectMetadata } = require('reflect-metadata');

// Integration test setup for TypeScript
process.env.NODE_ENV = 'test';

// Mock JWT secret for tests
process.env.JWT_SECRET = 'test-secret-key';
process.env.JWT_SECRET_KEY = 'test-secret-key';

// Set test database config for integration tests
process.env.DB_HOST = process.env.DB_HOST || 'postgres-test';
process.env.DB_PORT = process.env.DB_PORT || '5432';
process.env.DB_NAME = process.env.DB_DATABASE || 'test_therev';
process.env.DB_USERNAME = process.env.DB_USERNAME || 'postgres';
process.env.DB_PASSWORD = process.env.DB_PASSWORD || 'postgres';
process.env.DB_SSL = process.env.DB_SSL || 'false';

// Global test timeout
jest.setTimeout(30000);

beforeAll(async () => {
  // Additional setup if needed
  console.log('🐳 Docker integration test setup complete');
});

afterAll(async () => {
  // Cleanup
});
