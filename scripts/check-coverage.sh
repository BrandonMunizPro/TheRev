#!/bin/bash

# Check current coverage status
echo "🧪 Coverage Status Check"
echo "===================="

echo ""
echo "Running unit tests with coverage..."
echo ""

# Run unit tests with coverage
npm run test:coverage

echo ""
echo "📊 Coverage Report Generated:"
echo "   View detailed report: open coverage/lcov-report/index.html"
echo "   Summary in: coverage/coverage-summary.json"