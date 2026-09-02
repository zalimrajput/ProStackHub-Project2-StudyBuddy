'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { listDecks, deleteDeck } from '@/lib/api';
import { useAuth } from '@/lib/AuthContext';
import type { Deck } from '@/lib/types';

export default function DecksPage() {
  const [decks, setDecks] = useState<Deck[]>([]);
  const [loading, setLoading] = useState(true);
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const load = () => {
    listDecks()
      .then(setDecks)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
      return;
    }
    if (user) load();
  }, [user, authLoading, router]);

  const handleDelete = async (id: number, name: string) => {
    if (!confirm(`Delete deck "${name}" and all its cards?`)) return;
    await deleteDeck(id);
    setDecks((prev) => prev.filter((d) => d.id !== id));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="flex items-center gap-3 text-gray-400 dark:text-slate-500">
          <div className="w-5 h-5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
          <span>Loading decks...</span>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-8 gap-4">
        <div>
          <h1 className="page-title">Decks</h1>
          <p className="page-subtitle">Manage your flashcard decks</p>
        </div>
        <Link href="/generate" className="btn-primary flex items-center gap-2">
          <span>✨</span> New Deck
        </Link>
      </div>

      {decks.length === 0 ? (
        <div className="card text-center py-16">
          <div className="text-5xl mb-4">📚</div>
          <p className="text-gray-500 dark:text-slate-400 mb-5 text-lg">No decks yet!</p>
          <Link href="/generate" className="btn-primary inline-flex items-center gap-2">
            Create Your First Deck
          </Link>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {decks.map((deck) => (
            <div key={deck.id} className="card group hover:shadow-lg transition-all duration-200">
              <div className="flex items-start justify-between mb-2">
                <Link
                  href={`/decks/${deck.id}`}
                  className="font-bold text-lg text-gray-900 dark:text-white group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors line-clamp-1"
                >
                  {deck.name}
                </Link>
                {deck.due_count > 0 && (
                  <span className="bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 text-xs font-bold px-2.5 py-1 rounded-full whitespace-nowrap ml-2">
                    {deck.due_count} due
                  </span>
                )}
              </div>
              {deck.description && (
                <p className="text-sm text-gray-500 dark:text-slate-400 mb-3 line-clamp-2">{deck.description}</p>
              )}
              <div className="flex items-center gap-4 text-sm text-gray-400 dark:text-slate-500 mb-4">
                <span className="flex items-center gap-1">🃏 {deck.card_count} cards</span>
              </div>
              <div className="flex gap-2">
                <Link
                  href={`/review/${deck.id}`}
                  className="btn-primary text-sm py-2 flex-1 text-center"
                >
                  📝 Review
                </Link>
                <button
                  onClick={() => handleDelete(deck.id, deck.name)}
                  className="px-3 py-2 rounded-xl text-gray-300 dark:text-slate-500 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all"
                  title="Delete deck"
                >
                  🗑️
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
