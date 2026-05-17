import { Camera } from 'lucide-react';
import type { MeetingMode } from '@shared/types';
import { cn } from '@/lib/utils';

const PROMPTS: Record<MeetingMode, string[]> = {
  general:   ['Summarize the last 30s', 'What\'s being asked?', 'Suggest a response'],
  interview: ['Suggest a STAR answer', 'Probe deeper question', 'What\'s a strong follow-up?'],
  sales:     ['Handle this objection', 'Discovery question', 'Reframe value'],
  standup:   ['What blockers were raised?', 'My update', 'Next-step suggestion'],
};

interface Props {
  mode: MeetingMode;
  onSelect: (prompt: string) => void;
  onScreenshot: () => void;
  recording?: boolean;
}

export function QuickPrompts({ mode, onSelect, onScreenshot, recording }: Props) {
  return (
    <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 -mx-1 px-1">
      <button
        onClick={onScreenshot}
        title="Capture screen and ask"
        className={cn(
          'no-drag shrink-0 inline-flex items-center gap-1 h-6 px-2 rounded-full text-[10.5px] font-medium transition-all',
          recording
            ? 'bg-white/60 text-paper-800 hover:bg-white/80'
            : 'bg-paper-100 text-paper-700 hover:bg-paper-200',
        )}
      >
        <Camera size={10} /> Screen
      </button>
      {PROMPTS[mode].map((p) => (
        <button
          key={p}
          onClick={() => onSelect(p)}
          className={cn(
            'no-drag shrink-0 h-6 px-2 rounded-full text-[10.5px] font-medium transition-all',
            recording
              ? 'bg-white/45 text-paper-800 hover:bg-white/70'
              : 'bg-paper-100 text-paper-700 hover:bg-paper-200',
          )}
        >
          {p}
        </button>
      ))}
    </div>
  );
}
