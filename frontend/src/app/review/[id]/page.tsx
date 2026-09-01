'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { getReviewSession, submitReview } from '@/lib/api';
import type { ReviewSession, Flashcard, ReviewResult } from '@/lib/types';
import Formula from '@/lib/Formula';
import FormattedText from '@/lib/FormattedText';
import ImageLightbox from '@/lib/ImageLightbox';

interface PendingCard {
  card: Flashcard;
  readyAt: number; // timestamp when card can be reviewed again
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function ReviewPage() {
  const params = useParams();
  const router = useRouter();
  const deckId = Number(params.id);

  const [session, setSession] = useState<ReviewSession | null>(null);
  const [cards, setCards] = useState<Flashcard[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [lastResult, setLastResult] = useState<ReviewResult | null>(null);
  const [reviewedCount, setReviewedCount] = useState(0);

  // Image lightbox state
  const [lightboxImg, setLightboxImg] = useState<{ src: string; alt: string } | null>(null);

  // "Again" cards waiting for 10 minutes
  const [pendingCards, setPendingCards] = useState<PendingCard[]>([]);
  const [waitingForPending, setWaitingForPending] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const countdownRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!deckId) return;
    getReviewSession(deckId)
      .then((s) => {
        setSession(s);
        setCards(s.cards || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [deckId]);

  const currentCard: Flashcard | undefined = cards[currentIndex];
  const totalDue = session?.due_count || 0;

  // Helper to build image data URL
  const getImageSrc = useCallback((b64: string | null, mime?: string | null) => {
    if (!b64) return '';
    return `data:${mime || 'image/png'};base64,${b64}`;
  }, []);

  // Open lightbox
  const openLightbox = useCallback((e: React.MouseEvent, b64: string | null, mime: string | null, alt: string) => {
    e.stopPropagation();
    if (!b64) return;
    setLightboxImg({ src: getImageSrc(b64, mime || 'image/png'), alt });
  }, [getImageSrc]);

  // Strip $ delimiters from formula for display
  const cleanFormula = useCallback((f: string | null): string => {
    if (!f) return '';
    let c = f.trim();
    if (c.startsWith('$$') && c.endsWith('$$')) c = c.slice(2, -2).trim();
    else if (c.startsWith('$') && c.endsWith('$')) c = c.slice(1, -1).trim();
    return c;
  }, []);

  // Countdown timer for pending cards
  useEffect(() => {
    if (!waitingForPending || pendingCards.length === 0) {
      if (countdownRef.current) clearInterval(countdownRef.current);
      return;
    }

    const updateCountdown = () => {
      const now = Date.now();
      const earliestReady = Math.min(...pendingCards.map((p) => p.readyAt));
      const remaining = Math.max(0, Math.ceil((earliestReady - now) / 1000));
      setCountdown(remaining);

      if (remaining <= 0) {
        // Time's up! Move ready cards back to queue
        if (countdownRef.current) clearInterval(countdownRef.current);

        const readyCards = pendingCards.filter((p) => Date.now() >= p.readyAt);
        const notReadyCards = pendingCards.filter((p) => Date.now() < p.readyAt);

        if (readyCards.length > 0) {
          setCards((prev) => [...prev, ...readyCards.map((p) => p.card)]);
          setPendingCards(notReadyCards);

          // Request browser notification
          if ('Notification' in window && Notification.permission === 'granted') {
            new Notification('🧠 StudyBuddy', {
              body: `${readyCards.length} card${readyCards.length > 1 ? 's' : ''} ready for review!`,
            });
          }

          // If no more pending cards, stop waiting
          if (notReadyCards.length === 0) {
            setWaitingForPending(false);
          }
        }
      }
    };

    countdownRef.current = setInterval(updateCountdown, 1000);
    updateCountdown();

    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [waitingForPending, pendingCards]);

  // Request notification permission on mount
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  const handleRate = useCallback(async (rating: string) => {
    if (!currentCard || submitting) return;
    setSubmitting(true);
    try {
      const result = await submitReview(deckId, currentCard.id, rating);
      setLastResult(result);
      setShowAnswer(false);

      setTimeout(() => {
        setLastResult(null);

        if (rating === 'again') {
          // Move card to pending — will be ready again in 10 minutes
          const readyAt = Date.now() + 10 * 60 * 1000; // 10 minutes
          setPendingCards((prev) => [...prev, { card: currentCard, readyAt }]);

          // Remove from current queue
          setCards((prev) => prev.filter((_, idx) => idx !== currentIndex));

          // Check if we've run out of regular cards
          if (cards.length <= 1) {
            // All regular cards done, start waiting for pending
            setWaitingForPending(true);
          } else {
            setCurrentIndex((i) => Math.min(i, Math.max(0, cards.length - 2)));
          }
        } else {
          // Remove card from queue (reviewed successfully)
          setCards((prev) => prev.filter((_, idx) => idx !== currentIndex));
          setCurrentIndex((i) => Math.min(i, Math.max(0, cards.length - 2)));
          setReviewedCount((c) => c + 1);
        }
      }, 600);
    } catch (e) {
      console.error(e);
    } finally {
      setSubmitting(false);
    }
  }, [currentCard, deckId, submitting, currentIndex, cards.length]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (submitting) return;
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        if (!showAnswer) setShowAnswer(true);
      }
      if (showAnswer) {
        if (e.key === '1') handleRate('again');
        if (e.key === '2') handleRate('hard');
        if (e.key === '3') handleRate('good');
        if (e.key === '4') handleRate('easy');
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [showAnswer, handleRate, submitting]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="flex items-center gap-3 text-gray-400 dark:text-slate-500">
          <div className="w-5 h-5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
          <span>Loading review session...</span>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="text-center py-20">
        <div className="text-5xl mb-4">🔍</div>
        <p className="text-red-400 mb-4 font-medium">Could not load deck</p>
        <Link href="/decks" className="btn-secondary">← Back to Decks</Link>
      </div>
    );
  }

  // No cards at all (nothing due)
  if (cards.length === 0 && pendingCards.length === 0) {
    return (
      <div className="text-center py-20">
        <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
          <span className="text-4xl">🎉</span>
        </div>
        <h1 className="page-title text-center mb-2">All caught up!</h1>
        <p className="page-subtitle text-center mb-6">No cards to review in this deck right now.</p>
        <Link href={`/decks/${deckId}`} className="btn-primary">View Deck</Link>
      </div>
    );
  }

  // Waiting for "Again" cards to become ready
  if (waitingForPending && cards.length === 0 && pendingCards.length > 0) {
    return (
      <div className="max-w-lg mx-auto text-center py-16">
        <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-brand-100 dark:bg-brand-900/30 flex items-center justify-center">
          <span className="text-4xl">⏰</span>
        </div>
        <h1 className="page-title text-center mb-2">Waiting for Again Cards</h1>
        <p className="page-subtitle text-center mb-4">
          {pendingCards.length} card{pendingCards.length > 1 ? 's' : ''} will be ready again in:
        </p>

        {/* Countdown */}
        <div className="text-6xl font-mono font-bold text-brand-600 dark:text-brand-400 mb-6">
          {formatTime(countdown)}
        </div>

        {/* Progress ring */}
        <div className="w-32 h-32 mx-auto mb-8 relative">
          <svg className="w-32 h-32 -rotate-90" viewBox="0 0 120 120">
            <circle cx="60" cy="60" r="54" fill="none" stroke="currentColor" strokeWidth="8"
              className="text-gray-200 dark:text-slate-700" />
            <circle cx="60" cy="60" r="54" fill="none" stroke="currentColor" strokeWidth="8"
              strokeDasharray={`${2 * Math.PI * 54}`}
              strokeDashoffset={`${2 * Math.PI * 54 * (1 - countdown / 600)}`}
              strokeLinecap="round"
              className="text-brand-500 dark:text-brand-400 transition-all duration-1000" />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-2xl">🧠</span>
          </div>
        </div>

        <p className="text-sm text-gray-400 dark:text-slate-500 mb-6">
          You can close this page and come back later. We&apos;ll notify you when ready!
        </p>

        <div className="flex gap-3 justify-center">
          <Link href={`/decks/${deckId}`} className="btn-secondary">
            📚 View Deck
          </Link>
          <Link href="/" className="btn-secondary">
            📊 Dashboard
          </Link>
        </div>
      </div>
    );
  }

  // Review complete (all cards reviewed)
  if (cards.length === 0 && pendingCards.length === 0) {
    return (
      <div className="text-center py-20">
        <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-yellow-100 dark:bg-yellow-900/30 flex items-center justify-center">
          <span className="text-4xl">🏆</span>
        </div>
        <h1 className="page-title text-center mb-2">Review Complete!</h1>
        <p className="page-subtitle text-center mb-6">
          You reviewed {reviewedCount} cards. Keep going — consistent practice builds mastery!
        </p>
        <div className="flex gap-3 justify-center">
          <Link href={`/decks/${deckId}`} className="btn-primary">View Deck</Link>
          <Link href="/" className="btn-secondary">Dashboard</Link>
        </div>
      </div>
    );
  }

  const ratingButtons = [
    { key: 'again', label: 'Again', emoji: '🔴', desc: 'Didn\'t know', bg: 'bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800/50', sub: '10 min' },
    { key: 'hard', label: 'Hard', emoji: '🟠', desc: 'Struggled', bg: 'bg-orange-50 dark:bg-orange-900/20 hover:bg-orange-100 dark:hover:bg-orange-900/30 text-orange-700 dark:text-orange-400 border-orange-200 dark:border-orange-800/50', sub: '1 day' },
    { key: 'good', label: 'Good', emoji: '🟢', desc: 'Got it', bg: 'bg-green-50 dark:bg-green-900/20 hover:bg-green-100 dark:hover:bg-green-900/30 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800/50', sub: '3 days' },
    { key: 'easy', label: 'Easy', emoji: '🔵', desc: 'No brainer', bg: 'bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800/50', sub: '7 days' },
  ];

  return (
    <div className="max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <Link href={`/decks/${deckId}`} className="text-sm text-gray-400 dark:text-slate-500 hover:text-brand-600 dark:hover:text-brand-400 transition-colors font-medium">
          ← {session.deck_name}
        </Link>
        <div className="flex items-center gap-4">
          {pendingCards.length > 0 && (
            <span className="text-xs bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 px-2.5 py-1 rounded-full font-medium">
              ⏰ {pendingCards.length} again
            </span>
          )}
          <span className="text-sm text-gray-400 dark:text-slate-500 font-mono">
            {reviewedCount + 1} / {totalDue} due
          </span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="w-full bg-gray-200 dark:bg-slate-700 rounded-full h-2.5 mb-8 overflow-hidden">
        <div
          className="bg-gradient-to-r from-brand-500 to-brand-600 h-2.5 rounded-full transition-all duration-500 ease-out"
          style={{ width: `${totalDue > 0 ? ((reviewedCount / totalDue) * 100) : 100}%` }}
        />
      </div>

      {/* Flashcard */}
      {currentCard && (
        <div
          className={`card min-h-[320px] flex flex-col items-center justify-center text-center cursor-pointer select-none transition-all duration-300 ${
            lastResult
              ? 'scale-95 opacity-50'
              : 'hover:shadow-xl'
          } ${showAnswer ? 'ring-2 ring-brand-500/30 dark:ring-brand-400/30' : ''}`}
          onClick={() => !showAnswer && !submitting && setShowAnswer(true)}
        >
          {!showAnswer ? (
            <div className="py-4">
              <div className="flex items-center justify-between mb-6">
                <p className="text-xs text-gray-400 dark:text-slate-500 uppercase tracking-widest font-semibold">Question</p>
                <div className="flex items-center gap-2">
                  {currentCard.content_type && currentCard.content_type !== 'text' && (
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      currentCard.content_type === 'formula' ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400' :
                      currentCard.content_type === 'graph' || currentCard.content_type === 'chart' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400' :
                      currentCard.content_type === 'diagram' ? 'bg-teal-100 dark:bg-teal-900/30 text-teal-600 dark:text-teal-400' :
                      currentCard.content_type === 'table' ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400' :
                      'bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-400'
                    }`}>📊 {currentCard.content_type}</span>
                  )}
                  {currentCard.source_page && (
                    <span className="text-xs text-gray-400 dark:text-slate-500 font-mono">p.{currentCard.source_page}</span>
                  )}
                </div>
              </div>
              {/* Show formula on question side if present */}
              {currentCard.formula && (
                <div className="mb-4 p-4 bg-gray-50 dark:bg-slate-700/50 rounded-xl border border-gray-100 dark:border-slate-600 overflow-x-auto">
                  <Formula latex={cleanFormula(currentCard.formula)} display />
                </div>
              )}
              {/* Show image on question side if present */}
              {currentCard.question_image && (
                <div className="mb-4">
                  <img
                    src={getImageSrc(currentCard.question_image, currentCard.image_mime)}
                    alt="Question image"
                    className="max-h-48 mx-auto rounded-xl border border-gray-200 dark:border-slate-600 cursor-pointer hover:ring-2 hover:ring-brand-400 transition-all"
                    onClick={(e) => openLightbox(e, currentCard.question_image, currentCard.image_mime, 'Question image')}
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                </div>
              )}
              <div className="text-xl md:text-2xl font-semibold text-gray-900 dark:text-white leading-relaxed max-w-lg">
                <FormattedText text={currentCard.question} />
              </div>
              <p className="text-sm text-gray-400 dark:text-slate-500 mt-10 flex items-center justify-center gap-2">
                <span className="px-2 py-0.5 bg-gray-100 dark:bg-slate-700 rounded text-xs font-mono">Space</span>
                or click to reveal
              </p>
            </div>
          ) : (
            <div className="w-full py-4">
              <p className="text-xs text-gray-400 dark:text-slate-500 mb-3 uppercase tracking-widest font-semibold">Answer</p>
              {/* Show formula on answer side if present */}
              {currentCard.formula && (
                <div className="mb-4 p-4 bg-green-50 dark:bg-green-900/20 rounded-xl border border-green-200 dark:border-green-800/50 overflow-x-auto">
                  <Formula latex={cleanFormula(currentCard.formula)} display />
                </div>
              )}
              {/* Show image on answer side if present */}
              {currentCard.answer_image && (
                <div className="mb-4">
                  <img
                    src={getImageSrc(currentCard.answer_image, currentCard.image_mime)}
                    alt="Answer image"
                    className="max-h-48 mx-auto rounded-xl border border-gray-200 dark:border-slate-600 cursor-pointer hover:ring-2 hover:ring-brand-400 transition-all"
                    onClick={(e) => openLightbox(e, currentCard.answer_image, currentCard.image_mime, 'Answer image')}
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                </div>
              )}
              {/* Also show question image on answer side if no answer image */}
              {!currentCard.answer_image && currentCard.question_image && (
                <div className="mb-4">
                  <img
                    src={getImageSrc(currentCard.question_image, currentCard.image_mime)}
                    alt="Reference image"
                    className="max-h-48 mx-auto rounded-xl border border-gray-200 dark:border-slate-600 opacity-80 cursor-pointer hover:ring-2 hover:ring-brand-400 transition-all"
                    onClick={(e) => openLightbox(e, currentCard.question_image, currentCard.image_mime, 'Reference image')}
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                </div>
              )}
              <div className="text-base md:text-lg text-gray-900 dark:text-white leading-relaxed mb-8 max-w-xl mx-auto text-left">
                <FormattedText text={currentCard.answer} />
              </div>

              {/* Rating buttons */}
              <div className="grid grid-cols-4 gap-3 mt-4">
                {ratingButtons.map((r, i) => (
                  <button
                    key={r.key}
                    onClick={(e) => { e.stopPropagation(); handleRate(r.key); }}
                    disabled={submitting}
                    className={`border rounded-2xl p-4 text-center transition-all duration-200 active:scale-95 ${r.bg}`}
                  >
                    <div className="text-xl mb-1">{r.emoji}</div>
                    <div className="font-bold text-sm">{r.label}</div>
                    <div className="text-xs opacity-60 mt-0.5">{r.desc}</div>
                    <div className="text-xs opacity-40 mt-1 font-mono">{r.sub}</div>
                    <div className="text-xs opacity-30 mt-1 font-mono">
                      <span className="px-1.5 py-0.5 bg-black/5 dark:bg-white/5 rounded">{i + 1}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Card stats */}
      {currentCard && (
        <div className="flex justify-center gap-6 mt-5 text-xs text-gray-400 dark:text-slate-500 font-mono">
          <span>Reviews: {currentCard.review_count}</span>
          <span>·</span>
          <span>Ease: {currentCard.ease_factor.toFixed(2)}</span>
          <span>·</span>
          <span>Interval: {currentCard.interval_days}d</span>
          {currentCard.is_mastered && (
            <>
              <span>·</span>
              <span className="text-green-500 dark:text-green-400">✅ Mastered</span>
            </>
          )}
        </div>
      )}
      {/* Image Lightbox */}
      {lightboxImg && (
        <ImageLightbox
          src={lightboxImg.src}
          alt={lightboxImg.alt}
          isOpen={true}
          onClose={() => setLightboxImg(null)}
        />
      )}
    </div>
  );
}
