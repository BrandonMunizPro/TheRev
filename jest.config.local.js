module.exports = {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['src/tests/integration/**/*.test.ts'],
  verbose: true,
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        tsconfig: 'tsconfig.json',
        isolatedModules: true,
      },
    ],
  },
  collectCoverageFrom: [
    'src/dao/**/*.ts',
    'src/models/**/*.ts',
    'src/resolvers/**/*.ts',
    'src/services/**/*.ts',
    'src/entities/**/*.ts',
    'src/graphql/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/*.test.ts',
    '!src/tests/**/*',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  coverageThreshold: {
    global: {
      lines: 80,
      statements: 80,
    },
  },
  testTimeout: 30000,
  setupFilesAfterEnv: ['<rootDir>/src/tests/setup.cjs'],
};
