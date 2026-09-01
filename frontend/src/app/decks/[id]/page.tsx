'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { getDeck, listCards, deleteCard } from '@/lib/api';
import type { Deck, Flashcard } from '@/lib/types';
import Formula from '@/lib/Formula';
import FormattedText from '@/lib/FormattedText';

export default function DeckDetailPage() {
  const params = useParams();
  const deckId = Number(params.id);

  const [deck, setDeck] = useState<Deck | null>(null);
  const [cards, setCards] = useState<Flashcard[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  useEffect(() => {
    if (!deckId) return;
    Promise.all([getDeck(deckId), listCards(deckId)])
      .then(([d, c]) => { setDeck(d); setCards(c); })
      .finally(() => setLoading(false));
  }, [deckId]);

  const handleDelete = async (cardId: number) => {
    if (!confirm('Delete this card?')) return;
    await deleteCard(deckId, cardId);
    setCards((prev) => prev.filter((c) => c.id !== cardId));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="flex items-center gap-3 text-gray-400 dark:text-slate-500">
          <div className="w-5 h-5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
          <span>Loading deck...</span>
        </div>
      </div>
    );
  }

  if (!deck) {
    return (
      <div className="text-center py-20">
        <div className="text-5xl mb-4">🔍</div>
        <p className="text-red-400 mb-4 font-medium">Deck not found</p>
        <Link href="/decks" className="btn-secondary">← Back to Decks</Link>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-8 gap-4">
        <div>
          <Link href="/decks" className="text-sm text-gray-400 dark:text-slate-500 hover:text-brand-600 dark:hover:text-brand-400 mb-2 block transition-colors">
            ← Back to Decks
          </Link>
          <h1 className="page-title">{deck.name}</h1>
          {deck.description && <p className="page-subtitle">{deck.description}</p>}
        </div>
        <div className="flex gap-2">
          <Link href={`/review/${deckId}`} className="btn-primary flex items-center gap-2">
            📝 Review ({deck.due_count} due)
          </Link>
          <Link href={`/generate?deck_id=${deckId}`} className="btn-secondary flex items-center gap-2">
            ✨ Add Cards
          </Link>
        </div>
      </div>

      {/* Cards */}
      {cards.length === 0 ? (
        <div className="card text-center py-16">
          <div className="text-5xl mb-4">🃏</div>
          <p className="text-gray-500 dark:text-slate-400 mb-5 text-lg">No cards in this deck yet.</p>
          <Link href={`/generate?deck_id=${deckId}`} className="btn-primary inline-flex items-center gap-2">
            Generate Cards
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {cards.map((card, idx) => (
            <div
              key={card.id}
              className={`card transition-all duration-200 ${
                expandedId === card.id
                  ? 'ring-2 ring-brand-500/50 dark:ring-brand-400/50'
                  : 'hover:shadow-md'
              }`}
            >
              <div
                className="flex items-start justify-between cursor-pointer"
                onClick={() => setExpandedId(expandedId === card.id ? null : card.id)}
              >
                <div className="flex-1 mr-4">
                  <div className="flex items-start gap-2">
                    <span className="text-xs font-mono text-gray-400 dark:text-slate-500 mt-1">#{idx + 1}</span>
                    <div className="font-semibold text-gray-900 dark:text-white flex-1">
                      <FormattedText text={card.question} />
                    </div>
                  </div>
                  {expandedId === card.id && (
                    <div className="mt-3 p-4 bg-gray-50 dark:bg-slate-700/50 rounded-xl border border-gray-100 dark:border-slate-600">
                      {/* Show formula if present */}
                      {card.formula && (
                        <div className="mb-3 p-3 bg-white dark:bg-slate-600/50 rounded-lg border border-gray-200 dark:border-slate-500">
                          <Formula latex={card.formula} display />
                        </div>
                      )}
                      {/* Show image if present */}
                      {(card.question_image || card.answer_image) && (
                        <div className="mb-3">
                          <img
                            src={`data:${card.image_mime || 'image/png'};base64,${card.answer_image || card.question_image}`}
                            alt="Card image"
                            className="max-h-40 rounded-lg border border-gray-200 dark:border-slate-600"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                          />
                        </div>
                      )}
                      <p className="text-xs font-medium text-gray-400 dark:text-slate-500 uppercase tracking-wide mb-1">Answer</p>
                      <FormattedText text={card.answer} className="text-gray-700 dark:text-gray-200 leading-relaxed" />
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  {card.is_mastered && (
                    <span className="text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-2.5 py-1 rounded-full font-medium">
                      ✅ Mastered
                    </span>
                  )}
                  <span className="text-xs text-gray-400 dark:text-slate-500 font-mono">
                    EF {card.ease_factor.toFixed(1)} · {card.interval_days}d
                  </span>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDelete(card.id); }}
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-300 dark:text-slate-600 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all"
                    title="Delete card"
                  >
                    ✕
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
