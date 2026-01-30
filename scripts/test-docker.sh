#!/bin/bash

# Simple Docker test
echo "🐳 Testing Docker Connectivity"
echo "============================"

# Test 1: Docker command available
if command -v docker >/dev/null 2>&1; then
    echo "✅ Docker command found"
else
    echo "❌ Docker not found in PATH"
    exit 1
fi

# Test 2: Docker daemon running
if docker ps >/dev/null 2>&1; then
    echo "✅ Docker daemon is running"
else
    echo "❌ Docker daemon not accessible"
    echo ""
    echo "🔧 Troubleshooting:"
    echo "   • Start Docker Desktop"
    echo "   • Wait 30 seconds for full startup"
    echo "   • Try: docker ps (should show container list)"
    echo ""
    exit 1
fi

# Test 3: Docker Compose available
if command -v docker-compose >/dev/null 2>&1; then
    echo "✅ Docker Compose found"
else
    echo "❌ Docker Compose not found"
    exit 1
fi

echo ""
echo "🎉 Docker environment is ready!"
echo "You can now run: npm run docker:test"