// (Filename kept for import stability — actual theme is light frosted glass.)
import { forwardRef, KeyboardEvent, useState } from 'react';
import {
  ChevronDown, Camera, Sparkles, ArrowUp, Zap, MoreHorizontal,
} from 'lucide-react';
import { LogoMark } from '@/components/ui/Logo';
import { cn } from '@/lib/utils';
import { renderMarkdownLite } from '@/lib/md';
import type { AskTurn } from '@/stores/ai';
import type { MeetingMode } from '@shared/types';

// ===========================================================================
// Top pill — frosted light glass, drag region, brand on left + Hide + right action
// ===========================================================================

export function TopPill({
  rightAction, onHide, recording, paused, elapsed, collapsed,
}: {
  rightAction: React.ReactNode;
  onHide: () => void;
  recording?: boolean;
  paused?: boolean;
  elapsed?: string;
  collapsed?: boolean;
}) {
  return (
    <div className="flex items-center justify-center pt-1">
      <header className="drag-region flex items-center gap-1.5 h-12 pl-2 pr-2 rounded-full bg-paper-50/[0.88] backdrop-blur-2xl backdrop-saturate-150 border border-paper-900/[0.14] shadow-[0_8px_24px_rgba(15,15,13,0.22)]">
        <div className="h-9 w-9 grid place-items-center rounded-full overflow-hidden shrink-0">
          <LogoMark size={28} />
        </div>
        {recording !== undefined && (
          <div className="px-2 flex items-center gap-2 text-paper-900">
            <span className={cn(
              'w-2 h-2 rounded-full',
              paused ? 'bg-paper-400' : 'bg-red-500 animate-pulse',
            )} />
            <span className="font-mono text-[13px] tabular-nums font-medium">{elapsed}</span>
          </div>
        )}
        <button
          onClick={onHide}
          className="no-drag inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full text-paper-800 hover:bg-paper-100 text-[12.5px] font-medium"
          title={collapsed ? 'Show' : 'Hide'}
        >
          {collapsed ? 'Show' : 'Hide'}
          <ChevronDown size={13} className={cn('transition-transform', collapsed && 'rotate-180')} />
        </button>
        <div className="no-drag flex items-center gap-1.5">{rightAction}</div>
      </header>
    </div>
  );
}

// ===========================================================================
// Chip row — inline action list under the main content
// ===========================================================================

export function ChipRow({
  onScreenshot, onSelect, suggestions,
}: {
  onScreenshot: () => void;
  onSelect: (q: string) => void;
  suggestions: string[];
}) {
  return (
    <div className="flex items-center gap-3 text-paper-700 text-[12px] overflow-x-auto pb-0.5 -mx-1 px-1 no-drag">
      <button onClick={onScreenshot} className="inline-flex items-center gap-1 hover:text-paper-900 whitespace-nowrap">
        <Camera size={11} /> Screen
      </button>
      {suggestions.map((s) => (
        <div key={s} className="flex items-center gap-3 whitespace-nowrap">
          <span className="text-paper-400">·</span>
          <button onClick={() => onSelect(s)} className="inline-flex items-center gap-1 hover:text-paper-900">
            <Sparkles size={11} /> {s}
          </button>
        </div>
      ))}
    </div>
  );
}

// ===========================================================================
// Bottom bar — textarea + mode chip on left, blue send button on right
// ===========================================================================

interface BottomBarProps {
  onSubmit: (q: string) => void;
  mode: MeetingMode;
  onCycleMode?: () => void;
}

export const BottomBar = forwardRef<HTMLTextAreaElement, BottomBarProps>(
  ({ onSubmit, mode, onCycleMode }, ref) => {
    const [val, setVal] = useState('');
    const submit = () => {
      if (!val.trim()) return;
      onSubmit(val.trim());
      setVal('');
    };
    const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
    };

    return (
      <div className="border-t border-paper-900/[0.07] px-3 py-2.5 space-y-2">
        <textarea
          ref={ref}
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={onKey}
          rows={1}
          placeholder="Ask about your screen or conversation, or ⌘ ↵ for Assist"
          className="no-drag w-full resize-none bg-transparent leading-relaxed placeholder-paper-500 text-paper-900 text-[14px] max-h-32 outline-none"
        />
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            <button
              onClick={onCycleMode}
              title="Click to cycle meeting mode"
              className="no-drag inline-flex items-center gap-1 h-6 px-2.5 rounded-full bg-paper-100 text-paper-800 text-[10.5px] hover:bg-paper-200"
            >
              <Zap size={10} /> {capitalize(mode)}
            </button>
            <button className="no-drag h-6 w-6 grid place-items-center rounded-full text-paper-500 hover:bg-paper-100 hover:text-paper-900">
              <MoreHorizontal size={11} />
            </button>
          </div>
          <button
            onClick={submit}
            disabled={!val.trim()}
            aria-label="Send"
            className={cn(
              'no-drag h-7 w-7 grid place-items-center rounded-full transition-all active:scale-95',
              val.trim()
                ? 'bg-blue-500 hover:bg-blue-600 text-white'
                : 'bg-paper-200 text-paper-400 cursor-not-allowed',
            )}
          >
            <ArrowUp size={12} />
          </button>
        </div>
      </div>
    );
  },
);
BottomBar.displayName = 'BottomBar';

// ===========================================================================
// AI panel — light variant
// ===========================================================================

export function DarkAIPanel({ turns }: { turns: AskTurn[] }) {
  if (turns.length === 0) return null;
  return (
    <div className="space-y-5">
      {turns.map((t) => (
        <div key={t.id} className="space-y-2">
          <p className="text-[12.5px] text-paper-600 italic leading-snug">"{t.question}"</p>
          <div className="flex items-start gap-2">
            <Sparkles size={13} className="text-accent-600 mt-1 shrink-0" />
            <div className="text-[14px] text-paper-900 flex-1 min-w-0 space-y-2">
              {t.answer
                ? <>{renderMarkdownLite(t.answer)}</>
                : <span className="text-paper-500">Thinking…</span>}
              {t.status === 'streaming' && t.answer && (
                <span className="inline-block w-1 h-3 align-middle bg-accent-600/70 animate-pulse" />
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function capitalize(s: string) { return s[0].toUpperCase() + s.slice(1); }
