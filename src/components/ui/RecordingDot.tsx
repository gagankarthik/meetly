import { cn } from '@/lib/utils';

interface Props {
  active: boolean;
  className?: string;
}

export function RecordingDot({ active, className }: Props) {
  return (
    <span className={cn('relative inline-block w-2 h-2', className)}>
      <span
        className={cn(
          'absolute inset-0 rounded-full',
          active ? 'bg-signal-live shadow-[0_0_10px_2px_rgba(220,38,38,0.45)]' : 'bg-paper-400',
        )}
      />
      {active && (
        <span className="absolute inset-0 rounded-full bg-signal-live animate-pulse-dot opacity-50" />
      )}
    </span>
  );
}
