import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, BookOpen } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { MeetingMode } from '@shared/types';
import { useBriefing } from '@/stores/briefing';

const MODES: { id: MeetingMode; label: string }[] = [
  { id: 'general',   label: 'General' },
  { id: 'interview', label: 'Interview' },
  { id: 'sales',     label: 'Sales' },
  { id: 'standup',   label: 'Standup' },
];

// Collapsible meeting-prep block. When expanded, the user can pick a mode and
// paste context (resume, deck notes, ticket details) that Meetly will use as
// authoritative background for the whole meeting.
export function BriefingPanel() {
  const { title, mode, context, setTitle, setMode, setContext } = useBriefing();
  const [open, setOpen] = useState(false);
  const hasContext = !!context.trim();

  return (
    <div className="rounded-xl border border-paper-900/[0.06] bg-paper-50 overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="no-drag w-full flex items-center justify-between gap-2 px-3 h-9 hover:bg-paper-100/60 transition-colors"
      >
        <span className="flex items-center gap-2 min-w-0">
          <BookOpen size={12} className="text-accent-600 shrink-0" />
          <span className="text-[12px] font-medium text-paper-900">Meeting prep</span>
          <span className="text-[10.5px] text-paper-500 truncate">
            · {MODES.find((m) => m.id === mode)?.label}
            {hasContext && ' · context loaded'}
          </span>
        </span>
        <ChevronDown size={12} className={cn('text-paper-500 transition-transform', open && 'rotate-180')} />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="border-t border-paper-900/[0.05]"
          >
            <div className="p-3 space-y-2.5">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Meeting title (optional)"
                className="no-drag w-full h-8 px-2.5 rounded-md bg-paper-100 border border-paper-900/[0.07] text-[12px] text-paper-900 placeholder-paper-500 focus:border-accent-500/40"
              />
              <div className="flex items-center gap-1">
                {MODES.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setMode(m.id)}
                    className={cn(
                      'no-drag flex-1 h-7 rounded-md text-[10.5px] font-medium transition-all',
                      mode === m.id
                        ? 'bg-accent-600 text-white shadow-sm'
                        : 'bg-paper-100 text-paper-700 hover:bg-paper-200',
                    )}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
              <textarea
                value={context}
                onChange={(e) => setContext(e.target.value)}
                placeholder="Paste anything to use as context — resume, job description, deck notes, customer profile…"
                rows={4}
                className="no-drag w-full px-2.5 py-2 rounded-md bg-paper-100 border border-paper-900/[0.07] text-[11.5px] text-paper-900 placeholder-paper-500 focus:border-accent-500/40 resize-none leading-relaxed"
              />
              <p className="text-[10px] text-paper-500">
                Context is sent with every AI answer during the meeting — never stored on a server.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
