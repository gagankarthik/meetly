import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { cn, formatDuration, formatRelative, groupByDay } from '@/lib/utils';
import type { MeetingRecord, MeetingSummary, TranscriptSegment } from '@shared/types';
import {
  Search, Trash2, FileText, Sparkles, ListTodo, FolderClock, MessageSquare, ChevronLeft, ChevronRight,
} from 'lucide-react';
import { ChatPanel } from './ChatPanel';
import { motion } from 'framer-motion';

type Tab = 'transcript' | 'summary' | 'chat';

export function Library() {
  const [meetings, setMeetings] = useState<MeetingRecord[]>([]);
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [summary, setSummary] = useState<MeetingSummary | null>(null);
  const [transcript, setTranscript] = useState<TranscriptSegment[]>([]);

  useEffect(() => {
    window.meetly.meetings.list().then(setMeetings);
  }, []);

  const filtered = useMemo(() => {
    if (!query) return meetings;
    const q = query.toLowerCase();
    return meetings.filter((m) => m.title.toLowerCase().includes(q));
  }, [meetings, query]);

  const groups = useMemo(() => groupByDay(filtered), [filtered]);
  const selected = meetings.find((m) => m.id === selectedId) || null;

  useEffect(() => {
    if (!selectedId) { setSummary(null); setTranscript([]); return; }
    Promise.all([
      window.meetly.meetings.loadSummary(selectedId),
      window.meetly.meetings.loadTranscript(selectedId),
    ]).then(([s, t]) => { setSummary(s); setTranscript(t); });
  }, [selectedId]);

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this meeting and all its data?')) return;
    await window.meetly.meetings.delete(id);
    const fresh = await window.meetly.meetings.list();
    setMeetings(fresh);
    setSelectedId(null);  // back to list
  };

  if (selected) {
    return (
      <Detail
        meeting={selected}
        summary={summary}
        transcript={transcript}
        onBack={() => setSelectedId(null)}
        onDelete={() => handleDelete(selected.id)}
      />
    );
  }

  return (
    <div className="h-full flex flex-col bg-paper-50">
      {/* Header: search */}
      <div className="px-8 pt-7 pb-4 border-b border-paper-900/[0.06]">
        <h1 className="text-[22px] font-semibold tracking-tight text-paper-900">Transcripts</h1>
        <p className="mt-1 text-[12.5px] text-paper-500">
          Every meeting you've recorded — open one to see its transcript, summary, and chat.
        </p>
        <label className="relative block mt-4 max-w-md">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-paper-500" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search meetings by title"
            className="w-full h-10 pl-9 pr-3 rounded-lg bg-paper-100 border border-paper-900/[0.07] text-[13px] text-paper-900 placeholder-paper-500 focus:border-accent-500/40 focus:bg-paper-50"
          />
        </label>
      </div>

      {/* List body */}
      <div className="flex-1 overflow-y-auto px-8 py-5">
        {meetings.length === 0 ? (
          <div className="grid place-items-center h-full">
            <div className="text-center max-w-[360px]">
              <div className="w-12 h-12 mx-auto rounded-2xl bg-paper-100 border border-paper-900/[0.06] grid place-items-center text-paper-500 mb-4">
                <FolderClock size={20} />
              </div>
              <h2 className="text-[16px] font-semibold text-paper-900">No meetings yet</h2>
              <p className="mt-2 text-[12.5px] text-paper-500 leading-relaxed">
                Click <span className="font-medium text-paper-700">+ New meeting</span> in the sidebar to record one.
                Your transcript, summary, and chat will appear here.
              </p>
            </div>
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-center text-[12.5px] text-paper-500 mt-10">No meetings match "{query}".</p>
        ) : (
          <div className="space-y-6 max-w-4xl mx-auto">
            {groups.map((g) => (
              <div key={g.label}>
                <div className="mb-2 eyebrow text-paper-500">{g.label}</div>
                <div className="space-y-1.5">
                  {g.items.map((m) => (
                    <MeetingCard key={m.id} meeting={m} onClick={() => setSelectedId(m.id)} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function MeetingCard({ meeting, onClick }: { meeting: MeetingRecord; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="group w-full text-left flex items-center gap-4 px-4 py-3 rounded-xl bg-paper-50 border border-paper-900/[0.06] hover:border-paper-900/[0.14] hover:shadow-[0_1px_0_0_rgba(15,15,13,0.04)] transition-all"
    >
      <div className="h-10 w-10 shrink-0 rounded-lg bg-accent-50 grid place-items-center text-accent-600">
        <FileText size={16} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-[13.5px] text-paper-900 truncate">{meeting.title}</span>
          {meeting.status === 'recording' && (
            <span className="text-[9px] uppercase font-semibold tracking-wide text-signal-live">live</span>
          )}
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-[11.5px] text-paper-500">
          <span>{formatRelative(meeting.startedAt)}</span>
          {meeting.durationSec ? (
            <>
              <span className="text-paper-400">·</span>
              <span className="font-mono tabular-nums">{formatDuration(meeting.durationSec)}</span>
            </>
          ) : null}
          {meeting.hasSummary && <><span className="text-paper-400">·</span><span>summary</span></>}
        </div>
      </div>
      <ChevronRight size={14} className="text-paper-400 group-hover:text-paper-700 transition-colors" />
    </button>
  );
}

function Detail({
  meeting, summary, transcript, onBack, onDelete,
}: {
  meeting: MeetingRecord;
  summary: MeetingSummary | null;
  transcript: TranscriptSegment[];
  onBack: () => void;
  onDelete: () => void;
}) {
  const [tab, setTab] = useState<Tab>('transcript');

  return (
    <div className="h-full flex flex-col bg-paper-50">
      <div className="px-6 pt-5 pb-3 border-b border-paper-900/[0.06]">
        <div className="flex items-center justify-between gap-3">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ChevronLeft size={13} /> Back
          </Button>
          <Button variant="ghost" size="sm" onClick={onDelete}>
            <Trash2 size={12} /> Delete
          </Button>
        </div>
        <div className="mt-3">
          <h1 className="text-[20px] font-semibold tracking-tight text-paper-900 truncate">{meeting.title}</h1>
          <div className="mt-1 flex items-center gap-2 text-[11.5px] text-paper-500">
            <span>
              {new Date(meeting.startedAt).toLocaleString(undefined, {
                weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
              })}
            </span>
            {meeting.durationSec && (
              <>
                <span className="text-paper-400">·</span>
                <span className="font-mono tabular-nums">{formatDuration(meeting.durationSec)}</span>
              </>
            )}
          </div>
        </div>

        <div className="mt-4 flex items-center gap-1">
          <TabButton active={tab === 'transcript'} onClick={() => setTab('transcript')} icon={<FileText size={11} />}>Transcript</TabButton>
          <TabButton active={tab === 'summary'}    onClick={() => setTab('summary')}    icon={<Sparkles size={11} />}>Summary</TabButton>
          <TabButton active={tab === 'chat'}       onClick={() => setTab('chat')}       icon={<MessageSquare size={11} />}>Chat</TabButton>
        </div>
      </div>

      <div className="flex-1 min-h-0 flex flex-col">
        {tab === 'transcript' && (
          <div className="flex-1 min-h-0 overflow-y-auto">
            <div className="max-w-3xl mx-auto px-8 py-6">
              <TranscriptView segments={transcript} />
            </div>
          </div>
        )}
        {tab === 'summary' && (
          <div className="flex-1 min-h-0 overflow-y-auto">
            <div className="max-w-3xl mx-auto px-8 py-6 space-y-8">
              <SummaryView summary={summary} />
              {summary && summary.actionItems.length > 0 && (
                <div>
                  <div className="eyebrow text-paper-500 mb-2.5">Action items</div>
                  <ActionsView summary={summary} />
                </div>
              )}
            </div>
          </div>
        )}
        {tab === 'chat' && (
          <ChatPanel meeting={meeting} summary={summary} transcript={transcript} />
        )}
      </div>
    </div>
  );
}

function TabButton({ active, onClick, children, icon }: { active: boolean; onClick: () => void; children: React.ReactNode; icon: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'relative inline-flex items-center gap-1.5 px-3 h-8 rounded-md text-[12px] font-medium transition-colors',
        active ? 'text-paper-900' : 'text-paper-500 hover:text-paper-900',
      )}
    >
      {icon}
      {children}
      {active && (
        <motion.span
          layoutId="lib-tab-underline"
          className="absolute -bottom-[1px] left-3 right-3 h-px bg-accent-600"
        />
      )}
    </button>
  );
}

function SummaryView({ summary }: { summary: MeetingSummary | null }) {
  if (!summary) return <Empty icon={<Sparkles size={18} />} title="No summary yet" body="Summaries generate automatically after a meeting ends." />;
  return (
    <div className="space-y-7">
      <p className="text-[16px] leading-relaxed text-paper-900">{summary.oneLine}</p>
      {summary.bullets.length > 0 && (
        <Section title="Key points">
          <ul className="space-y-2">
            {summary.bullets.map((b, i) => (
              <li key={i} className="flex gap-2.5 text-[13.5px] text-paper-800 leading-relaxed">
                <span className="text-accent-600 mt-1.5 shrink-0">•</span>
                <span>{b}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}
      {summary.decisions.length > 0 && (
        <Section title="Decisions">
          <ul className="space-y-2">
            {summary.decisions.map((d, i) => (
              <li key={i} className="text-[13.5px] text-paper-800 leading-relaxed">{d}</li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}

function TranscriptView({ segments }: { segments: TranscriptSegment[] }) {
  if (segments.length === 0) return <Empty icon={<FileText size={18} />} title="No transcript saved" body="Recording produces a saved transcript automatically." />;
  return (
    <div className="space-y-4">
      {segments.map((s) => (
        <div key={s.id} className="space-y-1">
          <div className={cn('eyebrow', s.speaker === 'You' ? 'text-accent-600' : 'text-signal-ai')}>
            {s.speaker}
          </div>
          <p className="text-[13.5px] leading-relaxed text-paper-900">{s.text}</p>
        </div>
      ))}
    </div>
  );
}

function ActionsView({ summary }: { summary: MeetingSummary | null }) {
  const items = summary?.actionItems || [];
  if (items.length === 0) return <Empty icon={<ListTodo size={18} />} title="No action items detected" body="If decisions were made or items assigned, they'll show up here." />;
  return (
    <ul className="space-y-2">
      {items.map((a, i) => (
        <li key={i} className="flex items-start gap-3 p-3.5 rounded-lg bg-paper-100 border border-paper-900/[0.05]">
          <span className="mt-1 w-1.5 h-1.5 rounded-full bg-accent-600 shrink-0" />
          <div className="flex-1">
            <p className="text-[13px] text-paper-900">{a.text}</p>
            <div className="mt-1 flex items-center gap-2 text-[11px] text-paper-500">
              {a.owner && <span><span className="text-paper-400">owner</span> {a.owner}</span>}
              {a.due && <span><span className="text-paper-400">due</span> {a.due}</span>}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="eyebrow text-paper-500 mb-2.5">{title}</div>
      {children}
    </div>
  );
}

function Empty({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="py-16 flex flex-col items-center text-center">
      <div className="w-10 h-10 rounded-xl bg-paper-100 border border-paper-900/[0.05] grid place-items-center text-paper-500 mb-3.5">
        {icon}
      </div>
      <div className="text-[14px] font-medium text-paper-900">{title}</div>
      <p className="mt-1 text-[12px] text-paper-500 max-w-xs">{body}</p>
    </div>
  );
}
