#!/bin/bash

echo "🧪 TheRev Integration Test Runner"
echo "=================================="

# Check if running in Docker
if [[ ! -f /.dockerenv ]] && [[ "$DOCKER_ENV" != "true" ]]; then
  echo "❌ ERROR: Integration tests can only be run inside Docker containers"
  echo ""
  echo "Please use: npm run docker:test"
  echo ""
  echo "This ensures:"
  echo "  • Consistent database environment"
  echo "  • Proper isolation from local setup"
  echo "  • Reproducible test results"
  echo ""
  exit 1
fi

echo "✅ Running in Docker environment"
echo "🔧 Starting integration tests..."
echo ""

# Set environment for proper Jest output
export NODE_ENV=test
export INTEGRATION_TESTS=true

# Run integration tests with visible output
exec npm run test:integration:docker