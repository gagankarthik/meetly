import { motion, AnimatePresence } from 'framer-motion';
import { Lightbulb, AlertTriangle, HelpCircle, Search, X } from 'lucide-react';
import type { AIInsight } from '@shared/types';
import { cn } from '@/lib/utils';

interface Props {
  items: AIInsight[];
  onDismiss: (id: string) => void;
}

export function InsightsPanel({ items, onDismiss }: Props) {
  if (items.length === 0) return null;
  return (
    <div className="space-y-1.5">
      <div className="px-1 eyebrow text-paper-500">Insights</div>
      <AnimatePresence initial={false}>
        {items.map((i) => (
          <motion.div
            key={i.id}
            layout
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, x: 8, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 420, damping: 32 }}
          >
            <InsightCard insight={i} onDismiss={() => onDismiss(i.id)} />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

function InsightCard({ insight, onDismiss }: { insight: AIInsight; onDismiss: () => void }) {
  const { tone, Icon, label } = meta(insight.kind);
  return (
    <div className={cn(
      'group relative flex items-start gap-2.5 rounded-lg border px-3 py-2.5',
      tone,
    )}>
      <Icon size={13} className="mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-semibold text-paper-900">{insight.title}</span>
          <span className="text-[9px] uppercase tracking-wide text-paper-500">{label}</span>
        </div>
        <p className="mt-0.5 text-[11.5px] text-paper-800 leading-snug">{insight.body}</p>
      </div>
      <button
        onClick={onDismiss}
        aria-label="Dismiss"
        className="opacity-0 group-hover:opacity-100 transition-opacity text-paper-500 hover:text-paper-900 shrink-0"
      >
        <X size={11} />
      </button>
    </div>
  );
}

function meta(kind: AIInsight['kind']): { tone: string; Icon: typeof Lightbulb; label: string } {
  switch (kind) {
    case 'objection-answer':
      return { tone: 'border-signal-live/25 bg-signal-live/[0.05] text-signal-live', Icon: AlertTriangle, label: 'objection' };
    case 'fact':
      return { tone: 'border-signal-ai/25 bg-signal-ai/[0.05] text-signal-ai', Icon: Search, label: 'fact-check' };
    case 'question':
      return { tone: 'border-accent-500/25 bg-accent-50/60 text-accent-700', Icon: HelpCircle, label: 'ask back' };
    case 'suggestion':
    default:
      return { tone: 'border-paper-900/[0.08] bg-paper-50 text-paper-700', Icon: Lightbulb, label: 'suggestion' };
  }
}
