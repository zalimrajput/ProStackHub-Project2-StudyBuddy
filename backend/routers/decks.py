from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from models import Deck, Flashcard, ReviewHistory
from schemas import DeckCreate, DeckUpdate, DeckOut

router = APIRouter(prefix="/api/decks", tags=["decks"])


def _deck_out(deck: Deck, db: Session) -> DeckOut:
    now = datetime.now(timezone.utc)
    start_of_today = now.replace(hour=0, minute=0, second=0, microsecond=0)
    card_count = db.query(Flashcard).filter(Flashcard.deck_id == deck.id).count()
    due_count = db.query(Flashcard).filter(
        Flashcard.deck_id == deck.id,
        Flashcard.next_review <= now
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


@router.get("", response_model=list[DeckOut])
def list_decks(db: Session = Depends(get_db)):
    decks = db.query(Deck).order_by(Deck.updated_at.desc()).all()
    return [_deck_out(d, db) for d in decks]


@router.get("/{deck_id}", response_model=DeckOut)
def get_deck(deck_id: int, db: Session = Depends(get_db)):
    deck = db.query(Deck).filter(Deck.id == deck_id).first()
    if not deck:
        raise HTTPException(status_code=404, detail="Deck not found")
    return _deck_out(deck, db)


@router.post("", response_model=DeckOut, status_code=201)
def create_deck(payload: DeckCreate, db: Session = Depends(get_db)):
    deck = Deck(name=payload.name, description=payload.description)
    db.add(deck)
    db.commit()
    db.refresh(deck)
    return _deck_out(deck, db)


@router.put("/{deck_id}", response_model=DeckOut)
def update_deck(deck_id: int, payload: DeckUpdate, db: Session = Depends(get_db)):
    deck = db.query(Deck).filter(Deck.id == deck_id).first()
    if not deck:
        raise HTTPException(status_code=404, detail="Deck not found")
    if payload.name is not None:
        deck.name = payload.name
    if payload.description is not None:
        deck.description = payload.description
    deck.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(deck)
    return _deck_out(deck, db)


@router.delete("/{deck_id}", status_code=204)
def delete_deck(deck_id: int, db: Session = Depends(get_db)):
    deck = db.query(Deck).filter(Deck.id == deck_id).first()
    if not deck:
        raise HTTPException(status_code=404, detail="Deck not found")
    db.delete(deck)
    db.commit()
