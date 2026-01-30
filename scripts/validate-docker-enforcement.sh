#!/bin/bash

# Validation script to test Docker enforcement

echo "🧪 Testing Docker Enforcement"
echo "=========================="

echo ""
echo "1. Testing that integration tests fail outside Docker..."
cd "$(dirname "$0")/.."

# This should fail
if npm run test:integration 2>/dev/null; then
  echo "❌ FAILED: Integration tests ran outside Docker (should be blocked)"
  exit 1
else
  echo "✅ PASSED: Integration tests correctly blocked outside Docker"
fi

echo ""
echo "2. Checking Docker setup..."
if docker --version > /dev/null 2>&1; then
  echo "✅ Docker is available"
else
  echo "❌ Docker is not available - cannot run integration tests"
  exit 1
fi

echo ""
echo "3. Checking docker-compose setup..."
if docker-compose --version > /dev/null 2>&1; then
  echo "✅ Docker Compose is available"
else
  echo "❌ Docker Compose is not available"
  exit 1
fi

echo ""
echo "🎉 Docker enforcement validation completed!"
echo ""
echo "📋 Quick Guide:"
echo "  • Run integration tests: npm run docker:test"
echo "  • Run unit tests:     npm run test:unit"
echo "  • See documentation:  cat INTEGRATION_TESTS_DOCKER_ONLY.md"