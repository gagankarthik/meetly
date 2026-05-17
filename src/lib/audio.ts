// Audio capture for the renderer. Captures mic + system audio (via desktopCapturer),
// mixes them into a stereo PCM16 stream at 16 kHz, and forwards chunks to the main
// process which pipes them into Deepgram.
//
// Channel layout: left = mic, right = system. Combined with Deepgram diarization
// this gives reliable speaker attribution: speaker 0 = "You" (mic), 1+ = others.

const TARGET_SAMPLE_RATE = 16000;
const TARGET_CHANNELS = 2;
const CHUNK_MS = 100; // send PCM chunk every 100ms

export interface CaptureHandle {
  stop: () => Promise<void>;
  pause: () => void;
  resume: () => void;
  isPaused: () => boolean;
  micLevel:   () => number;
  sysLevel:   () => number;
}

interface CaptureOptions {
  systemSourceId?: string; // desktopCapturer source id; if omitted, picks first 'screen'
  onChunk: (pcm: ArrayBuffer) => void;
  onError?: (err: Error) => void;
}

export async function startCapture(opts: CaptureOptions): Promise<CaptureHandle> {
  const ctx = new AudioContext({ sampleRate: TARGET_SAMPLE_RATE });

  // ---- Mic ----
  const micStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: false,
      noiseSuppression: true,
      autoGainControl: true,
      channelCount: 1,
    },
    video: false,
  });

  // ---- System audio (loopback) ----
  let sysStream: MediaStream | null = null;
  try {
    const sourceId = opts.systemSourceId || await pickDefaultSystemSource();
    sysStream = await (navigator.mediaDevices as any).getUserMedia({
      audio: {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: sourceId,
        },
      },
      video: {
        // Required to satisfy the constraint API even though we don't use video
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: sourceId,
          minWidth: 1, maxWidth: 1, minHeight: 1, maxHeight: 1,
        },
      },
    });
    // Discard video tracks immediately
    sysStream?.getVideoTracks().forEach((t) => { t.stop(); sysStream?.removeTrack(t); });
  } catch (err) {
    console.warn('[audio] system audio capture unavailable, continuing with mic only', err);
  }

  const micSrc = ctx.createMediaStreamSource(micStream);
  const sysSrc = sysStream ? ctx.createMediaStreamSource(sysStream) : null;

  // Level meters
  const micAnalyser = ctx.createAnalyser();
  micAnalyser.fftSize = 256;
  micSrc.connect(micAnalyser);
  let micLevel = 0;

  const sysAnalyser = sysSrc ? ctx.createAnalyser() : null;
  if (sysAnalyser && sysSrc) {
    sysAnalyser.fftSize = 256;
    sysSrc.connect(sysAnalyser);
  }
  let sysLevel = 0;
  const micArr = new Uint8Array(micAnalyser.frequencyBinCount);
  const sysArr = sysAnalyser ? new Uint8Array(sysAnalyser.frequencyBinCount) : null;
  const levelTimer = window.setInterval(() => {
    micAnalyser.getByteTimeDomainData(micArr);
    micLevel = rms(micArr);
    if (sysAnalyser && sysArr) {
      sysAnalyser.getByteTimeDomainData(sysArr);
      sysLevel = rms(sysArr);
    }
  }, 80);

  // Channel merger: stereo with mic-L, sys-R
  const merger = ctx.createChannelMerger(2);
  micSrc.connect(merger, 0, 0);
  if (sysSrc) sysSrc.connect(merger, 0, 1);
  else        micSrc.connect(merger, 0, 1); // fallback duplicate

  // ScriptProcessor — yes, deprecated, but AudioWorklet adds boilerplate; Electron's
  // bundled Chromium supports it. Buffer size 4096 ≈ 256ms; we'll chunk inside.
  const processor = ctx.createScriptProcessor(4096, 2, 2);
  merger.connect(processor);
  // ScriptProcessor must connect to destination to fire — use a muted gain
  const muted = ctx.createGain();
  muted.gain.value = 0;
  processor.connect(muted);
  muted.connect(ctx.destination);

  const chunkSamples = Math.floor((TARGET_SAMPLE_RATE * CHUNK_MS) / 1000);
  let leftBuf: Float32Array = new Float32Array(0);
  let rightBuf: Float32Array = new Float32Array(0);
  let paused = false;

  processor.onaudioprocess = (ev) => {
    const l = ev.inputBuffer.getChannelData(0);
    const r = ev.inputBuffer.getChannelData(1);
    // Always pull samples so level meters keep working, but only emit chunks when active.
    if (paused) return;
    leftBuf  = concatFloat(leftBuf, l);
    rightBuf = concatFloat(rightBuf, r);

    while (leftBuf.length >= chunkSamples) {
      const lSlice = leftBuf.subarray(0, chunkSamples);
      const rSlice = rightBuf.subarray(0, chunkSamples);
      const pcm = interleaveToPCM16(lSlice, rSlice);
      try { opts.onChunk(pcm); } catch (e) { opts.onError?.(e as Error); }
      leftBuf  = leftBuf.slice(chunkSamples);
      rightBuf = rightBuf.slice(chunkSamples);
    }
  };

  const stop = async () => {
    clearInterval(levelTimer);
    processor.disconnect();
    merger.disconnect();
    micSrc.disconnect();
    sysSrc?.disconnect();
    micStream.getTracks().forEach((t) => t.stop());
    sysStream?.getTracks().forEach((t) => t.stop());
    await ctx.close();
  };

  return {
    stop,
    pause: () => { paused = true; leftBuf = new Float32Array(0); rightBuf = new Float32Array(0); },
    resume: () => { paused = false; },
    isPaused: () => paused,
    micLevel: () => micLevel,
    sysLevel: () => sysLevel,
  };
}

async function pickDefaultSystemSource(): Promise<string> {
  const sources = await window.meetly.audio.listSources();
  // Prefer the entire screen (lower-latency on Windows than per-window capture)
  const entire = sources.find((s) => /entire screen|screen 1|Screen/i.test(s.name));
  if (!entire) throw new Error('No system audio source available');
  return entire.id;
}

function concatFloat(a: Float32Array, b: Float32Array): Float32Array {
  const out = new Float32Array(a.length + b.length);
  out.set(a, 0); out.set(b, a.length);
  return out;
}

function interleaveToPCM16(l: Float32Array, r: Float32Array): ArrayBuffer {
  const len = Math.min(l.length, r.length);
  const buf = new ArrayBuffer(len * 4); // 2 channels * 2 bytes
  const view = new DataView(buf);
  let offset = 0;
  for (let i = 0; i < len; i++) {
    view.setInt16(offset, clamp16(l[i]), true); offset += 2;
    view.setInt16(offset, clamp16(r[i]), true); offset += 2;
  }
  return buf;
}

function clamp16(f: number): number {
  const s = Math.max(-1, Math.min(1, f));
  return s < 0 ? s * 0x8000 : s * 0x7fff;
}

function rms(arr: Uint8Array): number {
  let sum = 0;
  for (let i = 0; i < arr.length; i++) {
    const v = (arr[i] - 128) / 128;
    sum += v * v;
  }
  return Math.sqrt(sum / arr.length);
}

export const AUDIO_CONFIG = {
  sampleRate: TARGET_SAMPLE_RATE,
  channels: TARGET_CHANNELS,
};
