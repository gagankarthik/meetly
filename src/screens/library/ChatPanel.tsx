import { useEffect, useRef, useState } from 'react';
import { Sparkles, ArrowUp } from 'lucide-react';
import { nanoid } from 'nanoid';
import { cn } from '@/lib/utils';
import { renderMarkdownLite } from '@/lib/md';
import type { MeetingRecord, MeetingSummary, TranscriptSegment } from '@shared/types';

interface ChatTurn {
  id: string;
  requestId?: string;
  question: string;
  answer: string;
  status: 'streaming' | 'done';
}

interface Props {
  meeting: MeetingRecord;
  summary: MeetingSummary | null;
  transcript: TranscriptSegment[];
}

// Per-meeting chat keyed by id so switching meetings preserves their separate threads
// within a single Library session. Cleared on window reload.
const chatsByMeeting = new Map<string, ChatTurn[]>();

export function ChatPanel({ meeting, summary, transcript }: Props) {
  const [turns, setTurns] = useState<ChatTurn[]>(() => chatsByMeeting.get(meeting.id) || []);
  const [val, setVal] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  // Save on every change
  useEffect(() => { chatsByMeeting.set(meeting.id, turns); }, [meeting.id, turns]);

  // Load fresh when meeting switches
  useEffect(() => {
    setTurns(chatsByMeeting.get(meeting.id) || []);
    setVal('');
  }, [meeting.id]);

  // Auto-scroll on new content
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [turns.length, turns[turns.length - 1]?.answer]);

  // Subscribe once to ai chunks; route by requestId
  useEffect(() => window.meetly.ai.onChunk(({ requestId, delta, done }) => {
    setTurns((prev) => prev.map((t) => {
      if (t.requestId !== requestId) return t;
      return {
        ...t,
        answer: t.answer + (delta || ''),
        status: done ? 'done' : 'streaming',
      };
    }));
  }), []);

  const submit = async () => {
    const q = val.trim();
    if (!q) return;
    setVal('');
    const turnId = nanoid(8);
    setTurns((prev) => [...prev, { id: turnId, question: q, answer: '', status: 'streaming' }]);

    // Build the system context for this meeting from summary + transcript
    const briefing = summaryToBriefing(meeting, summary);
    const ctxSegments = transcript.slice(-200);  // cap for large meetings

    try {
      const { requestId } = await window.meetly.ai.ask({
        question: q,
        meetingId: meeting.id,
        contextSegments: ctxSegments,
        mode: 'general',
        briefing,
      });
      setTurns((prev) => prev.map((t) => (t.id === turnId ? { ...t, requestId } : t)));
    } catch (e: any) {
      setTurns((prev) => prev.map((t) =>
        t.id === turnId ? { ...t, answer: `Error: ${e?.message || 'request failed'}`, status: 'done' } : t,
      ));
    }
  };

  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-8 py-6">
        {turns.length === 0 ? (
          <div className="text-center text-paper-500 py-10">
            <Sparkles size={20} className="mx-auto mb-3 text-paper-400" />
            <p className="text-[13px] text-paper-700 font-medium">Ask anything about this meeting</p>
            <p className="mt-1 text-[11.5px]">Answers use the saved summary + transcript as context.</p>
            <div className="mt-5 flex flex-wrap gap-2 justify-center">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => { setVal(s); }}
                  className="text-[11.5px] px-2.5 h-7 rounded-full bg-paper-100 text-paper-700 hover:bg-paper-200"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="max-w-2xl mx-auto space-y-5">
            {turns.map((t) => <ChatTurnRow key={t.id} turn={t} />)}
          </div>
        )}
      </div>

      <div className="border-t border-paper-900/[0.06] bg-paper-50 px-8 py-3">
        <div className="max-w-2xl mx-auto flex items-end gap-2 rounded-xl bg-paper-100 border border-paper-900/[0.07] focus-within:border-accent-500/40 px-3 py-2">
          <textarea
            value={val}
            onChange={(e) => setVal(e.target.value)}
            onKeyDown={onKey}
            rows={1}
            placeholder="Ask about this meeting…"
            className="flex-1 resize-none bg-transparent text-[13px] text-paper-900 placeholder-paper-500 outline-none max-h-32"
          />
          <button
            onClick={submit}
            disabled={!val.trim()}
            aria-label="Send"
            className={cn(
              'h-7 w-7 grid place-items-center rounded-md transition-all active:scale-95',
              val.trim() ? 'bg-accent-600 hover:bg-accent-700 text-white' : 'bg-paper-300 text-paper-500 cursor-not-allowed',
            )}
          >
            <ArrowUp size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}

function ChatTurnRow({ turn }: { turn: ChatTurn }) {
  return (
    <div className="space-y-2.5">
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-2xl bg-accent-600 text-white px-3.5 py-2 text-[13px] leading-relaxed whitespace-pre-wrap">
          {turn.question}
        </div>
      </div>
      <div className="flex items-start gap-2">
        <Sparkles size={12} className="text-accent-600 mt-1 shrink-0" />
        <div className="text-[13.5px] text-paper-900 flex-1 min-w-0 space-y-2">
          {turn.answer
            ? <>{renderMarkdownLite(turn.answer)}</>
            : <span className="text-paper-500">Thinking…</span>}
          {turn.status === 'streaming' && turn.answer && (
            <span className="inline-block w-1 h-3 align-middle bg-accent-600/70 animate-pulse" />
          )}
        </div>
      </div>
    </div>
  );
}

const SUGGESTIONS = [
  'Summarize this meeting in 3 bullets',
  'What were the main decisions?',
  'What are my action items?',
  'Who said what about the next steps?',
];

function summaryToBriefing(meeting: MeetingRecord, summary: MeetingSummary | null): string {
  const parts: string[] = [`Meeting: ${meeting.title}`];
  if (summary?.oneLine) parts.push(`Summary: ${summary.oneLine}`);
  if (summary?.bullets?.length) parts.push(`Key points:\n- ${summary.bullets.join('\n- ')}`);
  if (summary?.decisions?.length) parts.push(`Decisions:\n- ${summary.decisions.join('\n- ')}`);
  if (summary?.actionItems?.length) {
    parts.push(`Action items:\n${summary.actionItems.map((a) => `- ${a.text}${a.owner ? ` (${a.owner})` : ''}`).join('\n')}`);
  }
  return parts.join('\n\n');
}
