import { cn } from '@/lib/utils';

type Variant = 'lockup' | 'icon';
type Size = 'sm' | 'md' | 'lg';

const SIZE_PX: Record<Size, number> = { sm: 18, md: 24, lg: 32 };

export function Logo({
  size = 'md',
  variant = 'lockup',
  tone = 'light',
  className,
}: {
  size?: Size;
  variant?: Variant;
  tone?: 'light' | 'dark';  // dark = wordmark stays white on dark surfaces
  className?: string;
}) {
  const px = SIZE_PX[size];
  return (
    <div className={cn('inline-flex items-center gap-2', className)}>
      <LogoMark size={px} />
      {variant === 'lockup' && (
        <span
          className={cn(
            'font-display font-semibold tracking-tight',
            tone === 'dark' ? 'text-white' : 'text-paper-900',
          )}
          style={{ fontSize: px - 6 }}
        >
          Meetly
        </span>
      )}
    </div>
  );
}

// SVG mark — gradient rounded square with three white "audio level" bars.
// Reads as both "M-like silhouette" and "transcription waveform".
export function LogoMark({ size = 24 }: { size?: number }) {
  const id = `meetly-grad-${size}`;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#6D28D9" />
          <stop offset="0.55" stopColor="#5B21B6" />
          <stop offset="1" stopColor="#0EA5E9" />
        </linearGradient>
      </defs>
      <rect width="24" height="24" rx="7" fill={`url(#${id})`} />
      <g fill="#FFFFFF" fillOpacity="0.96">
        <rect x="5.5"  y="9.5"  width="2.5" height="5"  rx="1.25" />
        <rect x="10.75" y="6.5"  width="2.5" height="11" rx="1.25" />
        <rect x="16"   y="8.25" width="2.5" height="7.5"  rx="1.25" />
      </g>
    </svg>
  );
}
