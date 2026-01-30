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
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
    './src/dao/': {
      branches: 90,
      functions: 90,
      lines: 90,
      statements: 90,
    },
    './src/services/': {
      branches: 85,
      functions: 85,
      lines: 85,
      statements: 85,
    },
    './src/resolvers/': {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
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
