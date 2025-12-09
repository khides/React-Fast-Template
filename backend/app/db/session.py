from collections.abc import Generator
from functools import lru_cache

from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import settings


@lru_cache(maxsize=1)
def get_engine() -> Engine:
    """
    SQLAlchemy Engineを取得する。
    Secrets Managerからの認証情報取得に対応。
    """
    database_url = settings.get_database_url()
    return create_engine(
        database_url,
        pool_pre_ping=True,
        pool_recycle=300,
        pool_size=5,
        max_overflow=10,
    )


def get_session_local() -> sessionmaker:
    """SessionLocalファクトリを取得"""
    return sessionmaker(autocommit=False, autoflush=False, bind=get_engine())


def get_db() -> Generator[Session, None, None]:
    """Dependency for getting database sessions."""
    SessionLocal = get_session_local()
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
