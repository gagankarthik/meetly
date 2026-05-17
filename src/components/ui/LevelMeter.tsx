import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

// Two-bar VU meter rendered to canvas for smooth 60fps animation
// without re-rendering React on every frame.
interface Props {
  getLevel: () => number;
  className?: string;
  color?: string;
  bars?: number;
}

export function LevelMeter({ getLevel, className, color = '#A78BFA', bars = 14 }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const buf = useRef<number[]>(Array(bars).fill(0));

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const dpr = window.devicePixelRatio || 1;
    const resize = () => {
      canvas.width  = canvas.clientWidth * dpr;
      canvas.height = canvas.clientHeight * dpr;
    };
    resize();
    let raf = 0;
    const render = () => {
      raf = requestAnimationFrame(render);
      const w = canvas.width, h = canvas.height;
      ctx.clearRect(0, 0, w, h);
      const level = Math.min(1, getLevel() * 2.4);
      // Shift buffer left, append new level
      buf.current.shift();
      buf.current.push(level);

      const gap = 2 * dpr;
      const bw = (w - gap * (bars - 1)) / bars;
      for (let i = 0; i < bars; i++) {
        const v = buf.current[i];
        const bh = Math.max(2 * dpr, v * h);
        const x = i * (bw + gap);
        const y = (h - bh) / 2;
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.25 + 0.75 * v;
        roundRect(ctx, x, y, bw, bh, 1.5 * dpr);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    };
    render();
    return () => cancelAnimationFrame(raf);
  }, [bars, color, getLevel]);

  return <canvas ref={ref} className={cn('block', className)} />;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
