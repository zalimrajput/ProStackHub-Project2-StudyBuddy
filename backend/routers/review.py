from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, Form
from sqlalchemy.orm import Session
from database import get_db
from models import Deck, Flashcard, ReviewHistory
from schemas import ReviewSubmit, ReviewResponse, ReviewSessionInfo, FlashcardOut

router = APIRouter(prefix="/api/decks/{deck_id}/review", tags=["review"])


# ── SM-2 Algorithm Implementation ──

def _sm2_update(card: Flashcard, rating: str) -> dict:
    """
    Update flashcard scheduling with user-friendly intervals.

    Rating mappings:
      again  -> 10 minutes (shows again soon)
      hard   -> 1 day
      good   -> 3 days (first time), then grows
      easy   -> 7 days (first time), then grows

    After first review, intervals grow based on ease factor.
    """
    ease_before = card.ease_factor
    interval_before = card.interval_days
    now = datetime.now(timezone.utc)

    if rating == "again":
        # Failed — reset to 10 minutes
        new_interval_days = 0  # will use minutes instead
        new_interval_minutes = 10
        card.consecutive_correct = 0
        card.next_review = now + timedelta(minutes=10)
        # Reduce ease factor on failure
        new_ef = max(1.3, card.ease_factor - 0.2)

    elif rating == "hard":
        # Correct but struggled — 1 day, reduce ease
        new_interval_days = 1
        new_ef = max(1.3, card.ease_factor - 0.15)
        card.consecutive_correct = card.consecutive_correct + 1
        card.next_review = now + timedelta(days=1)

    elif rating == "good":
        # Got it correctly
        if card.consecutive_correct == 0:
            # First time getting it right
            new_interval_days = 3
        elif card.consecutive_correct == 1:
            # Second time
            new_interval_days = 7
        else:
            # Growth: previous interval × ease factor
            new_interval_days = max(7, round(card.interval_days * card.ease_factor))
        new_ef = card.ease_factor + 0.05  # slight boost
        card.consecutive_correct = card.consecutive_correct + 1
        card.next_review = now + timedelta(days=new_interval_days)

    elif rating == "easy":
        # Perfect recall — big interval boost
        if card.consecutive_correct == 0:
            # First time
            new_interval_days = 7
        elif card.consecutive_correct == 1:
            # Second time
            new_interval_days = 14
        else:
            # Growth: previous interval × ease factor × 1.3 bonus
            new_interval_days = max(14, round(card.interval_days * card.ease_factor * 1.3))
        new_ef = card.ease_factor + 0.15  # bigger boost for easy
        card.consecutive_correct = card.consecutive_correct + 1
        card.next_review = now + timedelta(days=new_interval_days)

    else:
        # Fallback
        new_interval_days = 1
        new_ef = card.ease_factor
        card.next_review = now + timedelta(days=1)

    card.ease_factor = new_ef
    card.interval_days = new_interval_days if new_interval_days > 0 else 0
    card.review_count += 1
    card.last_reviewed = now
    card.is_mastered = card.interval_days >= 30

    return {
        "ease_factor_before": ease_before,
        "ease_factor_after": round(new_ef, 4),
        "interval_before": interval_before,
        "interval_after": new_interval_days,
    }


# ── Endpoints ──

@router.get("/session", response_model=ReviewSessionInfo)
def get_review_session(deck_id: int, db: Session = Depends(get_db)):
    """Get all cards in a deck for review (sorted by next_review)."""
    deck = db.query(Deck).filter(Deck.id == deck_id).first()
    if not deck:
        raise HTTPException(status_code=404, detail="Deck not found")

    now = datetime.now(timezone.utc)
    total = db.query(Flashcard).filter(Flashcard.deck_id == deck_id).count()
    due = db.query(Flashcard).filter(
        Flashcard.deck_id == deck_id,
        Flashcard.next_review <= now,
    ).count()

    # Only return due cards for review
    cards = (
        db.query(Flashcard)
        .filter(
            Flashcard.deck_id == deck_id,
            Flashcard.next_review <= now,
        )
        .order_by(Flashcard.next_review.asc())
        .all()
    )

    return ReviewSessionInfo(
        deck_id=deck.id,
        deck_name=deck.name,
        total_cards=total,
        due_count=due,
        cards=[FlashcardOut.model_validate(c) for c in cards],
    )


@router.post("/{card_id}", response_model=ReviewResponse)
def submit_review(deck_id: int, card_id: int, rating: str = Form(...), db: Session = Depends(get_db)):
    """Submit a review for a single card."""
    if rating not in ("again", "hard", "good", "easy"):
        raise HTTPException(status_code=422, detail="Rating must be again, hard, good, or easy")

    card = (
        db.query(Flashcard)
        .filter(Flashcard.id == card_id, Flashcard.deck_id == deck_id)
        .first()
    )
    if not card:
        raise HTTPException(status_code=404, detail="Card not found")

    history = _sm2_update(card, rating)

    review = ReviewHistory(
        card_id=card.id,
        rating=rating,
        ease_factor_before=history["ease_factor_before"],
        ease_factor_after=history["ease_factor_after"],
        interval_before=history["interval_before"],
        interval_after=history["interval_after"],
    )
    db.add(review)
    db.commit()
    db.refresh(card)

    return ReviewResponse(
        card=FlashcardOut.model_validate(card),
        history=history,
    )
