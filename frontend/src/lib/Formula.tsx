'use client';

import { useEffect, useRef } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';

interface FormulaProps {
  latex: string;
  display?: boolean;
  className?: string;
}

export default function Formula({ latex, display = false, className = '' }: FormulaProps) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (ref.current && latex) {
      // Strip $ or $$ delimiters that Gemini sometimes includes
      let clean = latex.trim();
      if (clean.startsWith('$$') && clean.endsWith('$$')) {
        clean = clean.slice(2, -2).trim();
      } else if (clean.startsWith('$') && clean.endsWith('$')) {
        clean = clean.slice(1, -1).trim();
      }
      try {
        katex.render(clean, ref.current, {
          displayMode: display,
          throwOnError: false,
          trust: true,
        });
      } catch {
        if (ref.current) {
          ref.current.textContent = clean;
        }
      }
    }
  }, [latex, display]);

  if (!latex) return null;

  return (
    <span
      ref={ref}
      className={`${display ? 'block text-center my-4' : 'inline'} ${className}`}
    />
  );
}
