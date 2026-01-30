# PowerShell script for running Docker integration tests
Write-Host "[TEST] Running Integration Tests in Docker" -ForegroundColor Cyan
Write-Host "====================================" -ForegroundColor Cyan

# Check if docker is available
try {
    $null = Get-Command docker -ErrorAction Stop
} catch {
    Write-Host "[ERROR] Docker is not installed or not available in PATH." -ForegroundColor Red
    Write-Host "Please install Docker Desktop: https://www.docker.com/products/docker-desktop" -ForegroundColor Yellow
    exit 1
}

# Simple docker check - try to run docker ps
try {
    $null = docker ps 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "Docker daemon not running"
    }
} catch {
    Write-Host "[ERROR] Docker daemon is not running." -ForegroundColor Red
    Write-Host ""
    Write-Host "[INFO] To fix this:" -ForegroundColor Yellow
    Write-Host "   Windows/Mac: Start Docker Desktop from Applications" -ForegroundColor White
    Write-Host "   Linux: sudo systemctl start docker" -ForegroundColor White
    Write-Host ""
    Write-Host "[INFO] After starting Docker, wait 30 seconds and try again" -ForegroundColor Yellow
    Write-Host ""
    exit 1
}

Write-Host "[SUCCESS] Docker is available and running" -ForegroundColor Green

# Stop any existing test containers
Write-Host "[CLEANUP] Cleaning up existing test containers..." -ForegroundColor Yellow
try {
    docker-compose --profile tests down --remove-orphans 2>$null
} catch {
    # Ignore errors during cleanup
}

# Build and run tests with output streaming
Write-Host "[BUILD] Building and starting integration tests..." -ForegroundColor Yellow
Write-Host ""

# Use docker-compose with proper flags for output streaming
docker-compose --profile tests up --build --force-recreate --remove-orphans integration-tests

# Capture exit code
$EXIT_CODE = $LASTEXITCODE

Write-Host ""
if ($EXIT_CODE -eq 0) {
    Write-Host "[SUCCESS] All integration tests passed!" -ForegroundColor Green
} else {
    Write-Host "[ERROR] Integration tests failed with exit code: $EXIT_CODE" -ForegroundColor Red
    Write-Host "Check the output above for details" -ForegroundColor Yellow
}

# Clean up
Write-Host ""
Write-Host "[CLEANUP] Cleaning up test containers..." -ForegroundColor Yellow
try {
    docker-compose --profile tests down --remove-orphans 2>$null
} catch {
    # Ignore errors during cleanup
}

exit $EXIT_CODE