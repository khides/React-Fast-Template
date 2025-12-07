from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from mangum import Mangum
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.api import router as api_router
from app.core.config import settings
from app.db.session import engine, get_db
from app.db import models


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    # Startup: Create tables if they don't exist
    # Allow in development, dev, and staging environments
    if settings.ENVIRONMENT in ("development", "dev", "staging"):
        models.Base.metadata.create_all(bind=engine)
    yield
    # Shutdown: cleanup if needed


def _ensure_tables() -> None:
    """Ensure database tables exist (for Lambda cold start)."""
    if settings.ENVIRONMENT in ("development", "dev", "staging"):
        models.Base.metadata.create_all(bind=engine)


app = FastAPI(
    title=settings.PROJECT_NAME,
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    lifespan=lifespan,
    # Disable trailing slash redirects for CloudFront/Lambda compatibility
    redirect_slashes=False,
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API router
app.include_router(api_router, prefix=settings.API_V1_STR)

# Ensure tables exist on module load (for Lambda cold start)
# This is necessary because Mangum uses lifespan="off"
_ensure_tables()

# AWS Lambda handler using Mangum
handler = Mangum(app, lifespan="off")


@app.get("/api/health")
def health_check() -> dict[str, str]:
    """Health check endpoint for load balancer and monitoring."""
    return {"status": "healthy", "message": "API is running"}


@app.get("/api/health/db")
def db_health_check(db: Session = Depends(get_db)) -> dict[str, str | int | None]:
    """Database connection health check."""
    try:
        # Test database connection
        result = db.execute(text("SELECT 1"))
        result.fetchone()

        # Get database version
        version_result = db.execute(text("SELECT version()"))
        db_version = version_result.fetchone()

        # Count items in the database
        count_result = db.execute(text("SELECT COUNT(*) FROM items"))
        item_count = count_result.fetchone()

        return {
            "status": "healthy",
            "message": "Database connection successful",
            "database_version": db_version[0] if db_version else None,
            "item_count": item_count[0] if item_count else 0,
        }
    except Exception as e:
        return {
            "status": "unhealthy",
            "message": f"Database connection failed: {str(e)}",
            "database_version": None,
            "item_count": None,
        }


@app.get("/api/health/full")
def full_health_check(db: Session = Depends(get_db)) -> dict:
    """Full system health check including all components."""
    health_status = {
        "api": {"status": "healthy", "message": "API is running"},
        "database": {"status": "unknown", "message": "Not checked"},
    }

    # Check database
    try:
        db.execute(text("SELECT 1"))
        health_status["database"] = {
            "status": "healthy",
            "message": "Connected",
        }
    except Exception as e:
        health_status["database"] = {
            "status": "unhealthy",
            "message": str(e),
        }

    # Overall status
    all_healthy = all(
        component["status"] == "healthy"
        for component in health_status.values()
    )

    return {
        "status": "healthy" if all_healthy else "unhealthy",
        "components": health_status,
        "environment": settings.ENVIRONMENT,
    }
