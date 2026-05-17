// Streaming Deepgram transcription. Renderer captures audio (mic + system loopback),
// downsamples to 16kHz PCM16, and sends chunks via IPC. We forward to Deepgram's
// websocket and stream back finalized segments.
import WebSocket from 'ws';
import { nanoid } from 'nanoid';
import { BrowserWindow } from 'electron';
import { IpcChannel, TranscriptSegment } from '@shared/types';
import { getDeepgramKey } from './settings';

type ChannelKind = 'mic' | 'system' | 'mixed';

interface Session {
  meetingId: string;
  startedAt: number;
  ws: WebSocket | null;
  sampleRate: number;
  channels: number;
  // diarization speaker -> friendly label
  speakerLabels: Map<number, string>;
  // Rolling buffer of finalized segments so the insights loop can sample recent context
  // without a second IPC subscription. Capped to avoid unbounded growth on long meetings.
  recentFinals: TranscriptSegment[];
}

const RECENT_FINALS_CAP = 200;

let session: Session | null = null;

export function getRecentFinals(): TranscriptSegment[] {
  return session?.recentFinals ?? [];
}

export function getActiveMeetingId(): string | null {
  return session?.meetingId ?? null;
}

function buildUrl(sampleRate: number, channels: number): string {
  const params = new URLSearchParams({
    model: 'nova-3',
    encoding: 'linear16',
    sample_rate: String(sampleRate),
    channels: String(channels),
    interim_results: 'true',
    smart_format: 'true',
    punctuate: 'true',
    diarize: 'true',
    endpointing: '350',
    utterance_end_ms: '1200',
    vad_events: 'true',
  });
  return `wss://api.deepgram.com/v1/listen?${params.toString()}`;
}

export async function start(meetingId: string, sampleRate: number, channels: number): Promise<void> {
  const key = await getDeepgramKey();
  if (!key) throw new Error('Deepgram key missing. Add one in Settings or set DEEPGRAM_API_KEY in .env.');
  await stop(); // ensure no stale session

  const ws = new WebSocket(buildUrl(sampleRate, channels), {
    headers: { Authorization: `Token ${key}` },
  });

  session = {
    meetingId,
    startedAt: Date.now(),
    ws,
    sampleRate,
    channels,
    speakerLabels: new Map(),
    recentFinals: [],
  };

  ws.on('open', () => {
    console.log('[deepgram] connected');
    // KeepAlive ping every 8s to prevent idle timeout
    const ping = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'KeepAlive' }));
      else clearInterval(ping);
    }, 8000);
  });

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'Results') handleResults(msg);
    } catch (e) {
      console.error('[deepgram] parse error', e);
    }
  });

  ws.on('error', (e) => console.error('[deepgram] error', e));
  ws.on('close', (code, reason) => {
    console.log('[deepgram] closed', code, reason.toString());
  });
}

export function chunk(buffer: ArrayBuffer | Buffer): void {
  if (!session?.ws) return;
  const ws = session.ws;
  if (ws.readyState !== WebSocket.OPEN) return;
  ws.send(buffer instanceof Buffer ? buffer : Buffer.from(new Uint8Array(buffer)));
}

export async function stop(): Promise<void> {
  if (!session) return;
  const { ws } = session;
  session = null;
  if (ws && ws.readyState === WebSocket.OPEN) {
    try {
      ws.send(JSON.stringify({ type: 'CloseStream' }));
    } catch {/* */}
    await new Promise<void>((resolve) => {
      ws.once('close', () => resolve());
      setTimeout(resolve, 2000);
      ws.close();
    });
  }
}

function handleResults(msg: any) {
  if (!session) return;
  const alt = msg.channel?.alternatives?.[0];
  if (!alt?.transcript) return;
  const transcript = alt.transcript.trim();
  if (!transcript) return;

  const isFinal: boolean = !!msg.is_final;
  const words = alt.words || [];
  const startWord = words[0];
  const endWord   = words[words.length - 1];

  // Speaker — take majority diarization channel across words
  const speakerCounts = new Map<number, number>();
  for (const w of words) {
    if (typeof w.speaker === 'number') {
      speakerCounts.set(w.speaker, (speakerCounts.get(w.speaker) || 0) + 1);
    }
  }
  let speakerChan: number | null = null;
  let maxCount = 0;
  for (const [k, v] of speakerCounts) {
    if (v > maxCount) { maxCount = v; speakerChan = k; }
  }

  const speakerLabel = resolveSpeakerLabel(speakerChan);

  const segment: TranscriptSegment = {
    id: msg.start && msg.duration && isFinal
      ? `seg-${session.meetingId}-${Math.round(msg.start * 1000)}`
      : `interim-${nanoid(6)}`,
    speaker: speakerLabel,
    text: transcript,
    startTime: startWord ? Math.round(startWord.start * 1000) : 0,
    endTime:   endWord   ? Math.round(endWord.end * 1000)     : 0,
    isFinal,
  };

  if (isFinal) {
    session.recentFinals.push(segment);
    if (session.recentFinals.length > RECENT_FINALS_CAP) {
      session.recentFinals.splice(0, session.recentFinals.length - RECENT_FINALS_CAP);
    }
  }

  // Broadcast to overlay window only — segments are noisy, library doesn't need live stream
  BrowserWindow.getAllWindows().forEach((w) => {
    if (!w.isDestroyed()) w.webContents.send(IpcChannel.TranscribeSegment, segment);
  });
}

function resolveSpeakerLabel(chan: number | null): string {
  if (!session) return 'Speaker';
  if (chan === null) return 'Speaker';
  const existing = session.speakerLabels.get(chan);
  if (existing) return existing;
  // First speaker assumed to be You (mic), since mic is channel 0 in the mixed stream
  const label = chan === 0 ? 'You' : `Speaker ${chan + 1}`;
  session.speakerLabels.set(chan, label);
  return label;
}

export function isActive(): boolean {
  return !!session?.ws && session.ws.readyState === WebSocket.OPEN;
}
