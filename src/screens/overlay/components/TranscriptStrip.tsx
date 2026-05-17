import type { TranscriptSegment } from '@shared/types';
import { cn } from '@/lib/utils';
import { AnimatePresence, motion } from 'framer-motion';

interface Props {
  segments: TranscriptSegment[];
}

// Shows only the last 1-2 final lines as ambient context — does not steal focus
// from the ask input during a meeting.
export function TranscriptStrip({ segments }: Props) {
  const finals = segments.filter((s) => s.isFinal);
  const recent = finals.slice(-2);

  if (recent.length === 0) {
    return (
      <div className="px-3 py-2 border-t border-white/30">
        <p className="text-[10.5px] text-paper-500 italic">Listening…</p>
      </div>
    );
  }

  return (
    <div className="px-3 py-2 border-t border-white/30 space-y-1 max-h-[68px] overflow-hidden">
      <AnimatePresence initial={false}>
        {recent.map((s) => (
          <motion.div
            key={s.id}
            layout
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.2 }}
            className="flex items-baseline gap-1.5"
          >
            <span className={cn(
              'eyebrow shrink-0 text-[9px]',
              s.speaker === 'You' ? 'text-accent-600' : 'text-signal-ai',
            )}>
              {s.speaker}
            </span>
            <p className="text-[11.5px] leading-tight text-paper-700 truncate">{s.text}</p>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
