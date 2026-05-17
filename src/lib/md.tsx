// Minimal markdown renderer for AI answers. Supports:
//   - **bold**
//   - lines starting with "- " or "* " as bulleted list items
//   - blank lines = paragraph break
// Anything fancier (code, links, headings) is rendered as plain text so we never
// pull in a markdown library just for chat output.
import { ReactNode } from 'react';

export function renderMarkdownLite(input: string): ReactNode {
  if (!input) return null;
  // Split into blocks separated by blank lines
  const blocks = input.split(/\n\s*\n/);
  return blocks.map((block, bi) => {
    const lines = block.split('\n');
    const isBulleted = lines.every((l) => /^\s*[-*]\s+/.test(l.trim()) || l.trim() === '');
    if (isBulleted && lines.some((l) => l.trim() !== '')) {
      return (
        <ul key={bi} className="list-none space-y-1.5 my-1.5">
          {lines.filter((l) => l.trim() !== '').map((l, i) => (
            <li key={i} className="flex gap-2">
              <span className="text-accent-600 mt-1.5 shrink-0 w-1 h-1 rounded-full bg-current"></span>
              <span className="flex-1">{renderInline(l.replace(/^\s*[-*]\s+/, ''))}</span>
            </li>
          ))}
        </ul>
      );
    }
    // Treat as paragraph(s)
    return (
      <p key={bi} className="leading-relaxed whitespace-pre-wrap">
        {renderInline(block)}
      </p>
    );
  });
}

function renderInline(text: string): ReactNode {
  // Split on **bold** segments; everything else is plain text.
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) => {
    if (p.startsWith('**') && p.endsWith('**') && p.length > 4) {
      return <strong key={i} className="font-semibold text-paper-900">{p.slice(2, -2)}</strong>;
    }
    return <span key={i}>{p}</span>;
  });
}
