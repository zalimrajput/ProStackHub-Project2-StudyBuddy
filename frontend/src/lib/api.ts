import type {
  Deck,
  Flashcard,
  DashboardStats,
  ReviewSession,
  GenerateResponse,
  ReviewResult,
} from './types';

// Where API calls go:
//  - Local dev & the single Docker container: NEXT_PUBLIC_BACKEND_URL is unset, so
//    BASE stays '/api' (same-origin) and next.config.js rewrites proxy /api/* to
//    the FastAPI backend on localhost:8000.
//  - Production (Vercel frontend + Railway backend): NEXT_PUBLIC_BACKEND_URL is set
//    at build time (inlined into the client bundle) to the Railway backend's public
//    URL, so the browser calls the backend DIRECTLY. This avoids Vercel's 120s
//    proxied-request cap and ~4.5 MB request-body limit, which would kill long PDF
//    generations and big uploads. The backend must allow this origin in its
//    CORS_ORIGINS env var.

// we will chnge this tempoery code base 
// const BASE = process.env.NEXT_PUBLIC_BACKEND_URL || '/api';

const BASE = process.env.NEXT_PUBLIC_BACKEND_URL
  ? `${process.env.NEXT_PUBLIC_BACKEND_URL}/api`
  : '/api';

function getAuthHeaders(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  const token = localStorage.getItem('studybuddy_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function fetchJSON<T>(url: string, options?: RequestInit): Promise<T> {
  const headers = {
    ...getAuthHeaders(),
    ...options?.headers,
  };
  const res = await fetch(url, { ...options, headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || 'Request failed');
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

// ── Stats ──

export async function getStats(): Promise<DashboardStats> {
  return fetchJSON(`${BASE}/stats/`);
}

// ── Decks ──

export async function listDecks(): Promise<Deck[]> {
  return fetchJSON(`${BASE}/decks/`);
}

export async function getDeck(id: number): Promise<Deck> {
  return fetchJSON(`${BASE}/decks/${id}`);
}

export async function createDeck(name: string, description: string): Promise<Deck> {
  return fetchJSON(`${BASE}/decks/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, description }),
  });
}

export async function deleteDeck(id: number): Promise<void> {
  return fetchJSON(`${BASE}/decks/${id}`, { method: 'DELETE' });
}

// ── Cards ──

export async function listCards(deckId: number): Promise<Flashcard[]> {
  return fetchJSON(`${BASE}/decks/${deckId}/cards/`);
}

export async function deleteCard(deckId: number, cardId: number): Promise<void> {
  return fetchJSON(`${BASE}/decks/${deckId}/cards/${cardId}`, { method: 'DELETE' });
}

// ── Generate ──

export async function generateFromText(
  text: string,
  deckId?: number,
  deckName?: string
): Promise<GenerateResponse> {
  const formData = new FormData();
  formData.append('text_content', text);
  if (deckId) formData.append('deck_id', String(deckId));
  if (deckName) formData.append('deck_name', deckName);

  return fetchJSON(`${BASE}/generate/`, {
    method: 'POST',
    body: formData,
  });
}

export async function generateFromFile(
  file: File,
  deckId?: number,
  deckName?: string
): Promise<GenerateResponse> {
  const formData = new FormData();
  formData.append('file', file);
  if (deckId) formData.append('deck_id', String(deckId));
  if (deckName) formData.append('deck_name', deckName);

  return fetchJSON(`${BASE}/generate/`, {
    method: 'POST',
    body: formData,
  });
}

// ── Review ──

export async function getReviewSession(deckId: number): Promise<ReviewSession> {
  return fetchJSON(`${BASE}/decks/${deckId}/review/session`);
}

export async function submitReview(
  deckId: number,
  cardId: number,
  rating: string
): Promise<ReviewResult> {
  const formData = new FormData();
  formData.append('rating', rating);

  return fetchJSON(`${BASE}/decks/${deckId}/review/${cardId}`, {
    method: 'POST',
    body: formData,
  });
}
