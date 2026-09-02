import tempfile
import os
import traceback
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
from database import get_db
from models import Deck, Flashcard
from schemas import GenerateResponse, FlashcardOut
from gemini_client import generate_flashcards
from pdf_extractor import extract_pdf, extract_generic, ExtractedContent
from auth import get_current_user_id

router = APIRouter(prefix="/api/generate", tags=["generate"])


def _extract_from_file(file: UploadFile) -> tuple[str, list[dict], ExtractedContent | None]:
    """Extract all content from uploaded file."""
    filename = file.filename or "upload.txt"
    ext = filename.rsplit(".", 1)[-1].lower()
    content = file.file.read()

    if ext == "pdf":
        try:
            extracted = extract_pdf(content)
            # Build image list with full metadata
            images = [
                {
                    "data": img.data_b64,
                    "mime": img.mime,
                    "page": img.page_number,
                    "image_id": img.image_id,
                    "content_type": img.content_type,
                    "nearby_text": img.nearby_text,
                    "position": img.position,
                }
                for img in extracted.all_images
            ]
            return extracted.full_text, images, extracted
        except Exception as e:
            print(f"[extract] PDF extraction failed: {e}")
            import traceback
            traceback.print_exc()
            # Fallback: extract text only
            import pymupdf as fitz
            with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
                tmp.write(content)
                tmp_path = tmp.name
            doc = fitz.open(tmp_path)
            text = ""
            for page in doc:
                text += page.get_text()
            doc.close()
            os.unlink(tmp_path)
            return text, [], None

    elif ext in ("txt", "docx", "doc"):
        text, images = extract_generic(content, ext)
        return text, images, None

    return content.decode("utf-8", errors="ignore"), [], None


async def generate_cards(
    deck_id: int | None = Form(None),
    deck_name: str | None = Form(None),
    text_content: str | None = Form(None),
    file: UploadFile | None = File(None),
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """Generate flashcards grounded in uploaded content."""
    # Extract content
    images = []
    full_content = None
    try:
        if file:
            text, images, full_content = _extract_from_file(file)
        elif text_content:
            text = text_content
        else:
            raise HTTPException(status_code=400, detail="Provide text_content or a file upload")
    except HTTPException:
        raise
    except Exception as e:
        print(f"[generate] Extraction error: {e}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to extract content: {str(e)}")

    if not text.strip() and not images:
        raise HTTPException(status_code=400, detail="No content to process")

    # Create or use existing deck
    if deck_id:
        deck = db.query(Deck).filter(Deck.id == deck_id, Deck.user_id == user_id).first()
        if not deck:
            raise HTTPException(status_code=404, detail="Deck not found")
    else:
        deck = Deck(
            user_id=user_id,
            name=deck_name or "Generated Deck",
            description="Auto-generated from uploaded content",
        )
        db.add(deck)
        db.commit()
        db.refresh(deck)

    # Call Gemini with full context
    try:
        context = _build_structured_context(full_content, text)
        print(f"[generate] Context: {len(context)} chars, Images: {len(images)}")
        cards_data = generate_flashcards(context, images, full_content)
        print(f"[generate] Generated {len(cards_data)} cards")
    except Exception as e:
        print(f"[generate] Gemini error: {e}")
        traceback.print_exc()
        raise HTTPException(status_code=502, detail=f"Gemini API error: {str(e)}")

    if not cards_data:
        raise HTTPException(status_code=422, detail="No flashcards could be generated")

    # Build image lookup by image_id
    images_by_id = {img["image_id"]: img for img in images}

    # Save cards with full metadata
    new_cards = []
    for card in cards_data:
        if not isinstance(card, dict) or "question" not in card:
            continue
        image_id = card.get("image_id", "")
        img_data = images_by_id.get(image_id, {})

        q_image = None
        a_image = None
        img_mime = "image/png"
        img_page = None

        if image_id and img_data:
            img_mime = img_data.get("mime", "image/png")
            img_page = img_data.get("page")
            if card.get("image_for") == "answer":
                a_image = img_data.get("data")
            else:
                q_image = img_data.get("data")

        fc = Flashcard(
            deck_id=deck.id,
            question=card["question"],
            answer=card["answer"],
            question_image=q_image,
            answer_image=a_image,
            image_mime=img_mime,
            image_page=img_page,
            formula=card.get("formula", None) or None,
            content_type=card.get("content_type", "text"),
            source_page=card.get("source_page", None),
        )
        db.add(fc)
        new_cards.append(fc)

    db.commit()
    for fc in new_cards:
        db.refresh(fc)

    return GenerateResponse(
        deck_id=deck.id,
        cards_generated=len(new_cards),
        cards=[FlashcardOut.model_validate(fc) for fc in new_cards],
    )


def _build_structured_context(full_content: ExtractedContent | None, fallback_text: str) -> str:
    """Build page-by-page structured context with image/formula/table markers."""
    if not full_content:
        return fallback_text

    parts = []
    for page in full_content.pages:
        page_parts = [f"[PAGE {page.page_number}]"]

        # Text
        if page.text.strip():
            page_parts.append(page.text.strip())

        # Headings
        if page.headings:
            page_parts.append(f"[HEADINGS on page {page.page_number}]: {', '.join(page.headings[:5])}")

        # Formulas
        for formula in page.formulas:
            page_parts.append(
                f"[FORMULA {formula.formula_id} on page {page.page_number}]\n"
                f"Raw: {formula.raw_text}\n"
                f"LaTeX: {formula.latex}\n"
                f"Context: {formula.nearby_text[:200]}"
            )

        # Tables
        for table in page.tables:
            page_parts.append(
                f"[TABLE {table.table_id} on page {page.page_number}] ({table.rows}×{table.cols})\n"
                f"{table.text[:500]}\n"
                f"Context: {table.nearby_text[:200]}"
            )

        # Images
        for img in page.images:
            nearby = img.nearby_text[:200] if img.nearby_text else ""
            page_parts.append(
                f"[IMAGE {img.image_id} on page {page.page_number}] "
                f"Type: {img.content_type} | Position: {img.position}"
                f"{' | Near: ' + nearby if nearby else ''}"
            )

        parts.append("\n".join(page_parts))

    return "\n\n".join(parts)


# Register routes
router.add_api_route("", generate_cards, methods=["POST"], response_model=GenerateResponse)
router.add_api_route("/", generate_cards, methods=["POST"], response_model=GenerateResponse)
