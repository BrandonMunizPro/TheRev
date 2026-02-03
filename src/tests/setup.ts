import 'reflect-metadata';

process.env.NODE_ENV = 'test';

process.env.JWT_SECRET = 'test-secret-key';
process.env.JWT_SECRET_KEY = 'test-secret-key';

process.env.DB_HOST = process.env.DB_HOST || 'postgres-test';
process.env.DB_PORT = process.env.DB_PORT || '5432';
process.env.DB_DATABASE = process.env.DB_DATABASE || 'test_therev';
process.env.DB_USERNAME = process.env.DB_USERNAME || 'postgres';
process.env.DB_PASSWORD = process.env.DB_PASSWORD || 'postgres';
process.env.DB_SSL = process.env.DB_SSL || 'false';

jest.setTimeout(30000);

beforeAll(async () => {
  // eslint-disable-next-line no-console
  console.log('🐳 Docker integration test setup complete');
});

afterAll(async () => {});
