import { Logo } from '@/components/ui/Logo';
import { Button } from '@/components/ui/Button';
import { ArrowRight, Check, KeyRound, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  openaiConfigured: boolean;
  deepgramConfigured: boolean;
  onOpenSettings: () => void;
  onHide: () => void;
}

export function SetupView({ openaiConfigured, deepgramConfigured, onOpenSettings, onHide }: Props) {
  return (
    <>
      <header className="drag-region flex items-center justify-between gap-2 px-3 h-10 border-b border-paper-900/[0.05]">
        <Logo size="sm" />
        <div className="flex items-center gap-0.5 no-drag">
          <Button variant="icon" size="iconSm" onClick={onHide} aria-label="Hide"><X size={13} /></Button>
        </div>
      </header>

      <div className="flex-1 min-h-0 flex flex-col items-center justify-center px-5 py-6 gap-5">
        <div className="text-center">
          <h2 className="text-[15px] font-semibold text-paper-900">Finish setup</h2>
          <p className="mt-1 text-[12px] text-paper-500 leading-relaxed">
            Add the API keys we use to transcribe and answer.
          </p>
        </div>

        <ul className="w-full space-y-2">
          <CheckItem label="Deepgram (transcription)" done={deepgramConfigured} />
          <CheckItem label="OpenAI (answers + summaries)" done={openaiConfigured} />
        </ul>

        <Button variant="primary" size="md" onClick={onOpenSettings} className="w-full justify-center">
          Open Settings <ArrowRight size={13} />
        </Button>

        <p className="text-[10.5px] text-paper-500 leading-relaxed text-center max-w-[280px]">
          You can paste keys into Settings, or put them in <span className="font-mono">.env.local</span> and restart.
        </p>
      </div>
    </>
  );
}

function CheckItem({ label, done }: { label: string; done: boolean }) {
  return (
    <li className={cn(
      'flex items-center gap-3 rounded-lg border px-3.5 py-2.5',
      done ? 'border-signal-ok/30 bg-signal-ok/[0.04]' : 'border-paper-900/[0.06] bg-paper-50',
    )}>
      <span className={cn(
        'w-5 h-5 rounded-full grid place-items-center shrink-0',
        done ? 'bg-signal-ok text-white' : 'bg-paper-200 text-paper-500',
      )}>
        {done ? <Check size={12} /> : <KeyRound size={11} />}
      </span>
      <span className="text-[12.5px] text-paper-800 flex-1">{label}</span>
      <span className={cn('text-[10.5px]', done ? 'text-signal-ok' : 'text-paper-500')}>
        {done ? 'ready' : 'missing'}
      </span>
    </li>
  );
}
