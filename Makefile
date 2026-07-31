.PHONY: dev db-up db-down db-migrate ai-dev test clean install

# Start everything
dev: db-up
	@echo "Starting all services..."
	pnpm dev & cd apps/ai-service && uv run uvicorn src.main:app --reload --port 8001

# Infrastructure
db-up:
	docker compose up -d postgres redis minio minio-init

db-down:
	docker compose down

db-migrate:
	pnpm --filter @dictator/api drizzle-kit push

db-generate:
	pnpm --filter @dictator/api drizzle-kit generate

db-studio:
	pnpm --filter @dictator/api drizzle-kit studio

# Individual services
api-dev:
	pnpm --filter @dictator/api dev

web-dev:
	pnpm --filter @dictator/web dev

ai-dev:
	cd apps/ai-service && uv run uvicorn src.main:app --reload --port 8001

# Testing
test:
	pnpm test
	cd apps/ai-service && uv run pytest

test-api:
	pnpm --filter @dictator/api test

test-ai:
	cd apps/ai-service && uv run pytest

# Setup
install:
	pnpm install
	cd apps/ai-service && uv sync

clean:
	rm -rf node_modules apps/*/node_modules packages/*/node_modules
	rm -rf apps/*/.turbo packages/*/.turbo .turbo
	rm -rf apps/*/dist packages/*/dist
	rm -rf apps/ai-service/.venv
