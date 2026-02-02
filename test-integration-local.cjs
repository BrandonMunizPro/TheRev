require('dotenv').config();
require('reflect-metadata');

process.env.NODE_ENV = 'test';
process.env.DOCKER_ENV = 'true';

const { execSync } = require('child_process');

console.log('Running integration tests...');

try {
  const result = execSync('npx jest --config jest.config.local.js', {
    stdio: 'inherit',
    cwd: process.cwd(),
  });

  console.log('Test result:', result.status);
  process.exit(result.status || 0);
} catch (error) {
  console.error('Test execution failed:', error);
  process.exit(1);
}
