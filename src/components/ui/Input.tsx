import { forwardRef, InputHTMLAttributes, useState, useId } from 'react';
import { cn } from '@/lib/utils';

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
}

export const Field = forwardRef<HTMLInputElement, FieldProps>(
  ({ label, hint, error, className, id, value, ...props }, ref) => {
    const autoId = useId();
    const fieldId = id ?? autoId;
    const [focused, setFocused] = useState(false);
    const filled = value !== undefined && value !== '';
    const floated = focused || filled;

    return (
      <div className="relative">
        <input
          id={fieldId}
          ref={ref}
          value={value}
          onFocus={(e) => { setFocused(true); props.onFocus?.(e); }}
          onBlur={(e)  => { setFocused(false); props.onBlur?.(e); }}
          {...props}
          className={cn(
            'peer w-full h-12 px-3.5 pt-4 pb-1 rounded-lg bg-paper-50 border border-paper-900/10 text-sm text-paper-900',
            'placeholder-transparent transition-all duration-200 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.6)]',
            'focus:bg-paper-50 focus:border-accent-500/60 focus:shadow-[0_0_0_4px_rgba(109,40,217,0.10)]',
            error && 'border-signal-live/60 focus:border-signal-live focus:shadow-[0_0_0_4px_rgba(220,38,38,0.10)]',
            className,
          )}
        />
        {label && (
          <label
            htmlFor={fieldId}
            className={cn(
              'pointer-events-none absolute left-3.5 transition-all duration-200 ease-out',
              floated
                ? 'top-1.5 text-[10px] uppercase tracking-[0.1em] text-paper-600'
                : 'top-1/2 -translate-y-1/2 text-sm text-paper-500',
              focused && 'text-accent-600',
              error && 'text-signal-live',
            )}
          >
            {label}
          </label>
        )}
        {(hint || error) && (
          <div className={cn('mt-1.5 text-[11px]', error ? 'text-signal-live' : 'text-paper-500')}>
            {error || hint}
          </div>
        )}
      </div>
    );
  },
);
Field.displayName = 'Field';
