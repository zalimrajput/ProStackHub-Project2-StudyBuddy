'use client';

import { useEffect, useRef, useMemo, type ReactNode } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';

interface FormattedTextProps {
  text: string;
  className?: string;
}

// ─── Inline parser & renderer ─────────────────────────────────────

type InlineToken =
  | { type: 'text'; content: string }
  | { type: 'inline-math'; content: string }
  | { type: 'bold'; content: string }
  | { type: 'italic'; content: string }
  | { type: 'code'; content: string };

function parseInlineTokens(text: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  // Tokenize math $...$, bold **...** / __...__, code `...`, italic *...* / _..._
  const regex = /(\$[^$\n]+?\$|\*\*[^*]+?\*\*|__[^_]+?__|`[^`\n]+?`|(?<!\*)\*(?!\*)[^*\n]+?\*(?!\*)|(?<!_)_(?!_)[^_\n]+?_(?!_))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({ type: 'text', content: text.slice(lastIndex, match.index) });
    }

    const raw = match[0];
    if (raw.startsWith('$') && raw.endsWith('$')) {
      tokens.push({ type: 'inline-math', content: raw.slice(1, -1).trim() });
    } else if (raw.startsWith('**') && raw.endsWith('**')) {
      tokens.push({ type: 'bold', content: raw.slice(2, -2) });
    } else if (raw.startsWith('__') && raw.endsWith('__')) {
      tokens.push({ type: 'bold', content: raw.slice(2, -2) });
    } else if (raw.startsWith('`') && raw.endsWith('`')) {
      tokens.push({ type: 'code', content: raw.slice(1, -1) });
    } else if (raw.startsWith('*') && raw.endsWith('*')) {
      tokens.push({ type: 'italic', content: raw.slice(1, -1) });
    } else if (raw.startsWith('_') && raw.endsWith('_')) {
      tokens.push({ type: 'italic', content: raw.slice(1, -1) });
    }

    lastIndex = match.index + raw.length;
  }

  if (lastIndex < text.length) {
    tokens.push({ type: 'text', content: text.slice(lastIndex) });
  }

  return tokens;
}

function renderInline(text: string): ReactNode {
  const tokens = parseInlineTokens(text);
  return tokens.map((tok, i) => {
    if (tok.type === 'inline-math') {
      return (
        <span
          key={i}
          data-katex=""
          data-latex={tok.content}
          data-display="false"
          className="mx-0.5 inline-block align-baseline"
        />
      );
    }
    if (tok.type === 'bold') {
      return (
        <strong key={i} className="font-semibold text-gray-900 dark:text-white">
          {renderInline(tok.content)}
        </strong>
      );
    }
    if (tok.type === 'italic') {
      return (
        <em key={i} className="italic text-inherit">
          {renderInline(tok.content)}
        </em>
      );
    }
    if (tok.type === 'code') {
      return (
        <code
          key={i}
          className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-slate-700 text-brand-600 dark:text-brand-300 font-mono text-[0.88em]"
        >
          {tok.content}
        </code>
      );
    }
    return <span key={i}>{tok.content}</span>;
  });
}

// ─── Block types & block parser ───────────────────────────────────

type Block =
  | { type: 'display-math'; latex: string }
  | { type: 'code-block'; code: string; language?: string }
  | { type: 'step'; stepNumber: string; content: string }
  | { type: 'bullet-list'; items: { depth: number; content: string }[] }
  | { type: 'numbered-list'; items: { num: string; content: string }[] }
  | { type: 'paragraph'; lines: string[] };

function parseBlocks(text: string): Block[] {
  if (!text) return [];

  // Step 1: Split into display math / code block chunks
  const chunks: { type: 'text' | 'display-math' | 'code-block'; content: string; language?: string }[] = [];
  const displayRegex = /(\$\$[\s\S]+?\$\$|```[\s\S]*?```)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = displayRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      chunks.push({ type: 'text', content: text.slice(lastIndex, match.index) });
    }
    const raw = match[0];
    if (raw.startsWith('$$') && raw.endsWith('$$')) {
      chunks.push({ type: 'display-math', content: raw.slice(2, -2).trim() });
    } else if (raw.startsWith('```')) {
      const firstLineEnd = raw.indexOf('\n');
      const lang = firstLineEnd !== -1 ? raw.slice(3, firstLineEnd).trim() : '';
      const code = firstLineEnd !== -1 ? raw.slice(firstLineEnd + 1, -3).trim() : raw.slice(3, -3).trim();
      chunks.push({ type: 'code-block', content: code, language: lang });
    }
    lastIndex = match.index + raw.length;
  }

  if (lastIndex < text.length) {
    chunks.push({ type: 'text', content: text.slice(lastIndex) });
  }

  const blocks: Block[] = [];

  for (const chunk of chunks) {
    if (chunk.type === 'display-math') {
      blocks.push({ type: 'display-math', latex: chunk.content });
      continue;
    }
    if (chunk.type === 'code-block') {
      blocks.push({ type: 'code-block', code: chunk.content, language: chunk.language });
      continue;
    }

    // Process regular text chunk by paragraphs (split by double newlines)
    const paraSections = chunk.content.split(/\n\s*\n+/);

    for (const section of paraSections) {
      const rawLines = section.split('\n').map((l) => l.trimEnd()).filter((l) => l.trim().length > 0);
      if (rawLines.length === 0) continue;

      let lineIdx = 0;
      while (lineIdx < rawLines.length) {
        const line = rawLines[lineIdx];
        const trimmed = line.trim();

        // 1. Check for Step line: e.g. "Step 1: Description" or "Case 2: Description"
        const stepMatch = trimmed.match(/^(?:(Step|Stage|Phase|Case|Part)\s+(\d+|[A-Za-z]+|[ivxlcdm]+)[:\-\.]\s*)(.*)$/i);
        if (stepMatch) {
          const stepPrefix = `${stepMatch[1]} ${stepMatch[2]}`;
          const stepContent = stepMatch[3];
          blocks.push({
            type: 'step',
            stepNumber: stepPrefix,
            content: stepContent,
          });
          lineIdx++;
          continue;
        }

        // 2. Check for Bullet list line: e.g. "* Item", "- Item", "• Item"
        const bulletMatch = line.match(/^(\s*)(?:(?::\s*)?[\*\-•◦▪▫◆➢▶✓✔★\+]|(?::\s*)?[\*\-])\s+(.*)$/);
        if (bulletMatch) {
          const items: { depth: number; content: string }[] = [];
          while (lineIdx < rawLines.length) {
            const bMatch = rawLines[lineIdx].match(/^(\s*)(?:(?::\s*)?[\*\-•◦▪▫◆➢▶✓✔★\+]|(?::\s*)?[\*\-])\s+(.*)$/);
            if (!bMatch) break;
            const indent = bMatch[1].length;
            items.push({
              depth: indent >= 2 ? 1 : 0,
              content: bMatch[2],
            });
            lineIdx++;
          }
          blocks.push({ type: 'bullet-list', items });
          continue;
        }

        // 3. Check for Numbered list line: e.g. "1. Item", "2) Item", "(1) Item", "a. Item", "a) Item"
        const numMatch = line.match(/^(\s*)(?:(\d+|[a-zA-Z]|[ivxlcdm]+)[\.\)]|\((\d+|[a-zA-Z]|[ivxlcdm]+)\))\s+(.*)$/);
        if (numMatch) {
          const items: { num: string; content: string }[] = [];
          while (lineIdx < rawLines.length) {
            const nMatch = rawLines[lineIdx].match(/^(\s*)(?:(\d+|[a-zA-Z]|[ivxlcdm]+)[\.\)]|\((\d+|[a-zA-Z]|[ivxlcdm]+)\))\s+(.*)$/);
            if (!nMatch) break;
            const num = nMatch[2] || nMatch[3];
            items.push({
              num,
              content: nMatch[4],
            });
            lineIdx++;
          }
          blocks.push({ type: 'numbered-list', items });
          continue;
        }

        // 4. Plain paragraph line(s)
        const paraLines: string[] = [];
        while (lineIdx < rawLines.length) {
          const curLine = rawLines[lineIdx];
          const curTrimmed = curLine.trim();

          const isStep = /^(?:(Step|Stage|Phase|Case|Part)\s+(\d+|[A-Za-z]+|[ivxlcdm]+)[:\-\.]\s*)/i.test(curTrimmed);
          const isBullet = /^(\s*)(?:(?::\s*)?[\*\-•◦▪▫◆➢▶✓✔★\+]|(?::\s*)?[\*\-])\s+/.test(curLine);
          const isNum = /^(\s*)(?:(\d+|[a-zA-Z]|[ivxlcdm]+)[\.\)]|\((\d+|[a-zA-Z]|[ivxlcdm]+)\))\s+/.test(curLine);

          if (isStep || isBullet || isNum) break;

          paraLines.push(curTrimmed);
          lineIdx++;
        }

        if (paraLines.length > 0) {
          blocks.push({ type: 'paragraph', lines: paraLines });
        }
      }
    }
  }

  return blocks;
}

// ─── Component ────────────────────────────────────────────────────

export default function FormattedText({ text, className = '' }: FormattedTextProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const blocks = useMemo(() => parseBlocks(text), [text]);

  useEffect(() => {
    if (!containerRef.current) return;
    const mathEls = containerRef.current.querySelectorAll<HTMLElement>('[data-katex]');
    mathEls.forEach((el) => {
      const latex = el.getAttribute('data-latex') || '';
      const displayMode = el.getAttribute('data-display') === 'true';
      try {
        katex.render(latex, el, { displayMode, throwOnError: false, trust: true });
      } catch {
        el.textContent = latex;
      }
    });
  }, [blocks]);

  if (!text) return null;

  return (
    <div ref={containerRef} className={`text-left space-y-2.5 ${className}`}>
      {blocks.map((block, bi) => {
        if (block.type === 'display-math') {
          return (
            <div
              key={bi}
              data-katex=""
              data-latex={block.latex}
              data-display="true"
              className="my-3 p-3.5 bg-gray-50 dark:bg-slate-700/50 rounded-xl border border-gray-100 dark:border-slate-600 overflow-x-auto text-center"
            />
          );
        }

        if (block.type === 'code-block') {
          return (
            <pre
              key={bi}
              className="my-3 p-3 bg-gray-900 text-gray-100 rounded-xl overflow-x-auto text-sm font-mono"
            >
              <code>{block.code}</code>
            </pre>
          );
        }

        if (block.type === 'step') {
          return (
            <div
              key={bi}
              className="my-2 p-3.5 rounded-xl bg-brand-50/40 dark:bg-slate-700/40 border border-brand-100/80 dark:border-slate-600/70"
            >
              <div className="flex items-start gap-3">
                <span className="inline-flex items-center justify-center px-2.5 py-1 rounded-lg bg-brand-100 dark:bg-brand-900/50 text-brand-700 dark:text-brand-300 text-xs font-bold uppercase tracking-wider flex-shrink-0 mt-0.5">
                  {block.stepNumber}
                </span>
                <div className="flex-1 leading-relaxed text-inherit">
                  {renderInline(block.content)}
                </div>
              </div>
            </div>
          );
        }

        if (block.type === 'bullet-list') {
          return (
            <ul
              key={bi}
              className="my-2.5 space-y-2 pl-6 list-disc marker:text-brand-500 dark:marker:text-brand-400"
            >
              {block.items.map((item, ii) => (
                <li
                  key={ii}
                  className={`leading-relaxed text-inherit ${
                    item.depth > 0 ? 'ml-4 list-[circle]' : ''
                  }`}
                >
                  {renderInline(item.content)}
                </li>
              ))}
            </ul>
          );
        }

        if (block.type === 'numbered-list') {
          return (
            <ol
              key={bi}
              className="my-2.5 space-y-2 pl-6 list-decimal marker:text-brand-500 dark:marker:text-brand-400"
            >
              {block.items.map((item, ii) => (
                <li key={ii} className="leading-relaxed text-inherit pl-1">
                  {renderInline(item.content)}
                </li>
              ))}
            </ol>
          );
        }

        // Paragraph
        return (
          <p key={bi} className="my-2 leading-relaxed text-inherit">
            {block.lines.map((line, li) => (
              <span key={li}>
                {li > 0 && <br />}
                {renderInline(line)}
              </span>
            ))}
          </p>
        );
      })}
    </div>
  );
}

