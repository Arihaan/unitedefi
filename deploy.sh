#!/bin/bash

# Stellar Fusion+ Extension Deployment Script
# This script helps deploy contracts and set up the development environment

echo "🚀 Stellar Fusion+ Extension Deployment Script"
echo "=============================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if required tools are installed
check_dependencies() {
    print_status "Checking dependencies..."
    
    # Check Node.js
    if ! command -v node &> /dev/null; then
        print_error "Node.js is not installed. Please install Node.js 16 or higher."
        exit 1
    fi
    
    # Check npm
    if ! command -v npm &> /dev/null; then
        print_error "npm is not installed. Please install npm."
        exit 1
    fi
    
    # Check if we're in the right directory
    if [ ! -f "package.json" ]; then
        print_error "package.json not found. Please run this script from the project root."
        exit 1
    fi
    
    print_success "All dependencies are available"
}

# Setup environment
setup_environment() {
    print_status "Setting up environment..."
    
    # Copy environment template if .env.local doesn't exist
    if [ ! -f ".env.local" ]; then
        if [ -f "env.template" ]; then
            cp env.template .env.local
            print_success "Environment template copied to .env.local"
            print_warning "Please edit .env.local with your configuration before continuing"
        else
            print_error "env.template not found"
            exit 1
        fi
    else
        print_warning ".env.local already exists, skipping template copy"
    fi
}

# Install dependencies
install_dependencies() {
    print_status "Installing Node.js dependencies..."
    
    npm install
    if [ $? -eq 0 ]; then
        print_success "Node.js dependencies installed successfully"
    else
        print_error "Failed to install Node.js dependencies"
        exit 1
    fi
    
    # Install Ethereum contract dependencies
    print_status "Installing Ethereum contract dependencies..."
    cd contracts/ethereum
    npm install
    if [ $? -eq 0 ]; then
        print_success "Ethereum contract dependencies installed"
    else
        print_error "Failed to install Ethereum contract dependencies"
        exit 1
    fi
    cd ../..
}

# Setup Stellar contracts
setup_stellar_contracts() {
    print_status "Setting up Stellar contracts..."
    
    # Check if Rust is installed
    if ! command -v cargo &> /dev/null; then
        print_warning "Rust is not installed. Stellar contracts require Rust."
        print_status "Install Rust from: https://rustup.rs/"
        return 1
    fi
    
    # Check if stellar CLI is installed
    if ! command -v stellar &> /dev/null; then
        print_warning "Stellar CLI is not installed."
        print_status "Install from: https://developers.stellar.org/docs/build/smart-contracts/getting-started/setup"
        return 1
    fi
    
    cd contracts/stellar
    
    # Add wasm target if not present
    rustup target add wasm32-unknown-unknown
    
    # Build the contract
    print_status "Building Stellar contract..."
    cargo build --target wasm32-unknown-unknown --release
    
    if [ $? -eq 0 ]; then
        print_success "Stellar contract built successfully"
    else
        print_error "Failed to build Stellar contract"
        cd ../..
        return 1
    fi
    
    cd ../..
}

# Run development server
start_dev_server() {
    print_status "Starting development server..."
    print_warning "Make sure you have configured .env.local with your settings"
    print_status "The app will be available at http://localhost:3000"
    
    npm start
}

# Deploy contracts (placeholder)
deploy_contracts() {
    print_status "Contract deployment is manual for this demo"
    print_status "Please follow these steps:"
    echo ""
    echo "1. Ethereum Contracts (Sepolia):"
    echo "   - Deploy StellarFusionEscrow.sol to Sepolia testnet"
    echo "   - Update REACT_APP_ETHEREUM_ESCROW_ADDRESS in .env.local"
    echo ""
    echo "2. Stellar Contracts (Testnet):"
    echo "   - Deploy the Soroban contract to Stellar testnet"
    echo "   - Update REACT_APP_STELLAR_ESCROW_ADDRESS in .env.local"
    echo ""
    echo "3. USDC Tokens:"
    echo "   - Deploy test USDC contracts on both networks"
    echo "   - Update token addresses in .env.local"
    echo ""
    print_status "See README.md for detailed deployment instructions"
}

# Show help
show_help() {
    echo "Stellar Fusion+ Extension Deployment Script"
    echo ""
    echo "Usage: $0 [OPTION]"
    echo ""
    echo "Options:"
    echo "  setup      Complete setup (dependencies + environment)"
    echo "  deps       Install dependencies only"
    echo "  env        Setup environment only"
    echo "  stellar    Setup Stellar contracts"
    echo "  deploy     Show deployment instructions"
    echo "  start      Start development server"
    echo "  help       Show this help message"
    echo ""
    echo "For first-time setup, run: $0 setup"
}

# Main script logic
case "$1" in
    "setup")
        check_dependencies
        setup_environment
        install_dependencies
        setup_stellar_contracts
        print_success "Setup complete! Edit .env.local and run '$0 start' to begin"
        ;;
    "deps")
        check_dependencies
        install_dependencies
        ;;
    "env")
        setup_environment
        ;;
    "stellar")
        setup_stellar_contracts
        ;;
    "deploy")
        deploy_contracts
        ;;
    "start")
        check_dependencies
        start_dev_server
        ;;
    "help"|"--help"|"-h")
        show_help
        ;;
    "")
        print_status "No option provided. Running complete setup..."
        check_dependencies
        setup_environment
        install_dependencies
        setup_stellar_contracts
        print_success "Setup complete! Edit .env.local and run '$0 start' to begin"
        ;;
    *)
        print_error "Unknown option: $1"
        show_help
        exit 1
        ;;
esac 