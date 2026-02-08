export default {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.ts', '**/?(*.)+(spec|test).ts'],
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
      branches: 20,
      functions: 5,
      lines: 20,
      statements: 20,
    },
    './src/dao/': {
      branches: 15,
      functions: 5,
      lines: 15,
      statements: 15,
    },
    './src/services/': {
      branches: 20,
      functions: 5,
      lines: 20,
      statements: 20,
    },
    './src/resolvers/': {
      branches: 20,
      functions: 5,
      lines: 20,
      statements: 20,
    },
  },
  setupFilesAfterEnv: ['<rootDir>/src/tests/setup.cjs'],
  testTimeout: 30000,
  projects: [
    {
      displayName: 'Unit Tests',
      testMatch: [
        '<rootDir>/src/tests/**/*.test.ts',
        '!<rootDir>/src/tests/integration/**/*.test.ts',
      ],
      setupFilesAfterEnv: ['<rootDir>/src/tests/setup.cjs'],
      transform: {
        '^.+\\.ts$': [
          'ts-jest',
          {
            tsconfig: 'tsconfig.json',
            isolatedModules: true,
          },
        ],
      },
    },
    {
      displayName: 'Integration Tests',
      testMatch: ['<rootDir>/src/tests/integration/**/*.test.ts'],
      setupFilesAfterEnv: ['<rootDir>/src/tests/setup.cjs'],
      globalSetup: '<rootDir>/src/tests/integration/globalSetup.cjs',
      globalTeardown: '<rootDir>/src/tests/integration/globalTeardown.cjs',
      transform: {
        '^.+\\.ts$': [
          'ts-jest',
          {
            tsconfig: 'tsconfig.json',
            isolatedModules: true,
          },
        ],
      },
    },
  ],
};
