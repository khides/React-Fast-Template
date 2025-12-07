#!/usr/bin/env fish
# Deploy script for React-Fast-Template (Fish shell)
# Usage: ./scripts/deploy.fish [stage]
# Example: ./scripts/deploy.fish dev
#          ./scripts/deploy.fish prod

# Configuration
set -q AWS_PROFILE; or set -gx AWS_PROFILE "react-fast-deploy"
set STAGE $argv[1]
test -z "$STAGE"; and set STAGE "dev"
set SCRIPT_DIR (realpath (dirname (status --current-filename)))
set PROJECT_ROOT (dirname $SCRIPT_DIR)

# Colors
set RED (set_color red)
set GREEN (set_color green)
set YELLOW (set_color yellow)
set BLUE (set_color blue)
set NC (set_color normal)

echo "$BLUE========================================"
echo "  React-Fast-Template Deployment"
echo "========================================$NC"
echo "$YELLOW""Stage:$NC $STAGE"
echo "$YELLOW""AWS Profile:$NC $AWS_PROFILE"
echo ""

# Check AWS credentials
echo "$BLUE""(1/5) Checking AWS credentials...$NC"
if not env AWS_PROFILE=$AWS_PROFILE aws sts get-caller-identity > /dev/null 2>&1
    echo "$RED""Error: AWS credentials not configured for profile '$AWS_PROFILE'$NC"
    echo "Please run: aws configure --profile $AWS_PROFILE"
    exit 1
end
set AWS_ACCOUNT (env AWS_PROFILE=$AWS_PROFILE aws sts get-caller-identity --query Account --output text)
set AWS_REGION (env AWS_PROFILE=$AWS_PROFILE aws configure get region 2>/dev/null; or echo "ap-northeast-1")
echo "$GREEN✓ AWS Account: $AWS_ACCOUNT$NC"
echo "$GREEN✓ AWS Region: $AWS_REGION$NC"
echo ""

# Build frontend
echo "$BLUE""(2/5) Building frontend...$NC"
cd "$PROJECT_ROOT/frontend"
if not test -d "node_modules"
    echo "Installing frontend dependencies..."
    npm install
end
npm run build
echo "$GREEN✓ Frontend build complete$NC"
echo ""

# Install CDK dependencies
echo "$BLUE""(3/5) Installing CDK dependencies...$NC"
cd "$PROJECT_ROOT/infra"
if not test -d "node_modules"
    echo "Installing CDK dependencies..."
    npm install
end
echo "$GREEN✓ CDK dependencies ready$NC"
echo ""

# Bootstrap CDK (if needed)
echo "$BLUE""(4/5) Checking CDK bootstrap...$NC"
if not env AWS_PROFILE=$AWS_PROFILE aws cloudformation describe-stacks --stack-name CDKToolkit > /dev/null 2>&1
    echo "Bootstrapping CDK..."
    env AWS_PROFILE=$AWS_PROFILE npx cdk bootstrap
end
echo "$GREEN✓ CDK bootstrapped$NC"
echo ""

# Deploy all stacks
echo "$BLUE""(5/5) Deploying stacks...$NC"
env AWS_PROFILE=$AWS_PROFILE npx cdk deploy --all \
    --require-approval never \
    --context stage=$STAGE \
    --outputs-file "$PROJECT_ROOT/cdk-outputs-$STAGE.json"

echo ""
echo "$GREEN========================================"
echo "  Deployment Complete!"
echo "========================================$NC"

# Show outputs
if test -f "$PROJECT_ROOT/cdk-outputs-$STAGE.json"
    echo ""
    echo "$BLUE""Deployed Resources:$NC"
    cat "$PROJECT_ROOT/cdk-outputs-$STAGE.json" | grep -E "(CloudFrontUrl|LambdaFunctionUrl|DatabaseEndpoint)" | sed 's/[",]//g' | sed 's/^[ ]*/  /'
end

echo ""
echo "$YELLOW""To destroy all resources:$NC"
echo "  AWS_PROFILE=$AWS_PROFILE npx cdk destroy --all"
