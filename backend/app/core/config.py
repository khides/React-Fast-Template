import json
from functools import lru_cache

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    PROJECT_NAME: str = "React-Fast-Template API"
    ENVIRONMENT: str = "development"
    API_V1_STR: str = "/api/v1"

    # Database - ローカル開発用のデフォルト値
    DATABASE_URL: str = "postgresql://postgres:postgres@localhost:5433/app"

    # AWS Lambda環境でのSecrets Manager連携用
    DATABASE_SECRET_ARN: str | None = None
    DATABASE_HOST: str | None = None
    DATABASE_NAME: str = "app"

    # CORS
    CORS_ORIGINS: list[str] = [
        "http://localhost:3001",
        "http://localhost:5173",
    ]

    # AWS (for Lambda)
    AWS_REGION: str = "ap-northeast-1"

    class Config:
        env_file = ".env"
        case_sensitive = True

    def get_database_url(self) -> str:
        """
        DATABASE_URLを取得する。
        AWS Lambda環境ではSecrets Managerから認証情報を取得し、
        ローカル環境ではDATABASE_URL環境変数を使用する。
        """
        if self.DATABASE_SECRET_ARN and self.DATABASE_HOST:
            return _get_database_url_from_secrets_manager(
                self.DATABASE_SECRET_ARN,
                self.DATABASE_HOST,
                self.DATABASE_NAME,
                self.AWS_REGION,
            )
        return self.DATABASE_URL


@lru_cache(maxsize=1)
def _get_database_url_from_secrets_manager(
    secret_arn: str,
    host: str,
    database_name: str,
    region: str,
) -> str:
    """Secrets Managerから認証情報を取得してDATABASE_URLを構築"""
    import boto3

    client = boto3.client("secretsmanager", region_name=region)
    response = client.get_secret_value(SecretId=secret_arn)
    secret = json.loads(response["SecretString"])

    return (
        f"postgresql://{secret['username']}:{secret['password']}"
        f"@{host}:5432/{database_name}"
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
