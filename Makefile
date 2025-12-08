.PHONY: help install dev build test lint clean docker-up docker-down deploy venv \
        deploy-dev deploy-prod deploy-all destroy backend-dev frontend-dev db-up \
        docker-logs cdk-synth cdk-diff cdk-bootstrap build-frontend check-aws

# Configuration
AWS_PROFILE ?= react-fast-deploy
STAGE ?= dev

# Default target
help:
	@echo "React + FastAPI + PostgreSQL + AWS CDK"
	@echo ""
	@echo "=== Local Development ==="
	@echo "  make install       - Install all dependencies"
	@echo "  make venv          - Create Python virtual environment"
	@echo "  make dev           - Start full local dev environment (DB + Backend + Frontend)"
	@echo "  make backend-dev   - Start only FastAPI backend"
	@echo "  make frontend-dev  - Start only React frontend"
	@echo "  make db-up         - Start only PostgreSQL database"
	@echo "  make docker-up     - Start all Docker containers"
	@echo "  make docker-down   - Stop Docker containers"
	@echo "  make docker-logs   - Show Docker logs"
	@echo ""
	@echo "=== Build & Test ==="
	@echo "  make build         - Build frontend and backend"
	@echo "  make build-frontend - Build frontend only"
	@echo "  make test          - Run tests"
	@echo "  make lint          - Run linters"
	@echo ""
	@echo "=== AWS Deployment ==="
	@echo "  make check-aws     - Verify AWS credentials"
	@echo "  make deploy        - Deploy to AWS (STAGE=dev)"
	@echo "  make deploy-dev    - Deploy to dev environment"
	@echo "  make deploy-prod   - Deploy to prod environment"
	@echo "  make deploy-all    - Deploy all stacks"
	@echo "  make destroy       - Destroy all AWS resources"
	@echo ""
	@echo "=== CDK Operations ==="
	@echo "  make cdk-synth     - Synthesize CDK stacks"
	@echo "  make cdk-diff      - Show CDK diff"
	@echo "  make cdk-bootstrap - Bootstrap CDK"
	@echo ""
	@echo "=== Cleanup ==="
	@echo "  make clean         - Clean build artifacts"
	@echo ""
	@echo "=== Configuration ==="
	@echo "  AWS_PROFILE=$(AWS_PROFILE)  STAGE=$(STAGE)"
	@echo "  Override: make deploy AWS_PROFILE=myprofile STAGE=prod"

# Create Python virtual environment
venv:
	cd backend && python3 -m venv .venv
	@echo "Virtual environment created at backend/.venv"
	@echo "Run: source backend/.venv/bin/activate"

# Install dependencies
install:
	cd frontend && npm install
	cd backend && ( \
		if [ ! -d ".venv" ]; then python3 -m venv .venv; fi && \
		. .venv/bin/activate && \
		pip install -e ".[dev]" \
	)
	cd infra && npm install

# =============================================================================
# Local Development
# =============================================================================

# Start full local development environment
dev:
	@echo "Starting local development environment..."
	docker compose up -d db
	@echo "Waiting for database..."
	@sleep 3
	@echo "Starting backend and frontend..."
	@trap 'kill 0' EXIT; \
	(cd backend && . .venv/bin/activate && DATABASE_URL=postgresql://postgres:postgres@localhost:5433/app uvicorn app.main:app --reload --port 8001) & \
	(cd frontend && npm run dev -- --port 3001) & \
	wait

# Start only FastAPI backend
backend-dev:
	docker compose up -d db
	@echo "Waiting for database..."
	@sleep 2
	cd backend && . .venv/bin/activate && DATABASE_URL=postgresql://postgres:postgres@localhost:5433/app uvicorn app.main:app --reload --port 8001

# Start only React frontend
frontend-dev:
	cd frontend && npm run dev -- --port 3001

# Start only PostgreSQL database
db-up:
	docker compose up -d db
	@echo "PostgreSQL is running on localhost:5433"
	@echo "Connection: postgresql://postgres:postgres@localhost:5433/app"

# Docker operations
docker-up:
	docker compose up -d
	@echo "All containers started:"
	@echo "  - Database:  localhost:5433"
	@echo "  - Backend:   localhost:8001"
	@echo "  - Frontend:  localhost:3001"

docker-down:
	docker compose down

docker-logs:
	docker compose logs -f

# =============================================================================
# Build & Test
# =============================================================================

build:
	cd frontend && npm run build
	cd backend && . .venv/bin/activate && pip install -e .

build-frontend:
	cd frontend && npm run build

test:
	cd backend && . .venv/bin/activate && pytest
	cd frontend && npm test 2>/dev/null || echo "No frontend tests configured"

lint:
	cd backend && . .venv/bin/activate && ruff check . && mypy app
	cd frontend && npm run lint

# =============================================================================
# AWS Deployment
# =============================================================================

# Check AWS credentials
# If AWS_PROFILE is "none", use IAM role (no profile)
check-aws:
	@if [ "$(AWS_PROFILE)" = "none" ]; then \
		echo "Checking AWS credentials (using IAM role)..."; \
		unset AWS_PROFILE; \
		aws sts get-caller-identity || \
			(echo "Error: AWS credentials not configured. Attach IAM role to EC2 or run: aws configure" && exit 1); \
		echo ""; \
		echo "AWS Account: $$(aws sts get-caller-identity --query Account --output text)"; \
		echo "AWS Region:  $$(aws configure get region 2>/dev/null || echo 'ap-northeast-1')"; \
	else \
		echo "Checking AWS credentials for profile: $(AWS_PROFILE)"; \
		AWS_PROFILE=$(AWS_PROFILE) aws sts get-caller-identity || \
			(echo "Error: AWS credentials not configured. Run: aws configure --profile $(AWS_PROFILE)" && exit 1); \
		echo ""; \
		echo "AWS Account: $$(AWS_PROFILE=$(AWS_PROFILE) aws sts get-caller-identity --query Account --output text)"; \
		echo "AWS Region:  $$(AWS_PROFILE=$(AWS_PROFILE) aws configure get region 2>/dev/null || echo 'ap-northeast-1')"; \
	fi

# Deploy to AWS (default: dev stage)
# Use AWS_PROFILE=none for IAM role (EC2)
deploy: check-aws build-frontend
	@echo "Deploying to AWS (stage: $(STAGE))..."
	@if [ "$(AWS_PROFILE)" = "none" ]; then \
		cd infra && unset AWS_PROFILE && npx cdk deploy --all \
			--require-approval never \
			--context stage=$(STAGE) \
			--outputs-file ../cdk-outputs-$(STAGE).json; \
	else \
		cd infra && AWS_PROFILE=$(AWS_PROFILE) npx cdk deploy --all \
			--require-approval never \
			--context stage=$(STAGE) \
			--outputs-file ../cdk-outputs-$(STAGE).json; \
	fi
	@echo ""
	@echo "Deployment complete! Outputs saved to cdk-outputs-$(STAGE).json"
	@if [ -f cdk-outputs-$(STAGE).json ]; then \
		echo ""; \
		echo "Deployed Resources:"; \
		grep -E "(CloudFrontUrl|LambdaFunctionUrl|DatabaseEndpoint)" cdk-outputs-$(STAGE).json | sed 's/[",]//g' | sed 's/^[ ]*/  /'; \
	fi

# Deploy to dev environment
deploy-dev: STAGE=dev
deploy-dev: deploy

# Deploy to prod environment
deploy-prod: STAGE=prod
deploy-prod: deploy

# Deploy all stacks (alias for deploy)
deploy-all: deploy

# Deploy only frontend stack
deploy-frontend: check-aws build-frontend
	cd infra && AWS_PROFILE=$(AWS_PROFILE) npx cdk deploy react-fast-app-$(STAGE)-frontend \
		--require-approval never \
		--context stage=$(STAGE)

# Deploy only backend stack
deploy-backend: check-aws
	cd infra && AWS_PROFILE=$(AWS_PROFILE) npx cdk deploy react-fast-app-$(STAGE)-backend \
		--require-approval never \
		--context stage=$(STAGE)

# Destroy all AWS resources
destroy:
	@echo "WARNING: This will destroy all AWS resources for stage: $(STAGE)"
	@read -p "Are you sure? [y/N] " confirm && [ "$$confirm" = "y" ] || exit 1
	cd infra && AWS_PROFILE=$(AWS_PROFILE) npx cdk destroy --all --context stage=$(STAGE)

# =============================================================================
# CDK Operations
# =============================================================================

cdk-synth:
	cd infra && AWS_PROFILE=$(AWS_PROFILE) npx cdk synth --context stage=$(STAGE)

cdk-diff:
	cd infra && AWS_PROFILE=$(AWS_PROFILE) npx cdk diff --context stage=$(STAGE)

cdk-bootstrap:
	cd infra && AWS_PROFILE=$(AWS_PROFILE) npx cdk bootstrap

# =============================================================================
# Cleanup
# =============================================================================

clean:
	rm -rf frontend/dist
	rm -rf frontend/node_modules
	rm -rf backend/__pycache__
	rm -rf backend/*.egg-info
	rm -rf backend/.venv
	rm -rf infra/node_modules
	rm -rf infra/cdk.out
	rm -f cdk-outputs-*.json
	find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
	find . -type f -name "*.pyc" -delete 2>/dev/null || true
	@echo "Cleaned all build artifacts"

# Clean only Docker volumes
clean-docker:
	docker compose down -v
	@echo "Docker volumes removed"
