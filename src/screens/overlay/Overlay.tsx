import { useEffect, useRef, useState } from 'react';
import { useMeeting } from '@/stores/meeting';
import { useAi } from '@/stores/ai';
import { useBriefing } from '@/stores/briefing';
import { useInsights } from '@/stores/insights';
import { startCapture, AUDIO_CONFIG, CaptureHandle } from '@/lib/audio';
import { IdleView } from './views/IdleView';
import { RecordingView } from './views/RecordingView';
import { SetupView } from './views/SetupView';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import type { UserSettings, MeetingMode } from '@shared/types';

export function Overlay() {
  const {
    current, status, segments, startedAt,
    setCurrent, setStatus, tickElapsed, upsertSegment, resetSegments, setLevels,
  } = useMeeting();
  const { newAsk, setRequestId, appendDelta, finalize, turns, clear: clearAsks } = useAi();
  const briefing = useBriefing();
  const addInsight = useInsights((s) => s.add);
  const clearInsights = useInsights((s) => s.clear);

  const captureRef = useRef<CaptureHandle | null>(null);
  const askInputRef = useRef<HTMLTextAreaElement>(null);
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [paused, setPaused] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  const recording = status === 'recording';
  const needsSetup = !!settings && (!settings.openaiKeyConfigured || !settings.deepgramKeyConfigured);

  // ===== Initial settings + live updates =====
  useEffect(() => {
    window.meetly.settings.get().then(setSettings);
    return window.meetly.settings.onChanged(setSettings);
  }, []);

  // Apply user's default mode whenever it changes (only if not already overridden)
  useEffect(() => {
    if (settings?.defaultMode && briefing.mode === 'general') {
      briefing.setMode(settings.defaultMode);
    }
  }, [settings?.defaultMode]);

  // ===== Subscriptions =====
  useEffect(() => window.meetly.transcribe.onSegment(upsertSegment), [upsertSegment]);
  useEffect(() => window.meetly.ai.onChunk(({ requestId, delta, done }) => {
    if (delta) appendDelta(requestId, delta);
    if (done)  finalize(requestId);
  }), [appendDelta, finalize]);
  useEffect(() => window.meetly.hotkey.onAsk(() => askInputRef.current?.focus()), []);
  useEffect(() => window.meetly.hotkey.onScreenshot(() => askWithScreenshot()), []);
  useEffect(() => window.meetly.ai.onInsight(addInsight), [addInsight]);

  // Auto-start path: when overlay is opened with ?autostart=1 from Hub's "New meeting",
  // wait for settings to load, then kick off the meeting once.
  const autostartedRef = useRef(false);
  useEffect(() => {
    if (autostartedRef.current) return;
    if (!settings) return;
    const wantAutostart = new URLSearchParams(window.location.search).get('autostart') === '1';
    if (!wantAutostart) return;
    if (needsSetup) return;
    if (status !== 'idle') return;
    autostartedRef.current = true;
    startMeeting();
  }, [settings, needsSetup, status]);

  useEffect(() => window.meetly.window.onAutostart(() => {
    if (autostartedRef.current) return;
    if (!settings || needsSetup || status !== 'idle') return;
    autostartedRef.current = true;
    startMeeting();
  }), [settings, needsSetup, status]);

  // Push live mode/briefing changes to the insights loop so it stays current.
  useEffect(() => {
    if (!recording) return;
    window.meetly.insights.updateContext({
      mode: briefing.mode,
      briefing: briefing.context.trim() || undefined,
    });
  }, [recording, briefing.mode, briefing.context]);

  // Elapsed ticker
  useEffect(() => {
    if (!startedAt) return;
    const t = setInterval(tickElapsed, 1000);
    return () => clearInterval(t);
  }, [startedAt, tickElapsed]);

  // Levels
  const micLvl = useRef(0); const sysLvl = useRef(0);
  useEffect(() => {
    const t = setInterval(() => {
      micLvl.current = captureRef.current?.micLevel() ?? 0;
      sysLvl.current = captureRef.current?.sysLevel() ?? 0;
      setLevels(micLvl.current, sysLvl.current);
    }, 80);
    return () => clearInterval(t);
  }, [setLevels]);

  // Overlay window is freely resizable by the user. We only force-shrink it for:
  //   - the brief "processing/finished" toast
  //   - the collapsed state (pill-only, body hidden)
  // Remember the user's full-size height so we can restore it on expand.
  const fullHeightRef = useRef<number | null>(null);
  useEffect(() => {
    if (status === 'processing' || status === 'finished') {
      window.meetly.window.setHeight(240);
      return;
    }
    if (collapsed) {
      if (fullHeightRef.current == null) fullHeightRef.current = window.innerHeight;
      window.meetly.window.setHeight(56);
    } else if (fullHeightRef.current != null) {
      window.meetly.window.setHeight(fullHeightRef.current);
      fullHeightRef.current = null;
    }
  }, [status, collapsed]);

  const toggleCollapse = () => setCollapsed((v) => !v);

  const startMeeting = async () => {
    // Guard: if a key got removed mid-session, route the user to fix it instead of failing cryptically.
    if (settings && (!settings.openaiKeyConfigured || !settings.deepgramKeyConfigured)) {
      toast('Add your API keys in Settings to start a meeting.');
      window.meetly.window.openSettings();
      return;
    }
    try {
      clearAsks();
      clearInsights();
      const meeting = await window.meetly.meetings.create({
        title: briefing.title.trim() || defaultTitle(),
      });
      setCurrent(meeting);
      resetSegments();
      setStatus('recording');

      const dgRes = await window.meetly.transcribe.start({
        meetingId: meeting.id,
        sampleRate: AUDIO_CONFIG.sampleRate,
        channels:   AUDIO_CONFIG.channels,
        mode: briefing.mode,
        briefing: briefing.context.trim() || undefined,
      });
      if (!dgRes.ok) {
        setStatus('idle');
        const isKeyError = /key|auth|401|403/i.test(dgRes.error || '');
        if (isKeyError) {
          toast('Deepgram rejected the key. Open Settings to update it.');
          window.meetly.window.openSettings();
        } else {
          toast(`Could not start transcription: ${dgRes.error}`);
        }
        return;
      }

      captureRef.current = await startCapture({
        onChunk: (pcm) => window.meetly.transcribe.chunk(pcm),
        onError: (err) => console.error('[capture]', err),
      });
    } catch (err: any) {
      setStatus('idle');
      toast(err?.message || 'Could not start meeting');
    }
  };

  const togglePause = () => {
    if (!captureRef.current) return;
    if (paused) { captureRef.current.resume(); setPaused(false); }
    else        { captureRef.current.pause();  setPaused(true); }
  };

  const cycleMode = () => {
    const order: MeetingMode[] = ['general', 'interview', 'sales', 'standup'];
    const next = order[(order.indexOf(briefing.mode) + 1) % order.length];
    briefing.setMode(next);
  };

  const stopMeeting = async () => {
    setStatus('processing');
    setPaused(false);
    await captureRef.current?.stop().catch(() => {});
    captureRef.current = null;
    await window.meetly.transcribe.stop();
    const finalSegs = useMeeting.getState().segments.filter((s) => s.isFinal);
    if (current && finalSegs.length > 0) {
      try {
        await window.meetly.meetings.saveTranscript({ meetingId: current.id, segments: finalSegs });
        if (settings?.saveTranscripts !== false) {
          const summary = await window.meetly.ai.summarize(current.id);
          await window.meetly.meetings.saveSummary({ meetingId: current.id, summary });
        }
        await window.meetly.meetings.update({
          id: current.id, status: 'ready',
          endedAt: Date.now(),
          durationSec: Math.floor((Date.now() - (startedAt || Date.now())) / 1000),
        });
      } catch (e) { console.error('[stop]', e); }
    }
    setStatus('finished');
    setTimeout(() => {
      setStatus('idle');
      setCurrent(null);
      resetSegments();
      clearInsights();
      briefing.reset();
      // Bring Hub back, then close this overlay so it's gone until next New meeting.
      window.meetly.window.showHub();
      window.meetly.window.closeOverlay();
    }, 1800);
  };

  const handleAsk = async (q: string) => {
    if (!q.trim()) return;
    const turn = newAsk(q);
    try {
      const { requestId } = await window.meetly.ai.ask({
        question: q,
        meetingId: current?.id,
        contextSegments: segments.slice(-30),
        mode: briefing.mode,
        briefing: briefing.context.trim() || undefined,
      });
      setRequestId(turn.id, requestId);
    } catch (e: any) {
      console.error('[ask]', e);
    }
  };

  const askWithScreenshot = async () => {
    try {
      askInputRef.current?.focus();
      const { base64 } = await window.meetly.ai.captureScreenshot();
      const question = (askInputRef.current?.value || 'What\'s on my screen? Answer in one sentence.').trim();
      const turn = newAsk(`📸 ${question}`);
      const { requestId } = await window.meetly.ai.ask({
        question,
        meetingId: current?.id,
        contextSegments: segments.slice(-30),
        mode: briefing.mode,
        briefing: briefing.context.trim() || undefined,
        screenshotBase64: base64,
      });
      setRequestId(turn.id, requestId);
      if (askInputRef.current) askInputRef.current.value = '';
    } catch (e: any) {
      toast(e?.message || 'Screenshot failed');
    }
  };

  return (
    <div className="h-screen w-screen">
      <motion.div
        layout
        initial={{ opacity: 0, y: -8, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: 380, damping: 32 }}
        className={cn(
          'relative flex flex-col h-full',
        )}
      >
        <AnimatePresence mode="wait">
          {needsSetup && !recording ? (
            <motion.div
              key="setup"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="flex flex-col h-full"
            >
              <SetupView
                openaiConfigured={!!settings?.openaiKeyConfigured}
                deepgramConfigured={!!settings?.deepgramKeyConfigured}
                onOpenSettings={() => window.meetly.window.openSettings()}
                onHide={() => window.meetly.window.toggleOverlay()}
              />
            </motion.div>
          ) : recording ? (
            <motion.div
              key="recording"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="flex flex-col h-full"
            >
              <RecordingView
                askInputRef={askInputRef}
                segments={segments}
                turns={turns}
                paused={paused}
                collapsed={collapsed}
                onAsk={handleAsk}
                onScreenshot={askWithScreenshot}
                onStop={stopMeeting}
                onPauseToggle={togglePause}
                onHide={toggleCollapse}
                onCycleMode={cycleMode}
                getMicLevel={() => micLvl.current}
                getSysLevel={() => sysLvl.current}
                mode={briefing.mode}
              />
            </motion.div>
          ) : (
            <motion.div
              key="idle"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="flex flex-col h-full"
            >
              <IdleView
                status={status}
                askInputRef={askInputRef}
                turns={turns}
                collapsed={collapsed}
                onAsk={handleAsk}
                onScreenshot={askWithScreenshot}
                onStart={startMeeting}
                onHide={toggleCollapse}
                onCycleMode={cycleMode}
                mode={briefing.mode}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      <Toast />
    </div>
  );
}

function defaultTitle(): string {
  const d = new Date();
  return `Meeting · ${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
}

let toastEl: HTMLDivElement | null = null;
function toast(message: string) {
  if (!toastEl) return alert(message);
  toastEl.textContent = message;
  toastEl.classList.remove('opacity-0');
  toastEl.classList.add('opacity-100');
  setTimeout(() => {
    toastEl?.classList.remove('opacity-100');
    toastEl?.classList.add('opacity-0');
  }, 3000);
}
function Toast() {
  return (
    <div
      ref={(el) => { toastEl = el; }}
      className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 max-w-[300px] px-3 py-1.5 rounded-md bg-paper-900 text-paper-50 text-[11px] opacity-0 transition-opacity duration-200"
    />
  );
}
