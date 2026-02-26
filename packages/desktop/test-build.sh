#!/bin/bash
# Test Build Script for ApiQuest Desktop (Linux/Mac)
# This script helps test the packaging locally before running GitHub Actions

set -e

PLATFORM="current"
PACKAGE_ONLY=false
CLEAN=false

# Colors
CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --platform)
            PLATFORM="$2"
            shift 2
            ;;
        --package)
            PACKAGE_ONLY=true
            shift
            ;;
        --clean)
            CLEAN=true
            shift
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            exit 1
            ;;
    esac
done

echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}ApiQuest Desktop Build Test${NC}"
echo -e "${CYAN}========================================${NC}"
echo ""

# Get script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

# Clean if requested
if [ "$CLEAN" = true ]; then
    echo -e "${YELLOW}Cleaning build artifacts...${NC}"
    rm -rf dist-installer out
    echo -e "${GREEN}Clean complete.${NC}"
    echo ""
fi

# Check Node.js version
echo -e "${YELLOW}Checking Node.js version...${NC}"
NODE_VERSION=$(node --version)
echo -e "${GREEN}Node.js version: $NODE_VERSION${NC}"
echo ""

# Check npm version
echo -e "${YELLOW}Checking npm version...${NC}"
NPM_VERSION=$(npm --version)
echo -e "${GREEN}npm version: $NPM_VERSION${NC}"
echo ""

# Install dependencies
echo -e "${YELLOW}Installing dependencies...${NC}"
npm install
echo -e "${GREEN}Dependencies installed.${NC}"
echo ""

# Build the app
echo -e "${YELLOW}Building application...${NC}"
npm run build
echo -e "${GREEN}Build complete.${NC}"
echo ""

# Package or create installer
if [ "$PACKAGE_ONLY" = true ]; then
    echo -e "${YELLOW}Creating unpacked directory (test packaging)...${NC}"
    npm run package
    echo -e "${GREEN}Test package created in dist-installer/${NC}"
else
    echo -e "${YELLOW}Creating installer for platform: $PLATFORM${NC}"
    
    case "$PLATFORM" in
        win)
            npm run dist:win
            ;;
        mac)
            npm run dist:mac
            ;;
        linux)
            npm run dist:linux
            ;;
        all)
            npm run dist:all
            ;;
        current)
            npm run dist
            ;;
        *)
            echo -e "${RED}Unknown platform: $PLATFORM${NC}"
            exit 1
            ;;
    esac
    
    echo -e "${GREEN}Installer(s) created in dist-installer/${NC}"
fi

echo ""
echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}Build artifacts:${NC}"
echo -e "${CYAN}========================================${NC}"
if [ -d "dist-installer" ]; then
    find dist-installer -type f -exec sh -c 'SIZE=$(du -h "$1" | cut -f1); echo -e "${GREEN}$(basename "$1") - $SIZE${NC}"' _ {} \;
else
    echo -e "${YELLOW}No installers found.${NC}"
fi

echo ""
echo -e "${CYAN}========================================${NC}"
echo -e "${GREEN}Build test complete!${NC}"
echo -e "${CYAN}========================================${NC}"
