'use client';

import './globals.css';
import { Suspense } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ThemeProvider, useTheme } from '@/lib/ThemeContext';

const navLinks = [
  { href: '/', label: 'Dashboard', icon: '📊' },
  { href: '/decks', label: 'Decks', icon: '📚' },
  { href: '/generate', label: 'Generate', icon: '✨' },
];

function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  return (
    <button
      onClick={toggleTheme}
      className="w-10 h-10 rounded-xl flex items-center justify-center 
                 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 
                 transition-all duration-200 text-lg"
      title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
    >
      {theme === 'light' ? '🌙' : '☀️'}
    </button>
  );
}

function NavContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-slate-900 transition-colors duration-200">
      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-50 bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl border-b border-gray-200 dark:border-slate-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <Link href="/" className="flex items-center gap-3 group">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center text-white text-lg shadow-md group-hover:shadow-lg transition-shadow">
                🧠
              </div>
              <span className="text-xl font-bold bg-gradient-to-r from-brand-600 to-brand-800 dark:from-brand-400 dark:to-brand-600 bg-clip-text text-transparent">
                StudyBuddy
              </span>
            </Link>

            {/* Navigation */}
            <nav className="flex items-center gap-1">
              {navLinks.map((link) => {
                const isActive = pathname === link.href || (link.href !== '/' && pathname.startsWith(link.href));
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={`relative px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
                      isActive
                        ? 'text-brand-600 dark:text-brand-400 bg-brand-50 dark:bg-brand-500/10'
                        : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-slate-700'
                    }`}
                  >
                    <span className="mr-1.5">{link.icon}</span>
                    {link.label}
                    {isActive && (
                      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-6 h-0.5 bg-brand-500 dark:bg-brand-400 rounded-full" />
                    )}
                  </Link>
                );
              })}
            </nav>

            {/* Theme Toggle */}
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-200 dark:border-slate-700 py-6 text-center text-sm text-gray-400 dark:text-slate-500 bg-white/50 dark:bg-slate-800/50">
        <div className="flex items-center justify-center gap-2">
          <span className="text-lg">🧠</span>
          <span>StudyBuddy — AI Flashcards with Spaced Repetition</span>
        </div>
      </footer>
    </div>
  );
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider>
          <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-slate-900"><div className="w-5 h-5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" /></div>}>
            <NavContent>{children}</NavContent>
          </Suspense>
        </ThemeProvider>
      </body>
    </html>
  );
}
