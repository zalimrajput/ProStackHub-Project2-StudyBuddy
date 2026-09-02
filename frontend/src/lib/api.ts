import type {
  Deck,
  Flashcard,
  DashboardStats,
  ReviewSession,
  GenerateResponse,
  ReviewResult,
} from './types';

const BASE = '/api';
const BACKEND_DIRECT = 'http://localhost:8000/api';

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

  return fetchJSON(`${BACKEND_DIRECT}/generate/`, {
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

  return fetchJSON(`${BACKEND_DIRECT}/generate/`, {
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
