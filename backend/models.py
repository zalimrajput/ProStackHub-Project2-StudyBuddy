from datetime import datetime, timezone
from sqlalchemy import (
    Column, Integer, String, Text, Float, DateTime, ForeignKey, Boolean
)
from sqlalchemy.orm import relationship
from database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, nullable=False, index=True)
    username = Column(String(100), unique=True, nullable=False, index=True)
    hashed_password = Column(String(255), nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    decks = relationship("Deck", back_populates="user", cascade="all, delete-orphan")


class Deck(Base):
    __tablename__ = "decks"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    name = Column(String(200), nullable=False)
    description = Column(Text, default="")
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc),
                        onupdate=lambda: datetime.now(timezone.utc))

    user = relationship("User", back_populates="decks")
    cards = relationship("Flashcard", back_populates="deck", cascade="all, delete-orphan")


class Flashcard(Base):
    __tablename__ = "flashcards"

    id = Column(Integer, primary_key=True, index=True)
    deck_id = Column(Integer, ForeignKey("decks.id"), nullable=False)
    question = Column(Text, nullable=False)
    answer = Column(Text, nullable=False)

    # Image support — store base64 image for questions/answers with visuals
    question_image = Column(Text, nullable=True)   # base64 image for question
    answer_image = Column(Text, nullable=True)     # base64 image for answer
    image_mime = Column(String(20), default="image/png")  # mime type
    image_page = Column(Integer, nullable=True)    # page number from PDF

    # Formula support — store LaTeX formula
    formula = Column(Text, nullable=True)          # LaTeX formula string

    # Content metadata
    content_type = Column(String(50), default="text")  # text, formula, graph, diagram, chart, table, image
    source_page = Column(Integer, nullable=True)   # original page number in PDF

    # SM-2 spaced repetition fields
    ease_factor = Column(Float, default=2.5)       # Easiness factor (>=1.3)
    review_count = Column(Integer, default=0)       # Times reviewed
    consecutive_correct = Column(Integer, default=0) # Consecutive correct
    interval_days = Column(Integer, default=0)      # Current interval in days
    next_review = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    is_mastered = Column(Boolean, default=False)    # True after 30+ day interval
    last_reviewed = Column(DateTime, nullable=True)

    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    deck = relationship("Deck", back_populates="cards")
    reviews = relationship("ReviewHistory", back_populates="card", cascade="all, delete-orphan")


class ReviewHistory(Base):
    __tablename__ = "review_history"

    id = Column(Integer, primary_key=True, index=True)
    card_id = Column(Integer, ForeignKey("flashcards.id"), nullable=False)
    rating = Column(String(20), nullable=False)  # "again", "hard", "good", "easy"
    ease_factor_before = Column(Float)
    ease_factor_after = Column(Float)
    interval_before = Column(Integer)
    interval_after = Column(Integer)
    reviewed_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    card = relationship("Flashcard", back_populates="reviews")
