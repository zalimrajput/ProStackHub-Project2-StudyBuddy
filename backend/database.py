import os
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker, declarative_base
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./studybuddy.db")

# Determine if we're using PostgreSQL or SQLite
is_postgres = DATABASE_URL.startswith("postgresql")

engine = create_engine(
    DATABASE_URL,
    # SQLite-specific args only when using SQLite
    **({"connect_args": {"check_same_thread": False}} if not is_postgres else {}),
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
    from models import User, Deck, Flashcard, ReviewHistory  # noqa: F401
    Base.metadata.create_all(bind=engine)

    if is_postgres:
        # PostgreSQL: use ALTER TABLE IF NOT EXISTS for safe migrations
        migrations = [
            ("flashcards", "question_image", 'ALTER TABLE flashcards ADD COLUMN IF NOT EXISTS question_image TEXT'),
            ("flashcards", "answer_image", 'ALTER TABLE flashcards ADD COLUMN IF NOT EXISTS answer_image TEXT'),
            ("flashcards", "image_mime", "ALTER TABLE flashcards ADD COLUMN IF NOT EXISTS image_mime TEXT DEFAULT 'image/png'"),
            ("flashcards", "image_page", 'ALTER TABLE flashcards ADD COLUMN IF NOT EXISTS image_page INTEGER'),
            ("decks", "user_id", 'ALTER TABLE decks ADD COLUMN IF NOT EXISTS user_id INTEGER'),
        ]
        with engine.connect() as conn:
            for table, col, sql in migrations:
                try:
                    conn.execute(text(sql))
                    conn.commit()
                    print(f"[db] Ensured column {col} on {table}")
                except Exception as e:
                    # Column already exists or other error — skip
                    pass
    else:
        # SQLite: use PRAGMA for migrations
        import sqlite3
        conn = engine.raw_connection()
        try:
            cursor = conn.cursor()

            # Flashcard migrations
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

            # Deck user_id migration
            cursor.execute("PRAGMA table_info(decks)")
            deck_cols = {row[1] for row in cursor.fetchall()}
            if "user_id" not in deck_cols:
                cursor.execute("ALTER TABLE decks ADD COLUMN user_id INTEGER")
                print("[db] Added column: user_id on decks")

            conn.commit()
        finally:
            conn.close()
