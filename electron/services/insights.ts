// Proactive insights loop. While a meeting is being transcribed, this samples the
// recent transcript every TICK_MS and asks OpenAI whether anything is worth
// surfacing to the user without them asking. Hits land via IpcChannel.AiInsight.
import { BrowserWindow } from 'electron';
import { IpcChannel } from '@shared/types';
import { generateInsight } from './openai';
import { getRecentFinals, getActiveMeetingId } from './deepgram';

const TICK_MS = 25_000;
const MIN_NEW_FINALS = 2;   // skip the tick if not enough new transcript landed

interface LoopContext {
  meetingId: string;
  mode?: string;
  briefing?: string;
}

let timer: NodeJS.Timeout | null = null;
let ctx: LoopContext | null = null;
let lastAnalyzedCount = 0;
let recentTitles: string[] = [];   // for cheap dedupe

export function startInsightsLoop(input: LoopContext): void {
  stopInsightsLoop();
  ctx = input;
  lastAnalyzedCount = 0;
  recentTitles = [];
  timer = setInterval(tick, TICK_MS);
}

export function stopInsightsLoop(): void {
  if (timer) clearInterval(timer);
  timer = null;
  ctx = null;
  lastAnalyzedCount = 0;
  recentTitles = [];
}

export function updateInsightContext(patch: Partial<LoopContext>): void {
  if (!ctx) return;
  ctx = { ...ctx, ...patch };
}

async function tick(): Promise<void> {
  if (!ctx) return;
  if (getActiveMeetingId() !== ctx.meetingId) return;

  const finals = getRecentFinals();
  if (finals.length - lastAnalyzedCount < MIN_NEW_FINALS) return;
  lastAnalyzedCount = finals.length;

  try {
    const insight = await generateInsight({
      segments: finals,
      mode: ctx.mode,
      briefing: ctx.briefing,
    });
    if (!insight) return;

    // Cheap dedupe: skip if title nearly matches one we sent recently
    const norm = insight.title.toLowerCase().trim();
    if (recentTitles.some((t) => similar(t, norm))) return;
    recentTitles.push(norm);
    if (recentTitles.length > 6) recentTitles.shift();

    BrowserWindow.getAllWindows().forEach((w) => {
      if (!w.isDestroyed()) w.webContents.send(IpcChannel.AiInsight, insight);
    });
  } catch (e: any) {
    console.error('[insights] tick failed', e?.message || e);
  }
}

function similar(a: string, b: string): boolean {
  if (a === b) return true;
  // crude: same if 4+ leading words match
  const aw = a.split(/\s+/).slice(0, 4).join(' ');
  const bw = b.split(/\s+/).slice(0, 4).join(' ');
  return aw === bw;
}
