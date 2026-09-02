from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from models import Deck, Flashcard
from schemas import FlashcardOut
from auth import get_current_user_id

router = APIRouter(prefix="/api/decks/{deck_id}/cards", tags=["cards"])


@router.get("", response_model=list[FlashcardOut])
def list_cards(deck_id: int, user_id: int = Depends(get_current_user_id), db: Session = Depends(get_db)):
    deck = db.query(Deck).filter(Deck.id == deck_id, Deck.user_id == user_id).first()
    if not deck:
        raise HTTPException(status_code=404, detail="Deck not found")
    cards = (
        db.query(Flashcard)
        .filter(Flashcard.deck_id == deck_id)
        .order_by(Flashcard.created_at.desc())
        .all()
    )
    return cards


@router.get("/{card_id}", response_model=FlashcardOut)
def get_card(deck_id: int, card_id: int, user_id: int = Depends(get_current_user_id), db: Session = Depends(get_db)):
    deck = db.query(Deck).filter(Deck.id == deck_id, Deck.user_id == user_id).first()
    if not deck:
        raise HTTPException(status_code=404, detail="Deck not found")
    card = (
        db.query(Flashcard)
        .filter(Flashcard.id == card_id, Flashcard.deck_id == deck_id)
        .first()
    )
    if not card:
        raise HTTPException(status_code=404, detail="Card not found")
    return card


@router.delete("/{card_id}", status_code=204)
def delete_card(deck_id: int, card_id: int, user_id: int = Depends(get_current_user_id), db: Session = Depends(get_db)):
    deck = db.query(Deck).filter(Deck.id == deck_id, Deck.user_id == user_id).first()
    if not deck:
        raise HTTPException(status_code=404, detail="Deck not found")
    card = (
        db.query(Flashcard)
        .filter(Flashcard.id == card_id, Flashcard.deck_id == deck_id)
        .first()
    )
    if not card:
        raise HTTPException(status_code=404, detail="Card not found")
    db.delete(card)
    db.commit()
