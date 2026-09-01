import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./studybuddy.db")

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False},  # SQLite specific
    echo=False,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    """Dependency to get a database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """Create all database tables and run migrations."""
    from models import Deck, Flashcard, ReviewHistory  # noqa: F401
    Base.metadata.create_all(bind=engine)

    # Auto-migrate: add missing columns to existing tables
    import sqlite3
    if "sqlite" in str(engine.url):
        conn = engine.raw_connection()
        try:
            cursor = conn.cursor()
            cursor.execute("PRAGMA table_info(flashcards)")
            existing_cols = {row[1] for row in cursor.fetchall()}

            migrations = [
                ("question_image", "ALTER TABLE flashcards ADD COLUMN question_image TEXT"),
                ("answer_image", "ALTER TABLE flashcards ADD COLUMN answer_image TEXT"),
                ("image_mime", 'ALTER TABLE flashcards ADD COLUMN image_mime TEXT DEFAULT "image/png"'),
                ("image_page", "ALTER TABLE flashcards ADD COLUMN image_page INTEGER"),
            ]
            for col, sql in migrations:
                if col not in existing_cols:
                    cursor.execute(sql)
                    print(f"[db] Added column: {col}")
            conn.commit()
        finally:
            conn.close()
