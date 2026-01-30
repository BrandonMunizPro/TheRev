# Integration Tests Docker-Only Policy

## IMPORTANT: Integration Tests Run in Docker ONLY

Integration tests are designed to run **exclusively inside Docker containers** to ensure:

- 🐳 **Consistent Environment**: Same database, network, and dependencies
- 🔒 **Isolation**: No interference with local development setup
- 🔄 **Reproducibility**: Identical test environment across all machines
- 📊 **Real Integration**: Tests against actual PostgreSQL instance

```bash
# Run integration tests in Docker (ONLY WAY) (If Linux/Windows or Mac use the second command if Windows/Powershell use the first)
npm run docker:test
npm run test:docker
```

## How It Works

1. **Setup Detection**: Tests check for `DOCKER_ENV=true` environment variable
2. **Early Exit**: If not in Docker, tests exit with error message
3. **Docker Enforcement**: Only the Docker container sets `DOCKER_ENV=true`
4. **Database Isolation**: Uses separate PostgreSQL container (`postgres-test`)


## 🐳 Docker Test Environment

```yaml
# Services in docker-compose.yml
services:
  integration-tests: # Test runner with DOCKER_ENV=true
```

## 🔍 Best Practices

1. **Always use** `npm run docker:test` for integration tests
2. **Unit tests** can run locally with `npm run test:unit`
3. **CI/CD** should use `npm run docker:test` in pipeline
4. **Never commit** changes that bypass Docker enforcement


### 2. Jest Configuration
- **jest.config.js**: Complete Jest configuration with TypeScript support
- **test scripts**: Added test, test:watch, test:coverage, test:ci scripts
- **test setup**: Mock configuration for database and environment



## Usage Commands

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Generate coverage report
npm run test:coverage

# Run tests for CI
npm run test:ci

# Run specific test file
npm test -- --testPathPatterns="threadAdmin.dao.test.ts"
```

### Mock Strategy
- **Database**: Mocked AppDataSource with Jest
- **Dependencies**: All external dependencies mocked
- **Type Safety**: TypeScript support with ts-jest

### Test Patterns
- **Unit Tests**: Isolated testing of individual methods
- **Integration Tests**: Testing method interactions
- **Error Handling**: Comprehensive error scenario testing
- **Authentication**: Mock user context testing

### Coverage Metrics
- **Statements**: Full coverage of core logic
- **Branches**: All conditional paths tested
- **Functions**: Every method tested
- **Lines**: Complete line coverage
