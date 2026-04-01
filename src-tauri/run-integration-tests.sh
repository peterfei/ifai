#!/bin/bash
# Integration Test Runner
# ========================
#
# This script runs integration tests for the harness system.
# It checks for required API keys and runs tests accordingly.

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored messages
print_info() {
    echo -e "${YELLOW}ℹ️  $1${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Check if .env file exists
if [ ! -f .env ]; then
    print_error ".env file not found!"
    echo ""
    print_info "Please create a .env file from .env.example:"
    echo "  cp .env.example .env"
    echo "  # Then edit .env with your API keys"
    echo ""
    exit 1
fi

# Load environment variables
print_info "Loading environment variables from .env..."
set -a
source .env
set +a

# Check which API keys are available
HAS_ANTHROPIC=false
HAS_OPENAI=false
HAS_DEEPSEEK=false

if [ -n "$ANTHROPIC_API_KEY" ] && [ "$ANTHROPIC_API_KEY" != "your_anthropic_api_key_here" ]; then
    HAS_ANTHROPIC=true
    print_success "Anthropic API Key found"
else
    print_info "Anthropic API Key not set (skipping Anthropic tests)"
fi

if [ -n "$OPENAI_API_KEY" ] && [ "$OPENAI_API_KEY" != "your_openai_api_key_here" ]; then
    HAS_OPENAI=true
    print_success "OpenAI API Key found"
else
    print_info "OpenAI API Key not set (skipping OpenAI tests)"
fi

if [ -n "$DEEPSEEK_API_KEY" ] && [ "$DEEPSEEK_API_KEY" != "your_deepseek_api_key_here" ]; then
    HAS_DEEPSEEK=true
    print_success "DeepSeek API Key found"
else
    print_info "DeepSeek API Key not set (skipping DeepSeek tests)"
fi

echo ""

# Run tests based on available API keys
print_info "Running integration tests..."
echo ""

# Run tool system integration tests (no API keys required)
print_info "Testing tool system..."
cargo test harness::tool::integration_tests --lib || {
    print_error "Tool system tests failed"
    exit 1
}
print_success "Tool system tests passed"
echo ""

# Run API integration tests if API keys are available
if [ "$HAS_ANTHROPIC" = true ] || [ "$HAS_OPENAI" = true ] || [ "$HAS_DEEPSEEK" = true ]; then
    print_info "Testing API providers..."

    if [ "$HAS_ANTHROPIC" = true ]; then
        print_info "Testing Anthropic..."
        cargo test harness::api::integration_tests::test_anthropic_stream --lib --ignored || {
            print_error "Anthropic test failed"
            exit 1
        }
        print_success "Anthropic test passed"
    fi

    if [ "$HAS_OPENAI" = true ]; then
        print_info "Testing OpenAI..."
        cargo test harness::api::integration_tests::test_openai_stream --lib --ignored || {
            print_error "OpenAI test failed"
            exit 1
        }
        print_success "OpenAI test passed"
    fi

    if [ "$HAS_DEEPSEEK" = true ]; then
        print_info "Testing DeepSeek..."
        cargo test harness::api::integration_tests::test_deepseek_stream --lib --ignored || {
            print_error "DeepSeek test failed"
            exit 1
        }
        print_success "DeepSeek test passed"
    fi

    echo ""
    print_success "All available API integration tests passed!"
else
    print_info "No API keys configured, skipping API integration tests"
    echo ""
    print_info "To run API integration tests, add API keys to .env file"
fi

echo ""
print_success "Integration test suite complete!"
