from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session

from config.settings import settings
from data.models import Base

_is_sqlite = settings.database_url.startswith("sqlite")

engine = create_engine(
    settings.database_url,
    connect_args={"check_same_thread": False} if _is_sqlite else {},
    echo=(settings.app_env == "development"),
    pool_pre_ping=True,  # reconecta automáticamente si la conexión se cae
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def init_db() -> None:
    Base.metadata.create_all(bind=engine)


def get_db() -> Session:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
