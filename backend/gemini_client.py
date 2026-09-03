import json
import os
import re
import time
import requests
from dotenv import load_dotenv

load_dotenv()

API_KEY = os.getenv("GEMINI_API_KEY", "")
BASE_URL = "https://generativelanguage.googleapis.com/v1beta"
MAX_RETRIES = 3  # Retry count for transient API errors
RETRY_BACKOFF = [10, 30, 60]  # Seconds between retries

# Model fallback list — tries each until one works
# Ordered by reliability for this API key (tested working models first)
MODEL_FALLBACKS = [
    "gemini-3.5-flash",
    "gemini-3.5-flash-lite",
    "gemini-3.1-flash-lite",
    "gemini-3-flash-preview",
    "gemini-flash-lite-latest",
    "gemini-3.6-flash",
    "gemini-3.7-flash",
]
WORKING_MODEL = None  # Cache the first model that works to avoid retrying dead ones


FLASHCARD_PROMPT = """You are an expert study tutor creating flashcards from a student's textbook/notes.

══════════════════════════════════════════
ANSWER QUALITY RULES — THIS IS THE MOST IMPORTANT PART:
══════════════════════════════════════════

EVERY answer MUST be COMPLETE and SELF-CONTAINED. The student should NOT need to open the textbook.

══════════════════════════════════════════
ANSWER FORMATTING RULES — POINTS VS PARAGRAPHS:
══════════════════════════════════════════
Format every answer clearly according to its content structure:

1. FOR LISTS, REASONS, PROPERTIES, CHARACTERISTICS, OR MULTI-POINT CONCEPTS:
   - Present them as clean markdown bullet points (* or -) or numbered lists (1., 2.).
   - Put EACH point on its own separate line.
   - Use bold for point titles/labels (e.g. "* **Closure:** For all a, b in G, a * b is in G.").

2. FOR STEP-BY-STEP PROCESSES, PROOFS, OR WORKED EXAMPLES:
   - Number each step on its own separate line.
   - Example:
     Step 1: State given assumptions: a + b = a + c.
     Step 2: Subtract a from both sides: a + b - a = a + c - a.
     Step 3: Simplify: b = c. ∎

3. FOR DEFINITIONS, EXPLANATIONS, OR CONCEPTUAL SUMMARIES:
   - Write clear, coherent paragraphs separated by double newlines (\n\n).
   - If an answer has an introductory definition followed by points, provide the definition paragraph, then a blank line (\n\n), then the bulleted/numbered points.
   - Example:
     A group is an algebraic structure consisting of a set G equipped with a binary operation * that combines any two elements to form a third element.

     To qualify as a group, it must satisfy four fundamental axioms:
     * **Closure:** For all a, b ∈ G, the result a * b is in G.
     * **Associativity:** For all a, b, c ∈ G, (a * b) * c = a * (b * c).
     * **Identity element:** There exists an element e ∈ G such that e * a = a * e = a for every a ∈ G.
     * **Inverse element:** For each a ∈ G, there exists an element b ∈ G such that a * b = b * a = e.

4. NEVER cram multiple points or steps into a single continuous run-on paragraph.

For FORMULAS/EQUATIONS: Write the formula, define EVERY variable, then show a worked numerical example.
  Example: "The quadratic formula is $x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}$, where $a, b, c$ are coefficients of $ax^2 + bx + c = 0$.

  **Worked Example:**
  For $2x^2 + 5x - 3 = 0$, $a=2, b=5, c=-3$.
  $x = \\frac{-5 \\pm \\sqrt{25 - 4(2)(-3)}}{2(2)} = \\frac{-5 \\pm \\sqrt{49}}{4} = \\frac{-5 \\pm 7}{4}$
  So $x = 0.5$ or $x = -3$."

For DIAGRAMS/GRAPHS: Describe what the image shows in detail — axes, labels, data points, trends, key features.

══════════════════════════════════════════
STRICTLY FORBIDDEN IN ANSWERS:
══════════════════════════════════════════
- NEVER say "see page X", "as stated on page X", "as given on page X", "refer to page X"
- NEVER say "as described in the document", "as mentioned in the text"
- NEVER say "prove that..." in the QUESTION — instead ask "Prove that..." and provide the FULL PROOF in the answer
- NEVER give incomplete answers like "this follows from the definition" — actually show the reasoning
- NEVER say "the answer is in the textbook" or similar lazy responses

══════════════════════════════════════════
CARD GENERATION RULES:
══════════════════════════════════════════

1. ONLY create flashcards from the ACTUAL subject content in the document
2. NEVER invent, hallucinate, or fabricate any content not in the document
3. NEVER use generic/placeholder images — reference ACTUAL image IDs provided
4. Every card MUST include "image_id" (the actual extracted image ID, or "" if none)
5. Every card MUST include "content_type" (text, formula, graph, diagram, chart, table, image, mixed)

STRICTLY FORBIDDEN — NEVER generate flashcards about:
- Author name, biography, "who wrote this"
- Book title, chapter title alone, section headings alone
- Copyright, publisher, edition, year of publication, ISBN, barcode
- Table of contents, index, preface, foreword, acknowledgements
- Any non-academic metadata or document formatting

ONLY generate flashcards about actual STUDY CONTENT:
- Mathematical formulas, equations, derivations, and WORKED EXAMPLES
- Theorems, proofs, lemmas, corollaries, axioms — with FULL PROOFS
- Definitions with examples
- Diagrams, graphs, charts — with detailed descriptions
- Tables and data — with specific values and interpretations
- Step-by-step problem solving methods
- Key relationships between concepts
- Examples and FULLY WORKED solutions

The document is provided page-by-page with:
- [PAGE X] markers separating pages
- [IMAGE img_pX_Y] markers showing EXACT image IDs and their nearby text
- [FORMULA form_pX_Y] markers showing EXACT formula IDs
- [TABLE tab_pX_Y] markers showing EXACT table IDs

For each flashcard, return a JSON object with:
- "question": Clear study question (e.g. "Prove that if a+b=a+c then b=c", "Solve 2x²+5x-3=0", "What is a group? Give an example.")
- "answer": COMPLETE, cleanly formatted answer with paragraphs and points (self-contained, no page references)
- "formula": LaTeX formula if the card involves a formula (empty string if none)
- "image_id": EXACT image_id from the document (e.g. "img_p3_0") or "" if no image
- "image_for": "question" or "answer" — which side shows the image
- "content_type": One of: "text", "formula", "graph", "diagram", "chart", "table", "image", "mixed"
- "source_page": Page number where this content comes from

Card generation targets:
- For every 5 pages of content, generate AT LEAST 10-15 flashcards
- Cover EVERY major topic, section, heading, and concept in the provided pages
- For each image/diagram/formula found, generate AT LEAST 2-3 cards about it
- Mix all content types based on what the document actually contains
- Be THOROUGH — do not skip any section or concept
- Skip pages that only contain metadata (title page, copyright page, etc.)

Return ONLY a JSON array, no markdown fences, no explanation."""


def generate_flashcards(text: str, images: list[dict] = None, full_content=None) -> list[dict]:
    """
    Generate flashcards strictly grounded in the uploaded document.
    For large documents (any page count), processes in smart batches and merges results.

    Args:
        text: Page-structured document text with [PAGE X], [IMAGE img_pX_Y], [FORMULA form_pX_Y] markers
        images: List of image dicts with 'data', 'mime', 'page', 'image_id', 'content_type', 'nearby_text'
        full_content: ExtractedContent object with all metadata
    """
    if images is None:
        images = []

    # If full_content has multiple pages (> 25 pages), batch process across the whole PDF
    if full_content and len(full_content.pages) > 25:
        return _generate_in_batches(text, images, full_content)
    elif full_content and full_content.pages:
        # 1-25 pages: process as a single batch with its formulas/tables
        return _generate_single(
            text=text,
            images=images,
            formulas=full_content.all_formulas,
            tables=full_content.all_tables,
            summary=full_content.summary,
        )
    else:
        # Generic text upload
        return _generate_single(text=text, images=images, formulas=[], tables=[], summary=f"{len(text)} chars text")


def _generate_in_batches(text: str, images: list[dict], full_content) -> list[dict]:
    """Split large documents of any page count into page-range batches and generate cards per batch."""
    BATCH_PAGES = 25  # Optimal batch size: 25 pages per batch
    all_cards = []
    seen_cards = set()  # track (question_key, source_page) to dedupe

    pages = full_content.pages if full_content and full_content.pages else []
    if not pages:
        return _generate_single(text, images, [], [], f"{len(text)} chars text")

    # Group pages into batches of BATCH_PAGES
    batches = []
    for batch_start in range(0, len(pages), BATCH_PAGES):
        batch_pages = pages[batch_start:batch_start + BATCH_PAGES]
        page_start_num = batch_pages[0].page_number
        page_end_num = batch_pages[-1].page_number

        # Build context for this batch directly from page objects
        batch_text = _build_batch_context(batch_pages)

        # Filter images, formulas, and tables for this batch's page range
        batch_images = [
            img for img in images
            if page_start_num <= img.get("page", 0) <= page_end_num
        ]
        batch_formulas = [f for p in batch_pages for f in getattr(p, 'formulas', [])]
        batch_tables = [t for p in batch_pages for t in getattr(p, 'tables', [])]
        batch_summary = (
            f"Pages {page_start_num}-{page_end_num} (of {len(pages)}) | "
            f"{len(batch_images)} images | {len(batch_formulas)} formulas | {len(batch_tables)} tables"
        )

        batches.append({
            "text": batch_text,
            "start_page": page_start_num,
            "end_page": page_end_num,
            "images": batch_images,
            "formulas": batch_formulas,
            "tables": batch_tables,
            "summary": batch_summary,
        })

    print(f"[gemini] Large document: {len(pages)} pages -> processing in {len(batches)} batches of ~{BATCH_PAGES} pages...")

    for i, batch in enumerate(batches):
        print(f"[gemini] Processing batch {i + 1}/{len(batches)} "
              f"(pages {batch['start_page']}-{batch['end_page']}, "
              f"{len(batch['text'])} chars, {len(batch['images'])} images, "
              f"{len(batch['formulas'])} formulas, {len(batch['tables'])} tables)")
        try:
            batch_cards = _generate_single(
                text=batch["text"],
                images=batch["images"],
                formulas=batch["formulas"],
                tables=batch["tables"],
                summary=batch["summary"],
            )
            for card in batch_cards:
                # Dedupe by normalized question prefix + source_page
                card_key = (card["question"][:80].lower().strip(), card.get("source_page", 0))
                if card_key not in seen_cards:
                    all_cards.append(card)
                    seen_cards.add(card_key)
        except Exception as e:
            print(f"[gemini] Batch {i + 1} (pages {batch['start_page']}-{batch['end_page']}) failed: {e}")
            continue

        # Progressive delay between batches to respect rate limits
        if i < len(batches) - 1:
            time.sleep(5)

    print(f"[gemini] Total generated: {len(all_cards)} cards across all {len(batches)} batches")
    return all_cards


def _build_batch_context(pages: list) -> str:
    """Build structured context for a batch of pages."""
    parts = []
    for page in pages:
        page_parts = [f"[PAGE {page.page_number}]"]

        if page.text.strip():
            page_parts.append(page.text.strip())

        if hasattr(page, 'headings') and page.headings:
            page_parts.append(f"[HEADINGS on page {page.page_number}]: {', '.join(page.headings[:5])}")

        for formula in getattr(page, 'formulas', []):
            page_parts.append(
                f"[FORMULA {formula.formula_id} on page {page.page_number}]\n"
                f"Raw: {formula.raw_text}\n"
                f"LaTeX: {formula.latex}\n"
                f"Context: {formula.nearby_text[:200]}"
            )

        for table in getattr(page, 'tables', []):
            page_parts.append(
                f"[TABLE {table.table_id} on page {page.page_number}] ({table.rows}×{table.cols})\n"
                f"{table.text[:500]}\n"
                f"Context: {table.nearby_text[:200]}"
            )

        for img in getattr(page, 'images', []):
            nearby = img.nearby_text[:200] if img.nearby_text else ""
            page_parts.append(
                f"[IMAGE {img.image_id} on page {page.page_number}] "
                f"Type: {img.content_type} | Position: {img.position}"
                f"{' | Near: ' + nearby if nearby else ''}"
            )

        parts.append("\n".join(page_parts))

    return "\n\n".join(parts)


def _build_image_catalog(images: list[dict] = None, formulas: list = None, tables: list = None) -> str:
    """Build a catalog of images, formulas, and tables for Gemini to reference by ID."""
    lines = []
    if images:
        for i, img in enumerate(images[:20]):
            img_id = img.get("image_id", f"img_{i}")
            page = img.get("page", "?")
            content_type = img.get("content_type", "image")
            nearby = img.get("nearby_text", "")[:200]
            lines.append(f"- [IMAGE {img_id}]: {content_type} from page {page}"
                         f"{' — context: ' + nearby if nearby else ''}")

    if formulas:
        lines.append("\nFORMULAS IN THIS SECTION:")
        for f in formulas[:25]:
            if isinstance(f, dict):
                fid = f.get("formula_id", "")
                raw = f.get("raw_text", "")
                latex = f.get("latex", "")
                page = f.get("page_number", "?")
            else:
                fid = getattr(f, "formula_id", "")
                raw = getattr(f, "raw_text", "")
                latex = getattr(f, "latex", "")
                page = getattr(f, "page_number", "?")
            lines.append(f"- [FORMULA {fid} on page {page}]: {raw[:100]} → {latex[:100]}")

    if tables:
        lines.append("\nTABLES IN THIS SECTION:")
        for t in tables[:15]:
            if isinstance(t, dict):
                tid = t.get("table_id", "")
                rows = t.get("rows", 0)
                cols = t.get("cols", 0)
                text = t.get("text", "")
                page = t.get("page_number", "?")
            else:
                tid = getattr(t, "table_id", "")
                rows = getattr(t, "rows", 0)
                cols = getattr(t, "cols", 0)
                text = getattr(t, "text", "")
                page = getattr(t, "page_number", "?")
            lines.append(f"- [TABLE {tid} on page {page}]: {rows}×{cols} table — {text[:100]}")

    return "\n".join(lines) if lines else "No images/formulas/tables in this section"


def _generate_single(
    text: str,
    images: list[dict] = None,
    formulas: list = None,
    tables: list = None,
    summary: str = "",
) -> list[dict]:
    """Generate flashcards from a chunk of text."""
    if images is None:
        images = []
    if formulas is None:
        formulas = []
    if tables is None:
        tables = []

    if not summary:
        summary = f"{len(images)} images, {len(formulas)} formulas, {len(tables)} tables"

    image_catalog = _build_image_catalog(images, formulas, tables)

    prompt = FLASHCARD_PROMPT + f"\n\nDOCUMENT SECTION SUMMARY: {summary}\n\nSECTION ASSETS CATALOG:\n{image_catalog}"

    # Build parts
    parts = [{"text": prompt}]

    # Add full structured text (page-by-page with markers) without artificial truncation
    if text.strip():
        parts.append({"text": f"\n\n=== DOCUMENT CONTENT ===\n{text}\n=== END DOCUMENT ==="})

    # Add images with EXACT IDs as labels (up to 20 images per batch)
    for i, img in enumerate(images[:20]):
        img_id = img.get("image_id", f"img_{i}")
        content_type = img.get("content_type", "image")
        nearby = img.get("nearby_text", "")[:150]
        parts.append({
            "text": f"\n[{img_id}] — {content_type} from page {img.get('page', '?')}"
                    f"{' — nearby text: ' + nearby if nearby else ''}"
        })
        parts.append({
            "inline_data": {
                "mime_type": img.get("mime", "image/png"),
                "data": img["data"],
            }
        })

    payload = {"contents": [{"parts": parts}]}
    headers = {"Content-Type": "application/json"}

    img_count = min(len(images), 20)
    print(f"[gemini] Sending {len(text)} chars + {img_count} images...")

    global WORKING_MODEL
    last_error = None
    raw = None
    used_model = None

    # If we already know a working model, use it directly
    models_to_try = [WORKING_MODEL] if WORKING_MODEL else MODEL_FALLBACKS

    for model_name in models_to_try:
        url = f"{BASE_URL}/models/{model_name}:generateContent?key={API_KEY}"
        if not WORKING_MODEL:
            print(f"[gemini] Trying model: {model_name}")

        for attempt in range(MAX_RETRIES):
            try:
                response = requests.post(url, json=payload, headers=headers, timeout=180)

                if response.status_code == 200:
                    data = response.json()
                    raw = data["candidates"][0]["content"]["parts"][0]["text"].strip()
                    used_model = model_name
                    WORKING_MODEL = model_name  # Cache for future batches
                    print(f"[gemini] Response from {model_name}, length: {len(raw)}")
                    break
                elif response.status_code == 404:
                    # Model not available — try next model
                    print(f"[gemini] Model {model_name} not available (404), trying next...")
                    break  # Exit retry loop, try next model
                elif response.status_code in (429, 500, 502, 503, 504):
                    error_msg = response.text[:300]
                    # Check if this is a quota/billing error (not retryable, try next model)
                    if response.status_code == 429 and "exceeded your current quota" in error_msg.lower():
                        print(f"[gemini] QUOTA EXCEEDED on {model_name} — trying next model...")
                        WORKING_MODEL = None  # Don't cache a model that's out of quota
                        break  # Exit retry loop, try next model
                    # Transient errors — retry
                    wait = RETRY_BACKOFF[attempt] if attempt < len(RETRY_BACKOFF) else RETRY_BACKOFF[-1]
                    print(f"[gemini] Transient error {response.status_code} (attempt {attempt + 1}/{MAX_RETRIES}), retrying in {wait}s")
                    time.sleep(wait)
                    last_error = f"{model_name}: {response.status_code}"
                    continue
                else:
                    error_msg = response.text[:300]
                    print(f"[gemini] API error {response.status_code}: {error_msg}")
                    # 403 means this project can't access this model — try next
                    if response.status_code == 403:
                        break  # Exit retry loop, try next model
                    raise Exception(f"Gemini API returned {response.status_code}: {error_msg}")
            except requests.exceptions.Timeout:
                wait = RETRY_BACKOFF[attempt] if attempt < len(RETRY_BACKOFF) else RETRY_BACKOFF[-1]
                print(f"[gemini] Timeout on {model_name} (attempt {attempt + 1}/{MAX_RETRIES}), retrying in {wait}s")
                time.sleep(wait)
                last_error = f"{model_name}: timeout"
                continue
            except requests.exceptions.ConnectionError as e:
                wait = RETRY_BACKOFF[attempt] if attempt < len(RETRY_BACKOFF) else RETRY_BACKOFF[-1]
                print(f"[gemini] Connection error (attempt {attempt + 1}/{MAX_RETRIES}), retrying in {wait}s")
                time.sleep(wait)
                last_error = f"{model_name}: connection error"
                continue

        if raw is not None:
            break  # Got a successful response
    else:
        # All models exhausted
        raise Exception(f"Gemini API failed — all models unavailable. Last error: {last_error}")

    # Strip markdown fences
    if raw.startswith("```"):
        raw = raw.split("\n", 1)[1]
        if raw.endswith("```"):
            raw = raw[:-3]
        raw = raw.strip()

    cards = _parse_json_response(raw)

    # Validate — only keep cards with valid structure
    validated = []
    for card in cards:
        if not isinstance(card, dict):
            continue
        if "question" not in card or "answer" not in card:
            continue

        q = _format_and_clean_text(card["question"])
        a = _format_and_clean_text(card["answer"])

        # Filter out metadata / non-study questions
        if _is_metadata_card(q, a):
            continue

        if not a or not q:
            continue

        # Normalize source_page: Gemini may return strings like "35-36"
        sp = card.get("source_page", 0)
        if isinstance(sp, str):
            sp = sp.split("-")[0].strip()  # take first page of range
        try:
            sp = int(sp)
        except (ValueError, TypeError):
            sp = 0

        validated.append({
            "question": q,
            "answer": a,
            "formula": card.get("formula", "").strip(),
            "image_id": card.get("image_id", ""),
            "image_for": card.get("image_for", ""),
            "content_type": card.get("content_type", "text"),
            "source_page": sp,
        })

    print(f"[gemini] Validated {len(validated)} cards from {len(cards)} raw")
    return validated


def _parse_json_response(raw: str) -> list:
    """Parse Gemini's JSON response, fixing common malformations."""
    # First try direct parse
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        pass

    # Fix 1: Escape unescaped LaTeX backslashes
    fixed = _escape_latex_backslashes(raw)
    try:
        return json.loads(fixed)
    except json.JSONDecodeError:
        pass

    # Fix 2: Remove trailing commas before ] or }
    fixed2 = re.sub(r',\s*([\]\}])', r'\1', fixed)
    try:
        return json.loads(fixed2)
    except json.JSONDecodeError:
        pass

    # Fix 3: Try to extract individual card objects from the array
    # This handles cases where one card is malformed but others are fine
    cards = _extract_cards_individually(raw)
    if cards:
        return cards

    # Fix 4: String-aware bracket extraction
    return _extract_json_array(raw)


def _escape_latex_backslashes(text: str) -> str:
    """Fix unescaped backslashes from LaTeX in Gemini's JSON output."""
    from json_fix import fix_json_backslashes
    return fix_json_backslashes(text)


def _extract_cards_individually(text: str) -> list:
    """Extract individual JSON objects from text, skipping malformed ones.
    
    Useful when one card in the array has a syntax error but others are valid.
    """
    cards = []
    i = 0
    n = len(text)

    while i < n:
        # Find next opening brace
        start = text.find('{', i)
        if start == -1:
            break

        # Find matching closing brace with string awareness
        depth = 0
        in_string = False
        escape_next = False
        j = start

        while j < n:
            ch = text[j]
            if escape_next:
                escape_next = False
                j += 1
                continue
            if ch == '\\' and in_string:
                escape_next = True
                j += 1
                continue
            if ch == '"':
                in_string = not in_string
                j += 1
                continue
            if in_string:
                j += 1
                continue
            if ch == '{':
                depth += 1
            elif ch == '}':
                depth -= 1
                if depth == 0:
                    candidate = text[start:j+1]
                    try:
                        obj = json.loads(candidate)
                        if isinstance(obj, dict) and 'question' in obj and 'answer' in obj:
                            cards.append(obj)
                    except json.JSONDecodeError:
                        # Try fixing backslashes in this object
                        try:
                            from json_fix import fix_json_backslashes
                            obj = json.loads(fix_json_backslashes(candidate))
                            if isinstance(obj, dict) and 'question' in obj and 'answer' in obj:
                                cards.append(obj)
                        except json.JSONDecodeError:
                            pass  # Skip this malformed object
                    i = j + 1
                    break
            j += 1
        else:
            i = n  # No matching brace found

    if cards:
        print(f"[gemini] Extracted {len(cards)} individual cards from malformed response")
    return cards


def _extract_json_array(text: str) -> list:
    """Fallback: extract a JSON array from text using string-aware bracket matching.
    
    Properly skips brackets inside quoted strings so that content like
    '{"answer": "a {set}"}' is parsed correctly.
    """
    start = text.find('[')
    if start == -1:
        return []
    
    depth = 0
    in_string = False
    escape_next = False
    i = start
    n = len(text)

    while i < n:
        ch = text[i]

        if escape_next:
            escape_next = False
            i += 1
            continue

        if ch == '\\' and in_string:
            escape_next = True
            i += 1
            continue

        if ch == '"':
            in_string = not in_string
            i += 1
            continue

        if in_string:
            i += 1
            continue

        if ch == '[':
            depth += 1
        elif ch == ']':
            depth -= 1
            if depth == 0:
                candidate = text[start:i+1]
                try:
                    return json.loads(candidate)
                except json.JSONDecodeError:
                    # Try fixing backslashes before giving up
                    try:
                        from json_fix import fix_json_backslashes
                        return json.loads(fix_json_backslashes(candidate))
                    except json.JSONDecodeError:
                        return []
        i += 1
    return []




# Keywords that indicate a metadata / non-study question
_METADATA_KEYWORDS = [
    # Author & attribution
    "author", "who wrote", "who is the writer", "who created this",
    "who is the creator", "written by", "authored by", "composed by",
    "created by", "developed by", "professor", "dr.",
    # Title & headings
    "book title", "document title", "chapter title", "section title",
    "what is the title", "what is the name of this book",
    "what is the name of this document", "what is the name of this chapter",
    # Publication & copyright
    "copyright", "publisher", "published by", "publication year",
    "year of publication", "edition", "isbn", "barcode",
    "first edition", "second edition", "third edition",
    "publication date", "date of publication",
    # Document structure (not content)
    "table of contents", "foreword", "preface", "preface by",
    "acknowledgement", "dedication", "about the author",
    "biography", "biographical", "author biography",
    "who is the author", "who are the authors",
    "who wrote this book", "who wrote this document",
    # Generic metadata
    "copyright holder", "all rights reserved",
    "reproduced with permission", "library of congress",
    "cataloging in publication",
]

# Patterns that suggest metadata questions
_METADATA_PATTERNS = [
    r"who\s+(wrote|authored|created|composed|published|edited)",
    r"what\s+(is|are)\s+the\s+(author|publisher|edition|year)",
    r"when\s+(was|were)\s+(this|it)\s+published",
    r"what\s+(year|edition|version)",
    r"copyright\s+\d{4}",
    r"isbn[- ]?\d",
]


import re as _re


def _is_metadata_card(question: str, answer: str) -> bool:
    """Check if a card is about document metadata rather than study content."""
    q_lower = question.lower().strip()
    a_lower = answer.lower().strip()

    # Check question for metadata keywords
    for kw in _METADATA_KEYWORDS:
        if kw in q_lower:
            return True

    # Check question for metadata patterns
    for pattern in _METADATA_PATTERNS:
        if _re.search(pattern, q_lower):
            return True

    # If the answer is very short and looks like metadata
    # (e.g. just a name, year, or single word)
    if len(a_lower) < 20 and any(kw in a_lower for kw in _METADATA_KEYWORDS):
        return True

    return False


# Patterns for lazy answers that reference pages instead of giving real answers
_LAZY_ANSWER_PATTERNS = [
    r"see\s+page\s+\d+",
    r"as\s+(stated|given|mentioned|described|shown)\s+(on|in|at)\s+page\s+\d+",
    r"refer\s+to\s+page\s+\d+",
    r"on\s+page\s+\d+",
    r"from\s+page\s+\d+",
    r"page\s+\d+\s+(of|for|in)\s+the",
]



def _format_and_clean_text(text: str) -> str:
    """Clean and format card question/answer text.
    
    - Preserves newlines (\n, \n\n) for paragraphs and lists.
    - Normalizes horizontal whitespace (spaces, tabs) without squashing lines.
    - Automatically splits inline bullet or numbered lists into proper markdown lines.
    - Removes lazy page references and orphan punctuation artifacts.
    """
    if not text:
        return ""

    import re as _re2
    # Normalize line endings
    t = text.replace("\r\n", "\n").replace("\r", "\n")

    # Remove lazy page references
    for pattern in _LAZY_ANSWER_PATTERNS:
        t = _re2.sub(pattern, "", t, flags=_re2.IGNORECASE)

    # Remove "of the chapter" / "of the book" remnants after page removal
    t = _re2.sub(r"[ \t]*of\s+the\s+(chapter|book|text|document)\s*\.?\s*$", ".", t, flags=_re2.IGNORECASE)
    t = _re2.sub(r"[ \t]*of\s+the\s+(chapter|book|text|document)[ \t]*", " ", t, flags=_re2.IGNORECASE)

    # Split inline explicit bullets (•, ◦, ▪, etc.)
    t = _re2.sub(r'(?<=\S)\s+(?=[•◦▪▫◆➢▶✓✔★]\s+)', '\n', t)

    # Split inline numbered lists: e.g. "Key factors: 1. Factor A 2. Factor B 3. Factor C"
    t = _re2.sub(r'(?<=\S)\s+(?=(?:\d+[\.\)]|\(\d+\))\s+(?:\*\*)?[A-Z])', '\n', t)
    t = _re2.sub(r'(?<=[.!?:;])\s+(?=(?:[a-zA-Z][\.\)]|\([a-zA-Z]\))\s+[A-Za-z\*\`])', '\n', t)

    # Split inline markdown bullets with bold labels e.g. "Includes: * **Closure:** ... * **Associativity:** ..."
    t = _re2.sub(r'(?<=[.!?:;])\s+(?=[*\-]\s+\*\*)', '\n', t)
    t = _re2.sub(r'(?<=\S)\s+(?=[*\-]\s+\*\*[A-Za-z0-9\s]+?\*\*:?)', '\n', t)

    # Split inline steps: e.g. "... Step 1: ... Step 2: ..."
    t = _re2.sub(r'(?<=\S)\s+(?=(?:Step|Stage|Phase|Case|Part)\s+\d+[:\-\s])', '\n\n', t, flags=_re2.IGNORECASE)

    # Clean up lines
    lines = t.split("\n")
    cleaned_lines = []
    for line in lines:
        # Collapse multiple horizontal spaces/tabs to a single space
        cleaned = _re2.sub(r"[ \t]+", " ", line).strip()
        # Clean orphan comma at end of line if any
        cleaned = _re2.sub(r",\s*$", "", cleaned)
        cleaned_lines.append(cleaned)

    t = "\n".join(cleaned_lines)

    # Collapse 3 or more newlines into double newlines (\n\n)
    t = _re2.sub(r"\n{3,}", "\n\n", t)

    # Collapse multiple periods (while preserving ... ellipsis)
    t = _re2.sub(r"(?<!\.)\.\.(?!\.)", ".", t)

    return t.strip()


