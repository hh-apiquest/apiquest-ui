# Test Build Script for ApiQuest Desktop
# This script helps test the packaging locally before running GitHub Actions

param(
    [Parameter(Mandatory=$false)]
    [ValidateSet('win', 'mac', 'linux', 'current', 'all')]
    [string]$Platform = 'current',
    
    [Parameter(Mandatory=$false)]
    [switch]$Package,
    
    [Parameter(Mandatory=$false)]
    [switch]$Clean
)

$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "ApiQuest Desktop Build Test" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Get script directory
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ScriptDir

# Clean if requested
if ($Clean) {
    Write-Host "Cleaning build artifacts..." -ForegroundColor Yellow
    if (Test-Path "dist-installer") {
        Remove-Item -Recurse -Force dist-installer
    }
    if (Test-Path "out") {
        Remove-Item -Recurse -Force out
    }
    Write-Host "Clean complete." -ForegroundColor Green
    Write-Host ""
}

# Check Node.js version
Write-Host "Checking Node.js version..." -ForegroundColor Yellow
$nodeVersion = node --version
Write-Host "Node.js version: $nodeVersion" -ForegroundColor Green
Write-Host ""

# Check npm version
Write-Host "Checking npm version..." -ForegroundColor Yellow
$npmVersion = npm --version
Write-Host "npm version: $npmVersion" -ForegroundColor Green
Write-Host ""

# Install dependencies
Write-Host "Installing dependencies..." -ForegroundColor Yellow
npm install
if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to install dependencies!" -ForegroundColor Red
    exit 1
}
Write-Host "Dependencies installed." -ForegroundColor Green
Write-Host ""

# Build the app
Write-Host "Building application..." -ForegroundColor Yellow
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "Build failed!" -ForegroundColor Red
    exit 1
}
Write-Host "Build complete." -ForegroundColor Green
Write-Host ""

# Package or create installer
if ($Package) {
    Write-Host "Creating unpacked directory (test packaging)..." -ForegroundColor Yellow
    npm run package
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Packaging failed!" -ForegroundColor Red
        exit 1
    }
    Write-Host "Test package created in dist-installer/" -ForegroundColor Green
} else {
    Write-Host "Creating installer for platform: $Platform" -ForegroundColor Yellow
    
    switch ($Platform) {
        'win' {
            npm run dist:win
        }
        'mac' {
            npm run dist:mac
        }
        'linux' {
            npm run dist:linux
        }
        'all' {
            npm run dist:all
        }
        'current' {
            npm run dist
        }
    }
    
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Creating installer failed!" -ForegroundColor Red
        exit 1
    }
    Write-Host "Installer(s) created in dist-installer/" -ForegroundColor Green
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Build artifacts:" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
if (Test-Path "dist-installer") {
    Get-ChildItem -Path dist-installer -Recurse | Where-Object { -not $_.PSIsContainer } | ForEach-Object {
        $size = "{0:N2} MB" -f ($_.Length / 1MB)
        Write-Host "$($_.Name) - $size" -ForegroundColor Green
    }
} else {
    Write-Host "No installers found." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Build test complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
