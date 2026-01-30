@echo off
set LOCAL_TEST=true
set NODE_ENV=test
set INTEGRATION_TESTS=true
npx jest --testPathPatterns=integration --verbose --detectOpenHandles --forceExit --passWithNoTests