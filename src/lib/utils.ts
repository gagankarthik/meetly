import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDuration(sec: number): string {
  if (!sec || sec < 0) return '0:00';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return h > 0
    ? `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
    : `${m}:${String(s).padStart(2,'0')}`;
}

export function formatRelative(ts: number): string {
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function groupByDay<T extends { startedAt: number }>(items: T[]): Array<{ label: string; items: T[] }> {
  const groups = new Map<string, T[]>();
  for (const i of items) {
    const d = new Date(i.startedAt);
    const key = dayKey(d);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(i);
  }
  return [...groups.entries()].map(([label, items]) => ({ label, items }));
}

function dayKey(d: Date): string {
  const today = new Date();
  const yest  = new Date(); yest.setDate(today.getDate() - 1);
  if (sameDay(d, today)) return 'Today';
  if (sameDay(d, yest))  return 'Yesterday';
  const wk = (today.getTime() - d.getTime()) / (1000 * 60 * 60 * 24);
  if (wk < 7) return d.toLocaleDateString(undefined, { weekday: 'long' });
  return d.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
