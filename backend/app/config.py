from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    PROJECT_NAME: str = "Resilience-Alpha Payment Gateway"
    VERSION: str = "1.0.0"
    ENVIRONMENT: str = "production"
    
    # Configuration PostgreSQL
    POSTGRES_USER: str = "resilience_user"
    POSTGRES_PASSWORD: str = "resilience_pass"
    POSTGRES_HOST: str = "postgres"
    POSTGRES_PORT: int = 5432
    POSTGRES_DB: str = "resilience_db"

    @property
    def async_database_url(self) -> str:
        return f"postgresql+asyncpg://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}@{self.POSTGRES_HOST}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"

    # Dégradation simulée / injection de pannes (pour tests Red Team et chaos engineering)
    CHAOS_MODE_ENABLED: bool = False
    MOCK_LATENCY_MS: int = 25

    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()
