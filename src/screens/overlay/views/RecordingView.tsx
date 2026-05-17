import { RefObject } from 'react';
import { useMeeting } from '@/stores/meeting';
import { useInsights } from '@/stores/insights';
import { Pause, Play, Square } from 'lucide-react';
import { cn, formatDuration } from '@/lib/utils';
import { TopPill, ChipRow, BottomBar, DarkAIPanel } from '../components/DarkOverlay';
import { InsightsPanel } from '../components/InsightsPanel';
import type { TranscriptSegment, MeetingMode } from '@shared/types';
import type { AskTurn } from '@/stores/ai';

interface Props {
  askInputRef: RefObject<HTMLTextAreaElement>;
  segments: TranscriptSegment[];
  turns: AskTurn[];
  mode: MeetingMode;
  paused: boolean;
  collapsed?: boolean;
  onAsk: (q: string) => void;
  onScreenshot: () => void;
  onStop: () => void;
  onPauseToggle: () => void;
  onHide: () => void;
  onCycleMode?: () => void;
  getMicLevel: () => number;
  getSysLevel: () => number;
}

const RECORDING_SUGGESTIONS = ['Assist', 'What should I say?', 'Follow-up questions', 'Recap'];

export function RecordingView({
  askInputRef, segments, turns, mode, paused, collapsed,
  onAsk, onScreenshot, onStop, onPauseToggle, onHide, onCycleMode,
}: Props) {
  const elapsed = useMeeting((s) => s.elapsedSec);
  const insights = useInsights((s) => s.items);
  const dismissInsight = useInsights((s) => s.dismiss);
  const lastSegments = segments.slice(-2).filter((s) => s.text.trim().length > 0);

  return (
    <div className="flex flex-col h-full gap-2 p-2">
      <TopPill
        onHide={onHide}
        collapsed={collapsed}
        recording
        paused={paused}
        elapsed={formatDuration(elapsed)}
        rightAction={
          <>
            <button
              onClick={onPauseToggle}
              aria-label={paused ? 'Resume' : 'Pause'}
              title={paused ? 'Resume' : 'Pause'}
              className={cn(
                'h-9 w-9 grid place-items-center rounded-full active:scale-95 transition-all',
                paused
                  ? 'bg-blue-500 hover:bg-blue-600 text-white'
                  : 'bg-paper-100 hover:bg-paper-200 text-paper-900',
              )}
            >
              {paused ? <Play size={13} fill="currentColor" /> : <Pause size={13} fill="currentColor" />}
            </button>
            <button
              onClick={onStop}
              aria-label="Stop"
              title="Stop meeting"
              className="h-9 w-9 grid place-items-center rounded-full bg-paper-900 text-white hover:bg-paper-800 active:scale-95 transition-all"
            >
              <Square size={12} fill="currentColor" />
            </button>
          </>
        }
      />

      {!collapsed && (
      <div className="flex-1 min-h-0 flex flex-col rounded-2xl bg-paper-50/[0.86] backdrop-blur-2xl backdrop-saturate-150 border border-paper-900/[0.12] shadow-[0_8px_30px_rgba(15,15,13,0.14)] overflow-hidden">
        <div className="flex-1 min-h-0 flex flex-col px-4 pt-3 gap-3">
          {lastSegments.length > 0 && (
            <div className="text-[11px] uppercase tracking-wide text-paper-500 font-medium">
              Live: {lastSegments[lastSegments.length - 1].speaker}
            </div>
          )}

          <div className="flex-1 min-h-0 overflow-y-auto pr-1 space-y-3">
            <InsightsPanelDark items={insights} onDismiss={dismissInsight} />
            {turns.length === 0 && insights.length === 0 ? (
              <p className="text-[13.5px] leading-relaxed text-paper-600">
                Listening… ask anything below, or wait for proactive insights to appear.
              </p>
            ) : (
              <DarkAIPanel turns={turns} />
            )}
          </div>

          <ChipRow onScreenshot={onScreenshot} onSelect={onAsk} suggestions={RECORDING_SUGGESTIONS} />
        </div>

        <BottomBar ref={askInputRef} onSubmit={onAsk} mode={mode} onCycleMode={onCycleMode} />
      </div>
      )}
    </div>
  );
}

// Wrap the existing light InsightsPanel inside a dark container. Since the panel
// already uses semantic colors per kind, we just need a slim heading swap.
function InsightsPanelDark(props: { items: any[]; onDismiss: (id: string) => void }) {
  if (props.items.length === 0) return null;
  return (
    <div>
      <div className="px-1 mb-1.5 text-[10px] uppercase tracking-wide text-paper-500 font-semibold">Insights</div>
      <InsightsPanel items={props.items} onDismiss={props.onDismiss} />
    </div>
  );
}
