from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field, field_validator


# ── Deck schemas ──

class DeckCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    description: str = ""

class DeckUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = None

class DeckOut(BaseModel):
    id: int
    name: str
    description: str
    created_at: datetime
    updated_at: datetime
    card_count: int = 0
    due_count: int = 0

    class Config:
        from_attributes = True


# ── Flashcard schemas ──

class FlashcardOut(BaseModel):
    id: int
    deck_id: int
    question: str
    answer: str
    question_image: Optional[str] = None
    answer_image: Optional[str] = None
    image_mime: Optional[str] = None
    image_page: Optional[int] = None
    formula: Optional[str] = None
    content_type: Optional[str] = None
    source_page: Optional[int] = None

    @field_validator("source_page", mode="before")
    @classmethod
    def coerce_source_page(cls, v):
        if v is None:
            return None
        if isinstance(v, str):
            v = v.split("-")[0].strip()  # "35-36" -> "35"
        try:
            return int(v)
        except (ValueError, TypeError):
            return None

    ease_factor: float
    review_count: int
    consecutive_correct: int
    interval_days: int
    next_review: datetime
    is_mastered: bool
    last_reviewed: Optional[datetime] = None
    created_at: datetime

    class Config:
        from_attributes = True

class FlashcardBrief(BaseModel):
    id: int
    question: str
    answer: str
    is_mastered: bool
    interval_days: int

    class Config:
        from_attributes = True


# ── Generate schemas ──

class GenerateRequest(BaseModel):
    deck_id: Optional[int] = None
    deck_name: Optional[str] = None
    text_content: Optional[str] = None  # pasted notes

class GenerateResponse(BaseModel):
    deck_id: int
    cards_generated: int
    cards: list[FlashcardOut]


# ── Review schemas ──

class ReviewSubmit(BaseModel):
    rating: str = Field(..., pattern="^(again|hard|good|easy)$")

class ReviewResponse(BaseModel):
    card: FlashcardOut
    history: dict  # before/after ease and interval

class ReviewSessionInfo(BaseModel):
    deck_id: int
    deck_name: str
    total_cards: int
    due_count: int
    cards: list[FlashcardOut]


# ── Stats schemas ──

class DashboardStats(BaseModel):
    total_cards: int = 0
    cards_due_today: int = 0
    cards_mastered: int = 0
    total_reviews_today: int = 0
    total_decks: int = 0
    study_streak: int = 0
    decks: list[DeckOut] = []
