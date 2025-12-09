import logging
from collections.abc import Generator
from functools import lru_cache

from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import QueuePool

from app.core.config import settings

logger = logging.getLogger(__name__)


@lru_cache(maxsize=1)
def get_engine() -> Engine:
    """
    SQLAlchemy Engineを取得する。
    Lambda環境に最適化された接続プール設定。
    Secrets Managerからの認証情報取得に対応。
    """
    database_url = settings.get_database_url()

    # Lambda環境かどうかで設定を変更
    # Lambda: 同時実行数制限(20)に対応した小さいプール
    # ローカル: 開発しやすい大きめのプール
    is_lambda = settings.ENVIRONMENT in ("prod", "production", "staging")

    engine = create_engine(
        database_url,
        poolclass=QueuePool,
        # Lambda: 1接続/インスタンス、ローカル: 5接続
        pool_size=1 if is_lambda else 5,
        # Lambda: 急なスパイク対応で+4、ローカル: +10
        max_overflow=4 if is_lambda else 10,
        # 5分で接続リサイクル（RDSのタイムアウト対策）
        pool_recycle=300,
        # 使用前に接続確認（切断された接続を再利用しない）
        pool_pre_ping=True,
        # 接続取得タイムアウト（秒）
        pool_timeout=10,
        # SQLログは無効（本番パフォーマンス向上）
        echo=False,
    )

    # 接続イベントのログ（デバッグ用）
    @event.listens_for(engine, "connect")
    def on_connect(dbapi_connection, connection_record):
        logger.info("Database connection established")

    @event.listens_for(engine, "checkout")
    def on_checkout(dbapi_connection, connection_record, connection_proxy):
        logger.debug("Connection checked out from pool")

    return engine


# 後方互換性のため、engine変数をエクスポート
# main.pyなど既存コードからのインポートに対応
engine = get_engine()


def get_session_local() -> sessionmaker:
    """SessionLocalファクトリを取得"""
    return sessionmaker(autocommit=False, autoflush=False, bind=get_engine())


# 後方互換性のため、SessionLocal変数をエクスポート
SessionLocal = get_session_local()


def get_db() -> Generator[Session, None, None]:
    """Dependency for getting database sessions."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
