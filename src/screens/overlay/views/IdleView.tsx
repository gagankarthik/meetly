import { RefObject } from 'react';
import { Mic } from 'lucide-react';
import { TopPill, ChipRow, BottomBar, DarkAIPanel } from '../components/DarkOverlay';
import type { AskTurn } from '@/stores/ai';
import type { MeetingMode } from '@shared/types';

interface Props {
  status: 'idle' | 'recording' | 'paused' | 'processing' | 'finished';
  askInputRef: RefObject<HTMLTextAreaElement>;
  turns: AskTurn[];
  mode: MeetingMode;
  collapsed?: boolean;
  onAsk: (q: string) => void;
  onScreenshot: () => void;
  onStart: () => void;
  onHide: () => void;
  onCycleMode?: () => void;
}

const SUGGESTIONS = ['What should I say?', 'Suggest a response', 'Recap so far'];

export function IdleView({
  status, askInputRef, turns, mode, collapsed,
  onAsk, onScreenshot, onStart, onHide, onCycleMode,
}: Props) {
  return (
    <div className="flex flex-col h-full gap-2 p-2">
      <TopPill
        onHide={onHide}
        collapsed={collapsed}
        rightAction={
          <button
            onClick={onStart}
            aria-label="Start meeting"
            title="Start meeting"
            className="h-9 px-3.5 rounded-full bg-paper-900 text-white hover:bg-paper-800 active:scale-95 transition-all inline-flex items-center gap-1.5 text-[12.5px] font-medium"
          >
            <Mic size={12} /> Start
          </button>
        }
      />

      {!collapsed && (
      <div className="flex-1 min-h-0 flex flex-col rounded-2xl bg-paper-50/[0.86] backdrop-blur-2xl backdrop-saturate-150 border border-paper-900/[0.12] shadow-[0_8px_30px_rgba(15,15,13,0.14)] overflow-hidden">
        <div className="flex-1 min-h-0 flex flex-col px-4 pt-4 gap-3">
          <div className="flex items-center justify-between">
            <div className="text-[11px] text-paper-500">
              {status === 'processing' && 'Processing…'}
              {status === 'finished'   && 'Saved'}
              {status === 'idle'       && 'Ready'}
            </div>
            <button
              onClick={onStart}
              className="inline-flex items-center gap-1.5 h-7 px-3 rounded-full bg-blue-500 hover:bg-blue-600 text-white text-[11.5px] font-medium active:scale-[0.97] transition-all"
            >
              <Mic size={10} /> Start meeting
            </button>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto pr-1">
            {turns.length === 0 ? (
              <p className="text-[14.5px] leading-relaxed text-paper-800">
                Listens to your meeting in real time, surfaces proactive insights,
                and gives you instant answers — invisible to screen-share.
              </p>
            ) : (
              <DarkAIPanel turns={turns} />
            )}
          </div>

          <ChipRow onScreenshot={onScreenshot} onSelect={onAsk} suggestions={SUGGESTIONS} />
        </div>

        <BottomBar ref={askInputRef} onSubmit={onAsk} mode={mode} onCycleMode={onCycleMode} />
      </div>
      )}
    </div>
  );
}
