'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getStats } from '@/lib/api';
import type { DashboardStats } from '@/lib/types';

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    getStats()
      .then(setStats)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="flex items-center gap-3 text-gray-400 dark:text-slate-500">
          <div className="w-5 h-5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
          <span>Loading dashboard...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-20">
        <div className="text-5xl mb-4">⚠️</div>
        <p className="text-red-500 mb-2 font-medium">{error}</p>
        <p className="text-gray-400 dark:text-slate-500 text-sm">Make sure the backend is running on port 8000</p>
      </div>
    );
  }

  if (!stats) return null;

  const statCards = [
    { label: 'Total Cards', value: stats.total_cards, emoji: '🃏', gradient: 'from-blue-500 to-blue-600' },
    { label: 'Due Today', value: stats.cards_due_today, emoji: '⏰', gradient: 'from-orange-500 to-amber-500' },
    { label: 'Reviews Today', value: stats.total_reviews_today, emoji: '📝', gradient: 'from-green-500 to-emerald-500' },
    { label: 'Mastered', value: stats.cards_mastered, emoji: '🏆', gradient: 'from-purple-500 to-violet-500' },
    { label: 'Study Streak', value: `${stats.study_streak}`, emoji: '🔥', gradient: 'from-red-500 to-rose-500' },
    { label: 'Decks', value: stats.total_decks, emoji: '📚', gradient: 'from-teal-500 to-cyan-500' },
  ];

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-8 gap-4">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">Your study overview at a glance</p>
        </div>
        <Link href="/generate" className="btn-primary flex items-center gap-2">
          <span>✨</span> Generate Cards
        </Link>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-10">
        {statCards.map((s) => (
          <div key={s.label} className="card relative overflow-hidden group">
            <div className={`absolute inset-0 bg-gradient-to-br ${s.gradient} opacity-[0.07] group-hover:opacity-[0.12] transition-opacity`} />
            <div className="relative">
              <div className="text-2xl mb-2">{s.emoji}</div>
              <div className="text-3xl font-bold text-gray-900 dark:text-white">{s.value}</div>
              <div className="text-xs text-gray-500 dark:text-slate-400 mt-1 font-medium">{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Due Cards Alert */}
      {stats.cards_due_today > 0 && (() => {
        const deckWithDue = stats.decks.find((d) => d.due_count > 0);
        return (
          <Link href={deckWithDue ? `/review/${deckWithDue.id}` : '/decks'}>
            <div className="mb-8 p-5 rounded-2xl bg-gradient-to-r from-orange-500/10 via-amber-500/10 to-yellow-500/10 border border-orange-200 dark:border-orange-800/50 hover:shadow-lg transition-all cursor-pointer">
              <div className="flex items-center gap-4">
                <div className="text-4xl">🔥</div>
                <div>
                  <p className="font-bold text-orange-800 dark:text-orange-300 text-lg">
                    {stats.cards_due_today} card{stats.cards_due_today !== 1 ? 's' : ''} due for review!
                  </p>
                  <p className="text-sm text-orange-600 dark:text-orange-400/80">Keep your study streak going — tap to start reviewing</p>
                </div>
              </div>
            </div>
          </Link>
        );
      })()}

      {/* Decks Section */}
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white">Your Decks</h2>
      </div>

      {stats.decks.length === 0 ? (
        <div className="card text-center py-16">
          <div className="text-5xl mb-4">📚</div>
          <p className="text-gray-500 dark:text-slate-400 mb-5 text-lg">No decks yet. Create your first flashcards!</p>
          <Link href="/generate" className="btn-primary inline-flex items-center gap-2">
            <span>✨</span> Generate Cards
          </Link>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {stats.decks.map((deck) => (
            <Link
              key={deck.id}
              href={`/decks/${deck.id}`}
              className="card group hover:shadow-lg hover:border-brand-200 dark:hover:border-brand-800 transition-all duration-200 hover:-translate-y-0.5"
            >
              <div className="flex items-start justify-between mb-3">
                <h3 className="font-bold text-lg text-gray-900 dark:text-white group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors line-clamp-1">
                  {deck.name}
                </h3>
                {deck.due_count > 0 && (
                  <span className="bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 text-xs font-bold px-2.5 py-1 rounded-full whitespace-nowrap ml-2">
                    {deck.due_count} due
                  </span>
                )}
              </div>
              {deck.description && (
                <p className="text-sm text-gray-500 dark:text-slate-400 mb-4 line-clamp-2">{deck.description}</p>
              )}
              <div className="flex items-center gap-4 text-sm text-gray-400 dark:text-slate-500">
                <span className="flex items-center gap-1">🃏 {deck.card_count} cards</span>
                <span className="flex items-center gap-1">📅 {new Date(deck.updated_at).toLocaleDateString()}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
