export interface Deck {
  id: number;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
  card_count: number;
  due_count: number;
}

export interface Flashcard {
  id: number;
  deck_id: number;
  question: string;
  answer: string;
  question_image: string | null;
  answer_image: string | null;
  image_mime: string | null;
  image_page: number | null;
  formula: string | null;
  content_type: string | null;
  source_page: number | null;
  ease_factor: number;
  review_count: number;
  consecutive_correct: number;
  interval_days: number;
  next_review: string;
  is_mastered: boolean;
  last_reviewed: string | null;
  created_at: string;
}

export interface DashboardStats {
  total_cards: number;
  cards_due_today: number;
  cards_mastered: number;
  total_reviews_today: number;
  total_decks: number;
  study_streak: number;
  decks: Deck[];
}

export interface ReviewSession {
  deck_id: number;
  deck_name: string;
  total_cards: number;
  due_count: number;
  cards: Flashcard[];
}

export interface GenerateResponse {
  deck_id: number;
  cards_generated: number;
  cards: Flashcard[];
}

export interface ReviewResult {
  card: Flashcard;
  history: {
    ease_factor_before: number;
    ease_factor_after: number;
    interval_before: number;
    interval_after: number;
  };
}
