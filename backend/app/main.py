from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from mangum import Mangum

from app.api import router as api_router
from app.core.config import settings
from app.db.session import engine
from app.db import models


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    # Startup: Create tables if they don't exist (for development)
    if settings.ENVIRONMENT == "development":
        models.Base.metadata.create_all(bind=engine)
    yield
    # Shutdown: cleanup if needed


app = FastAPI(
    title=settings.PROJECT_NAME,
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    lifespan=lifespan,
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

# AWS Lambda handler using Mangum
handler = Mangum(app, lifespan="off")


@app.get("/api/health")
def health_check() -> dict[str, str]:
    """Health check endpoint for load balancer and monitoring."""
    return {"status": "healthy", "message": "API is running"}
