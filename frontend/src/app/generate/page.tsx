'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { generateFromText, generateFromFile } from '@/lib/api';

function GenerateContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const presetDeckId = searchParams.get('deck_id');

  const [tab, setTab] = useState<'paste' | 'upload'>('paste');
  const [text, setText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [deckName, setDeckName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ deckId: number; count: number } | null>(null);

  const handleGenerate = async () => {
    setError('');
    setLoading(true);
    try {
      let res;
      if (tab === 'paste') {
        if (!text.trim()) {
          setError('Please paste some notes first');
          setLoading(false);
          return;
        }
        res = await generateFromText(text, presetDeckId ? Number(presetDeckId) : undefined, deckName || undefined);
      } else {
        if (!file) {
          setError('Please select a file');
          setLoading(false);
          return;
        }
        res = await generateFromFile(file, presetDeckId ? Number(presetDeckId) : undefined, deckName || undefined);
      }
      setResult({ deckId: res.deck_id, count: res.cards_generated });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  if (result) {
    return (
      <div className="max-w-lg mx-auto text-center py-16">
        <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
          <span className="text-4xl">🎉</span>
        </div>
        <h1 className="page-title text-center mb-2">Cards Generated!</h1>
        <p className="page-subtitle text-center mb-8">
          {result.count} flashcards were created and added to your deck.
        </p>
        <div className="flex gap-3 justify-center flex-wrap">
          <button
            onClick={() => router.push(`/decks/${result.deckId}`)}
            className="btn-primary flex items-center gap-2"
          >
            📚 View Deck
          </button>
          <button
            onClick={() => router.push(`/review/${result.deckId}`)}
            className="btn-secondary flex items-center gap-2"
          >
            📝 Start Reviewing
          </button>
          <button
            onClick={() => { setResult(null); setText(''); setFile(null); setDeckName(''); }}
            className="btn-secondary flex items-center gap-2"
          >
            ✨ Generate More
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="page-title mb-2">Generate Flashcards</h1>
      <p className="page-subtitle mb-8">
        Paste your notes or upload a file — Gemini AI will create Q&A flashcards for you.
      </p>

      {/* Deck name */}
      <div className="mb-6">
        <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Deck Name</label>
        <input
          type="text"
          value={deckName}
          onChange={(e) => setDeckName(e.target.value)}
          placeholder="e.g. Biology Chapter 5"
          className="input"
        />
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-4">
        {[
          { key: 'paste' as const, label: 'Paste Notes', icon: '📋' },
          { key: 'upload' as const, label: 'Upload File', icon: '📁' },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 ${
              tab === t.key
                ? 'bg-brand-600 text-white shadow-md shadow-brand-500/25'
                : 'bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-slate-600'
            }`}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* Input area */}
      <div className="card mb-6">
        {tab === 'paste' ? (
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Paste your study notes here... The more content you provide, the more flashcards will be generated."
            className="textarea min-h-[300px]"
          />
        ) : (
          <div>
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                const dropped = e.dataTransfer.files?.[0];
                if (dropped) {
                  const ext = dropped.name.split('.').pop()?.toLowerCase();
                  if (['txt', 'pdf', 'docx'].includes(ext || '')) {
                    setFile(dropped);
                    setTab('upload');
                  } else {
                    setError('Unsupported file type. Please use TXT, PDF, or DOCX.');
                  }
                }
              }}
              className={`border-2 border-dashed rounded-2xl p-12 text-center transition-all cursor-pointer group ${
                dragOver
                  ? 'border-brand-500 bg-brand-50 dark:bg-brand-500/10 scale-[1.02]'
                  : 'border-gray-200 dark:border-slate-600 hover:border-brand-400 dark:hover:border-brand-500'
              }`}
            >
              <input
                type="file"
                accept=".txt,.pdf,.docx"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="hidden"
                id="file-upload"
              />
              <label htmlFor="file-upload" className="cursor-pointer">
                <div className={`w-16 h-16 mx-auto mb-4 rounded-2xl flex items-center justify-center transition-all ${
                  dragOver
                    ? 'bg-brand-100 dark:bg-brand-500/20 scale-110'
                    : 'bg-gray-100 dark:bg-slate-700 group-hover:bg-brand-50 dark:group-hover:bg-brand-500/10'
                }`}>
                  <span className={`text-3xl transition-transform ${dragOver ? 'scale-110' : ''}`}>{file ? '📄' : '📁'}</span>
                </div>
                {file ? (
                  <div>
                    <p className="font-semibold text-gray-900 dark:text-white">{file.name}</p>
                    <p className="text-sm text-gray-400 dark:text-slate-500 mt-1">
                      {(file.size / 1024).toFixed(1)} KB — Click or drop to change
                    </p>
                  </div>
                ) : dragOver ? (
                  <div>
                    <p className="font-semibold text-brand-600 dark:text-brand-400">Drop your file here</p>
                    <p className="text-sm text-brand-500 dark:text-brand-400/70 mt-1">Release to upload</p>
                  </div>
                ) : (
                  <div>
                    <p className="font-semibold text-gray-600 dark:text-gray-300">Drop a file here or click to browse</p>
                    <p className="text-sm text-gray-400 dark:text-slate-500 mt-1">Supports TXT, PDF, DOCX</p>
                  </div>
                )}
              </label>
            </div>
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-4 rounded-xl mb-4 text-sm font-medium border border-red-200 dark:border-red-800/50">
          {error}
        </div>
      )}

      {/* Generate button */}
      <button
        onClick={handleGenerate}
        disabled={loading}
        className="btn-primary w-full py-3.5 text-lg flex items-center justify-center gap-2"
      >
        {loading ? (
          <>
            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            Generating with Gemini AI...
          </>
        ) : (
          '✨ Generate Flashcards'
        )}
      </button>
    </div>
  );
}

export default function GeneratePage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-20">
          <div className="flex items-center gap-3 text-gray-400 dark:text-slate-500">
            <div className="w-5 h-5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
            <span>Loading...</span>
          </div>
        </div>
      }
    >
      <GenerateContent />
    </Suspense>
  );
}
