#!/bin/bash

echo "🧪 Running Integration Tests in Docker"
echo "===================================="

# Check if docker is available
if ! command -v docker >/dev/null 2>&1; then
    echo "❌ Docker is not installed or not available in PATH."
    echo "Please install Docker Desktop: https://www.docker.com/products/docker-desktop"
    exit 1
fi

# Simple docker check - try to run docker ps
if ! docker ps >/dev/null 2>&1; then
    echo "❌ Docker daemon is not running."
    echo ""
    echo "💡 To fix this:"
    echo "   Windows/Mac: Start Docker Desktop from Applications"
    echo "   Linux: sudo systemctl start docker"
    echo ""
    echo "⏳ After starting Docker, wait 30 seconds and try again"
    echo ""
    exit 1
fi

echo "✅ Docker is available and running"

# Stop any existing test containers
echo "🧹 Cleaning up existing test containers..."
docker-compose --profile tests down --remove-orphans 2>/dev/null || true

# Build and run tests with output streaming
echo "🔧 Building and starting integration tests..."
echo ""

# Use docker-compose with proper flags for output streaming
docker-compose --profile tests up --build --force-recreate --remove-orphans integration-tests

# Capture exit code
EXIT_CODE=$?

echo ""
if [ $EXIT_CODE -eq 0 ]; then
    echo "🎉 All integration tests passed!"
else
    echo "❌ Integration tests failed with exit code: $EXIT_CODE"
    echo "Check the output above for details"
fi

# Clean up
echo ""
echo "🧹 Cleaning up test containers..."
docker-compose --profile tests down --remove-orphans 2>/dev/null || true

exit $EXIT_CODE