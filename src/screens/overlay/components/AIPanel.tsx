import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Sparkles } from 'lucide-react';
import type { AskTurn } from '@/stores/ai';
import { cn } from '@/lib/utils';

interface Props {
  turns: AskTurn[];
}

export function AIPanel({ turns }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [turns.length, turns[turns.length - 1]?.answer]);

  return (
    <div ref={ref} className="max-h-44 overflow-y-auto px-4 py-3 space-y-3.5">
      {turns.map((t) => <Turn key={t.id} turn={t} />)}
    </div>
  );
}

function Turn({ turn }: { turn: AskTurn }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="space-y-1.5"
    >
      <p className={cn('text-[12px] text-paper-600 italic')}>"{turn.question}"</p>
      <div className="flex items-start gap-1.5">
        <Sparkles size={11} className="text-accent-600 mt-1 shrink-0" />
        <div className={cn('text-[13px] leading-relaxed text-paper-900 whitespace-pre-wrap')}>
          {turn.answer || <span className="shimmer">Thinking…</span>}
          {turn.status === 'streaming' && turn.answer && (
            <span className="inline-block w-1 h-3 ml-0.5 align-middle bg-accent-600/70 animate-pulse" />
          )}
        </div>
      </div>
    </motion.div>
  );
}
