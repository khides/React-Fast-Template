#!/bin/bash
# Deploy script for React-Fast-Template
# Usage: ./scripts/deploy.sh [stage]
# Example: ./scripts/deploy.sh dev
#          ./scripts/deploy.sh prod

set -e

# Configuration
AWS_PROFILE="${AWS_PROFILE:-react-fast-deploy}"
STAGE="${1:-dev}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  React-Fast-Template Deployment${NC}"
echo -e "${BLUE}========================================${NC}"
echo -e "${YELLOW}Stage:${NC} $STAGE"
echo -e "${YELLOW}AWS Profile:${NC} $AWS_PROFILE"
echo ""

# Check AWS credentials
echo -e "${BLUE}[1/5] Checking AWS credentials...${NC}"
if ! AWS_PROFILE="$AWS_PROFILE" aws sts get-caller-identity > /dev/null 2>&1; then
    echo -e "${RED}Error: AWS credentials not configured for profile '$AWS_PROFILE'${NC}"
    echo "Please run: aws configure --profile $AWS_PROFILE"
    exit 1
fi
AWS_ACCOUNT=$(AWS_PROFILE="$AWS_PROFILE" aws sts get-caller-identity --query Account --output text)
AWS_REGION=$(AWS_PROFILE="$AWS_PROFILE" aws configure get region || echo "ap-northeast-1")
echo -e "${GREEN}✓ AWS Account: $AWS_ACCOUNT${NC}"
echo -e "${GREEN}✓ AWS Region: $AWS_REGION${NC}"
echo ""

# Build frontend
echo -e "${BLUE}[2/5] Building frontend...${NC}"
cd "$PROJECT_ROOT/frontend"
if [ ! -d "node_modules" ]; then
    echo "Installing frontend dependencies..."
    npm install
fi
npm run build
echo -e "${GREEN}✓ Frontend build complete${NC}"
echo ""

# Install CDK dependencies
echo -e "${BLUE}[3/5] Installing CDK dependencies...${NC}"
cd "$PROJECT_ROOT/infra"
if [ ! -d "node_modules" ]; then
    echo "Installing CDK dependencies..."
    npm install
fi
echo -e "${GREEN}✓ CDK dependencies ready${NC}"
echo ""

# Bootstrap CDK (if needed)
echo -e "${BLUE}[4/5] Checking CDK bootstrap...${NC}"
if ! AWS_PROFILE="$AWS_PROFILE" aws cloudformation describe-stacks --stack-name CDKToolkit > /dev/null 2>&1; then
    echo "Bootstrapping CDK..."
    AWS_PROFILE="$AWS_PROFILE" npx cdk bootstrap
fi
echo -e "${GREEN}✓ CDK bootstrapped${NC}"
echo ""

# Deploy all stacks
echo -e "${BLUE}[5/5] Deploying stacks...${NC}"
AWS_PROFILE="$AWS_PROFILE" npx cdk deploy --all \
    --require-approval never \
    --context stage="$STAGE" \
    --outputs-file "../cdk-outputs-${STAGE}.json"

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Deployment Complete!${NC}"
echo -e "${GREEN}========================================${NC}"

# Show outputs
if [ -f "$PROJECT_ROOT/cdk-outputs-${STAGE}.json" ]; then
    echo ""
    echo -e "${BLUE}Deployed Resources:${NC}"
    cat "$PROJECT_ROOT/cdk-outputs-${STAGE}.json" | grep -E "(CloudFrontUrl|LambdaFunctionUrl|DatabaseEndpoint)" | sed 's/[",]//g' | sed 's/^[ ]*/  /'
fi

echo ""
echo -e "${YELLOW}To destroy all resources:${NC}"
echo "  AWS_PROFILE=$AWS_PROFILE npx cdk destroy --all"
