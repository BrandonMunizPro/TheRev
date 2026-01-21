import 'dotenv/config';

// Mock database connection for tests
jest.mock('../data-source', () => ({
  AppDataSource: {
    getRepository: jest.fn(),
    query: jest.fn(),
    initialize: jest.fn().mockResolvedValue(true),
    isInitialized: true,
  },
}));

// Mock JWT secret for tests
process.env.JWT_SECRET = 'test-secret-key';

// Set test environment
process.env.NODE_ENV = 'test';