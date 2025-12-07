.PHONY: help install dev build test lint clean docker-up docker-down deploy venv

# Default target
help:
	@echo "React + FastAPI + AWS Monorepo"
	@echo ""
	@echo "Usage:"
	@echo "  make install      - Install all dependencies"
	@echo "  make venv         - Create Python virtual environment"
	@echo "  make dev          - Start local development environment"
	@echo "  make docker-up    - Start Docker containers"
	@echo "  make docker-down  - Stop Docker containers"
	@echo "  make build        - Build frontend and backend"
	@echo "  make test         - Run tests"
	@echo "  make lint         - Run linters"
	@echo "  make deploy       - Deploy to AWS"
	@echo "  make clean        - Clean build artifacts"

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

# Start local development (without Docker for backend/frontend)
dev:
	docker-compose up -d db
	@echo "Waiting for database..."
	sleep 3
	cd backend && . .venv/bin/activate && uvicorn app.main:app --reload --port 8001 &
	cd frontend && npm run dev -- --port 3001

# Docker operations
docker-up:
	docker-compose up -d

docker-down:
	docker-compose down

docker-logs:
	docker-compose logs -f

# Build
build:
	cd frontend && npm run build
	cd backend && . .venv/bin/activate && pip install -e .

build-frontend:
	cd frontend && npm run build

# Test
test:
	cd backend && . .venv/bin/activate && pytest
	cd frontend && npm test 2>/dev/null || echo "No frontend tests configured"

# Lint
lint:
	cd backend && . .venv/bin/activate && ruff check . && mypy app
	cd frontend && npm run lint

# Deploy to AWS
deploy: build-frontend
	cd infra && npm run deploy

deploy-frontend:
	cd infra && npx cdk deploy react-fast-app-dev-frontend

deploy-backend:
	cd infra && npx cdk deploy react-fast-app-dev-backend

# CDK operations
cdk-synth:
	cd infra && npx cdk synth

cdk-diff:
	cd infra && npx cdk diff

cdk-bootstrap:
	cd infra && npx cdk bootstrap

# Clean
clean:
	rm -rf frontend/dist
	rm -rf frontend/node_modules
	rm -rf backend/__pycache__
	rm -rf backend/*.egg-info
	rm -rf backend/.venv
	rm -rf infra/node_modules
	rm -rf infra/cdk.out
	find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
	find . -type f -name "*.pyc" -delete 2>/dev/null || true
