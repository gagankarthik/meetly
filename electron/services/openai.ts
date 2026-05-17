import OpenAI from 'openai';
import { nanoid } from 'nanoid';
import { BrowserWindow } from 'electron';
import { IpcChannel } from '@shared/types';
import type { MeetingSummary, TranscriptSegment, AIInsight } from '@shared/types';
import { loadTranscript } from './dynamodb';
import { getSecret } from './secrets';
import { config } from './config';

// API key resolution order: user-provided BYOK (in keychain) → baked-in key.
const getAskModel     = () => config.openaiAskModel;
const getSummaryModel = () => config.openaiSummaryModel;
const getVisionModel  = () => config.openaiVisionModel;

async function getApiKey(): Promise<string> {
  const byok = await getSecret('openai:api-key').catch(() => null);
  return byok || config.openaiApiKey || '';
}

let client: OpenAI | null = null;
let clientKey = '';
async function openai(): Promise<OpenAI> {
  const key = await getApiKey();
  if (!key) throw new Error('OpenAI key missing. Add one in Settings.');
  if (!client || clientKey !== key) {
    client = new OpenAI({ apiKey: key });
    clientKey = key;
  }
  return client;
}

export function resetOpenaiClient() {
  client = null;
  clientKey = '';
}

// ---------- Live "Ask AI" ----------

const BASE_INSTRUCTION = `You are Meetly, a real-time meeting copilot. The user is reading you mid-call, so prioritize speed and clarity.

Length guide — match the question:
- Simple/factual question → 1 short sentence.
- "What should I say / how do I respond" → 1-2 sentences, ready to speak aloud.
- "List", "options", "steps", "compare" → up to 5 short dash bullets.
- "Explain / why / how" → up to ~120 words; lead with the answer in the first sentence.

Style rules:
- Lead with the answer. No preamble ("Sure!", "Here's", "Great question").
- No hedging or disclaimers unless the user is about to do something risky.
- Plain text + simple markdown only: \`**bold**\` for the key phrase, \`-\` for bullets, blank line between bullets and prose.
- If the transcript is silent on what's being asked, say so in one line — don't fabricate.
- Match the user's tone (formal vs casual) and the meeting mode (interview, sales, standup, general).`;

const MODE_INSTRUCTIONS: Record<string, string> = {
  general:   '',
  interview: 'The user is the candidate in a job interview. Frame answers as STAR (Situation/Task/Action/Result) when behavioural, or with a single concrete code/architecture insight when technical.',
  sales:     'The user is the seller. Frame answers as discovery questions, objection handling, or value framing. Never quote prices unless context supplies one.',
  standup:   'The user is in a team standup. Be tactical: blockers, status, next step. No fluff.',
};

function askSystemPrompt(opts: { mode?: string; briefing?: string }) {
  const mode = MODE_INSTRUCTIONS[opts.mode || 'general'] || '';
  const brief = opts.briefing
    ? `\n\nUser-supplied meeting context (treat as authoritative background):\n${opts.briefing.slice(0, 4000)}`
    : '';
  return [BASE_INSTRUCTION, mode, brief].filter(Boolean).join('\n\n');
}

export async function ask(input: {
  question: string;
  meetingId?: string;
  contextSegments?: TranscriptSegment[];
  mode?: string;
  briefing?: string;
  screenshotBase64?: string;
}): Promise<{ requestId: string }> {
  const requestId = nanoid(10);
  const ctxLines = (input.contextSegments || []).slice(-30)
    .map((s) => `${s.speaker}: ${s.text}`).join('\n');

  const sysContent = askSystemPrompt({ mode: input.mode, briefing: input.briefing });

  const userContent: OpenAI.Chat.ChatCompletionContentPart[] = [
    { type: 'text', text: input.question },
  ];
  if (input.screenshotBase64) {
    userContent.push({
      type: 'image_url',
      image_url: { url: `data:image/png;base64,${input.screenshotBase64}`, detail: 'high' },
    });
  }

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: 'system', content: sysContent },
    ...(ctxLines
      ? [{ role: 'system' as const, content: `Recent meeting transcript (last 30 lines):\n${ctxLines}` }]
      : []),
    { role: 'user', content: userContent },
  ];

  // Fire-and-stream — do not await completion
  (async () => {
    try {
      const oa = await openai();
      const model = input.screenshotBase64 ? getVisionModel() : getAskModel();
      const stream = await oa.chat.completions.create({
        model,
        messages,
        stream: true,
        temperature: 0.4,
        max_tokens: 380,
      });
      for await (const event of stream) {
        const delta = event.choices[0]?.delta?.content || '';
        if (delta) emit({ requestId, delta });
      }
      emit({ requestId, delta: '', done: true });
    } catch (err: any) {
      emit({ requestId, delta: `\n\n_(error: ${err?.message || 'unknown'})_`, done: true });
    }
  })();

  return { requestId };
}

function emit(payload: { requestId: string; delta: string; done?: boolean }) {
  BrowserWindow.getAllWindows().forEach((w) => {
    if (!w.isDestroyed()) w.webContents.send(IpcChannel.AiAskChunk, payload);
  });
}

// ---------- Post-meeting summary ----------

const SUMMARY_SYSTEM = `You generate post-meeting briefs from raw transcripts. Output strict JSON with this shape:
{
  "oneLine": "single sentence (max 18 words) capturing the meeting's purpose and outcome",
  "bullets": ["3-6 key discussion points, each <= 18 words"],
  "decisions": ["explicit decisions made"],
  "actionItems": [{"owner": "name or null", "text": "action", "due": "ISO date or null"}]
}
Do not invent decisions or actions that weren't explicitly stated. If something isn't in the transcript, leave the array empty.`;

export async function summarize(meetingId: string): Promise<MeetingSummary> {
  const summaryModel = getSummaryModel();
  const segments = await loadTranscript(meetingId);
  if (segments.length === 0) {
    return {
      meetingId,
      oneLine: 'No transcript captured for this meeting.',
      bullets: [],
      decisions: [],
      actionItems: [],
      generatedAt: Date.now(),
      model: summaryModel,
    };
  }

  const transcript = segments
    .filter((s) => s.isFinal)
    .map((s) => `${s.speaker}: ${s.text}`)
    .join('\n');

  // Truncate very long transcripts to fit context — keep ends, drop middle
  const trimmed = truncateMiddle(transcript, 28_000);

  const oa = await openai();
  const completion = await oa.chat.completions.create({
    model: summaryModel,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: SUMMARY_SYSTEM },
      { role: 'user', content: trimmed },
    ],
    temperature: 0.2,
    max_tokens: 1200,
  });

  const raw = completion.choices[0]?.message?.content || '{}';
  const parsed = JSON.parse(raw);

  return {
    meetingId,
    oneLine:     parsed.oneLine || '',
    bullets:     Array.isArray(parsed.bullets) ? parsed.bullets : [],
    decisions:   Array.isArray(parsed.decisions) ? parsed.decisions : [],
    actionItems: Array.isArray(parsed.actionItems) ? parsed.actionItems : [],
    generatedAt: Date.now(),
    model: summaryModel,
  };
}

function truncateMiddle(text: string, max: number): string {
  if (text.length <= max) return text;
  const half = Math.floor((max - 50) / 2);
  return `${text.slice(0, half)}\n\n[... transcript truncated ...]\n\n${text.slice(text.length - half)}`;
}

// ---------- Proactive insights ----------

const INSIGHT_SYSTEM = `You are Meetly's silent coach during a live meeting. The user is reading you between sentences, so be ruthlessly selective.

Look at the recent transcript and decide if there is ONE thing worth surfacing to the user RIGHT NOW. Most calls should return null — only fire when there's a clear hook in the last 60 seconds:
- A stated objection or concern the user should address
- A specific fact, number, or claim worth verifying
- A decision that was just made (worth confirming)
- A question the user should ask back to dig deeper
- A relevant suggestion the user might have missed

Do NOT echo what was just said. Do NOT generic-coach ("good job listening"). If nothing concrete just happened, return {"kind": null}.

Output strict JSON:
{"kind": "objection-answer" | "fact" | "question" | "suggestion" | null,
 "title": "5-7 word headline",
 "body": "ONE sentence, MAX 22 words, actionable"}`;

const INSIGHT_MODE_GUIDANCE: Record<string, string> = {
  general:   '',
  interview: 'The user is the candidate. Bias toward: missed opportunities to apply STAR, technical concepts to clarify, or strong follow-up questions to ask the interviewer.',
  sales:     'The user is the seller. Bias toward: objections to handle, discovery questions to ask, value framing opportunities, or buying signals to acknowledge.',
  standup:   'The user is in a standup. Bias toward: blockers to flag, status gaps, or dependencies on other people just mentioned.',
};

export async function generateInsight(input: {
  segments: TranscriptSegment[];
  mode?: string;
  briefing?: string;
}): Promise<AIInsight | null> {
  const finals = input.segments.filter((s) => s.isFinal).slice(-30);
  if (finals.length < 4) return null;  // not enough context yet

  const transcript = finals.map((s) => `${s.speaker}: ${s.text}`).join('\n');
  const modeGuide = INSIGHT_MODE_GUIDANCE[input.mode || 'general'] || '';
  const briefBlock = input.briefing
    ? `\n\nUser-supplied meeting context:\n${input.briefing.slice(0, 2000)}`
    : '';

  const oa = await openai();
  const completion = await oa.chat.completions.create({
    model: getAskModel(),
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: INSIGHT_SYSTEM + (modeGuide ? `\n\nMode guidance: ${modeGuide}` : '') + briefBlock },
      { role: 'user', content: `Recent transcript:\n${transcript}` },
    ],
    temperature: 0.3,
    max_tokens: 180,
  });

  const raw = completion.choices[0]?.message?.content || '{}';
  let parsed: any;
  try { parsed = JSON.parse(raw); } catch { return null; }
  if (!parsed.kind || !parsed.title || !parsed.body) return null;

  return {
    id: nanoid(8),
    kind: parsed.kind,
    title: String(parsed.title).slice(0, 60),
    body: String(parsed.body).slice(0, 200),
    citationSegmentIds: finals.slice(-3).map((s) => s.id),
    createdAt: Date.now(),
  };
}
