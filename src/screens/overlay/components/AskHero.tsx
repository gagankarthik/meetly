import { forwardRef, KeyboardEvent, useState } from 'react';
import { ArrowUp, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  onSubmit: (q: string) => void;
  autoFocus?: boolean;
  hero?: boolean;
  placeholder?: string;
}

export const AskHero = forwardRef<HTMLTextAreaElement, Props>(
  ({ onSubmit, autoFocus, hero, placeholder = 'Ask anything…' }, ref) => {
    const [val, setVal] = useState('');

    const submit = () => {
      if (!val.trim()) return;
      onSubmit(val.trim());
      setVal('');
    };
    const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
    };

    return (
      <div
        className={cn(
          'flex items-end gap-2 px-3 py-2 rounded-xl transition-all',
          hero ? 'ask-hero' : 'bg-paper-50 border border-paper-900/[0.07] focus-within:border-accent-500/40',
        )}
      >
        <Sparkles className="text-accent-600 mt-1.5 shrink-0" size={hero ? 14 : 13} />
        <textarea
          ref={ref}
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={onKey}
          autoFocus={autoFocus}
          rows={1}
          placeholder={placeholder}
          className={cn(
            'no-drag flex-1 resize-none bg-transparent leading-relaxed placeholder-paper-500 text-paper-900 max-h-24',
            hero ? 'text-[14px]' : 'text-[13px]',
          )}
        />
        <button
          onClick={submit}
          disabled={!val.trim()}
          aria-label="Send"
          className={cn(
            'no-drag grid place-items-center rounded-md text-paper-50 transition-all active:scale-95',
            hero ? 'h-7 w-7' : 'h-6 w-6',
            val.trim() ? 'bg-accent-600 hover:bg-accent-700' : 'bg-paper-300 cursor-not-allowed',
          )}
        >
          <ArrowUp size={hero ? 13 : 12} />
        </button>
      </div>
    );
  },
);
AskHero.displayName = 'AskHero';
