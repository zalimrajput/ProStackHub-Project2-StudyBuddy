from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session
from database import get_db
from models import Deck, Flashcard, ReviewHistory
from schemas import DashboardStats, DeckOut
from auth import get_current_user_id

router = APIRouter(prefix="/api/stats", tags=["stats"])


def _deck_out(deck: Deck, db: Session) -> DeckOut:
    now = datetime.now(timezone.utc)
    card_count = db.query(Flashcard).filter(Flashcard.deck_id == deck.id).count()
    due_count = db.query(Flashcard).filter(
        Flashcard.deck_id == deck.id,
        Flashcard.next_review <= now,
    ).count()
    return DeckOut(
        id=deck.id,
        name=deck.name,
        description=deck.description,
        created_at=deck.created_at,
        updated_at=deck.updated_at,
        card_count=card_count,
        due_count=due_count,
    )


@router.get("", response_model=DashboardStats)
def get_stats(user_id: int = Depends(get_current_user_id), db: Session = Depends(get_db)):
    now = datetime.now(timezone.utc)
    start_of_today = now.replace(hour=0, minute=0, second=0, microsecond=0)

    # Filter by user's decks
    user_deck_ids = db.query(Deck.id).filter(Deck.user_id == user_id).subquery()

    total_cards = db.query(func.count(Flashcard.id)).filter(
        Flashcard.deck_id.in_(user_deck_ids)
    ).scalar() or 0
    cards_due_today = db.query(func.count(Flashcard.id)).filter(
        Flashcard.deck_id.in_(user_deck_ids),
        Flashcard.next_review <= now,
    ).scalar() or 0
    cards_mastered = db.query(func.count(Flashcard.id)).filter(
        Flashcard.deck_id.in_(user_deck_ids),
        Flashcard.is_mastered == True,
    ).scalar() or 0

    # Reviews today — only for user's cards
    total_reviews_today = db.query(func.count(ReviewHistory.id)).join(
        Flashcard, ReviewHistory.card_id == Flashcard.id
    ).filter(
        Flashcard.deck_id.in_(user_deck_ids),
        ReviewHistory.reviewed_at >= start_of_today,
    ).scalar() or 0

    total_decks = db.query(func.count(Deck.id)).filter(Deck.user_id == user_id).scalar() or 0

    # Study streak: count consecutive days with at least one review
    streak = 0
    check_date = start_of_today
    while True:
        day_start = check_date.replace(hour=0, minute=0, second=0, microsecond=0)
        day_end = day_start + timedelta(days=1)
        count = db.query(func.count(ReviewHistory.id)).join(
            Flashcard, ReviewHistory.card_id == Flashcard.id
        ).filter(
            Flashcard.deck_id.in_(user_deck_ids),
            ReviewHistory.reviewed_at >= day_start,
            ReviewHistory.reviewed_at < day_end,
        ).scalar() or 0
        if count > 0:
            streak += 1
            check_date -= timedelta(days=1)
        else:
            break

    decks = db.query(Deck).filter(Deck.user_id == user_id).order_by(Deck.updated_at.desc()).all()

    return DashboardStats(
        total_cards=total_cards,
        cards_due_today=cards_due_today,
        cards_mastered=cards_mastered,
        total_reviews_today=total_reviews_today,
        total_decks=total_decks,
        study_streak=streak,
        decks=[_deck_out(d, db) for d in decks],
    )
