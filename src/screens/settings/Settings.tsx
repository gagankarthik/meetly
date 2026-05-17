import { useEffect, useRef, useState } from 'react';
import { Logo } from '@/components/ui/Logo';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import type { UserSettings, AuthSession } from '@shared/types';
import {
  ShieldCheck, Keyboard, User, Loader2, Trash2,
  Pencil, X, RotateCcw, LogOut, Code2,
} from 'lucide-react';

type Section = 'privacy' | 'hotkeys' | 'account';

// Standalone Settings window — kept for the legacy tray menu entry. Hub renders
// each section directly via the exported PrivacySection / HotkeySection / AccountSection.
export function Settings() {
  const [s, setS] = useState<UserSettings | null>(null);
  const [section, setSection] = useState<Section>('privacy');

  useEffect(() => {
    window.meetly.settings.get().then(setS);
    return window.meetly.settings.onChanged(setS);
  }, []);

  if (!s) return <div className="h-screen grid place-items-center text-paper-500 text-sm">Loading…</div>;

  return (
    <div className="h-screen flex">
      <aside className="w-[200px] shrink-0 flex flex-col border-r border-paper-900/[0.06] bg-paper-100 px-3 py-4 gap-3">
        <Logo size="sm" className="px-1" />
        <nav className="flex flex-col gap-0.5 mt-2">
          <NavItem icon={<ShieldCheck size={13} />} active={section==='privacy'}  onClick={() => setSection('privacy')}>Privacy</NavItem>
          <NavItem icon={<Keyboard size={13} />}    active={section==='hotkeys'}  onClick={() => setSection('hotkeys')}>Shortcuts</NavItem>
          <NavItem icon={<User size={13} />}        active={section==='account'}  onClick={() => setSection('account')}>Account</NavItem>
        </nav>
      </aside>
      <main className="flex-1 overflow-y-auto px-10 py-9 max-w-2xl">
        {section === 'privacy' && <PrivacySection settings={s} />}
        {section === 'hotkeys' && <HotkeySection  settings={s} />}
        {section === 'account' && <AccountSection settings={s} />}
      </main>
    </div>
  );
}

// Generic wrapper so Hub can drop a section into its full content area without
// duplicating the chrome around it.
export function SettingsSection({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto px-10 py-9 pb-16">{children}</div>
    </div>
  );
}

// ============================================================
// Sections
// ============================================================

export function PrivacySection({ settings }: { settings: UserSettings }) {
  return (
    <div className="space-y-8">
      <Heading title="Privacy" subtitle="What's stored, sent, and never seen." />

      <Group title="What we keep" hint="Audio is never saved anywhere. Transcripts and summaries are always saved to your account so you can recall them later — delete individual meetings any time from Transcripts.">
        <Toggle
          label="Telemetry"
          desc="Off by default. We don't ship with analytics or crash reporting."
          value={settings.telemetryOptIn}
          onChange={(v) => window.meetly.settings.update({ telemetryOptIn: v })}
        />
      </Group>

      <Group title="Stealth" hint="Hide from screen-share and let your cursor pass through.">
        <Toggle
          label="Invisible to screen-share"
          desc="Uses native content-protection (WDA_EXCLUDEFROMCAPTURE on Windows, NSWindowSharingNone on macOS)."
          value={settings.contentProtection}
          onChange={(v) => window.meetly.settings.update({ contentProtection: v })}
        />
        <Toggle
          label="Click-through mode"
          desc="Mouse passes through the overlay so you can interact with what's behind it. Toggle back to type."
          value={settings.clickThrough}
          onChange={(v) => window.meetly.settings.update({ clickThrough: v })}
        />
      </Group>

      <Group title="Danger zone">
        <DangerRow
          title="Wipe all local data"
          desc="Deletes your saved API keys, signed-in session, and local settings. Server-side meetings stay until you delete them in the library."
          onConfirm={async () => {
            await window.meetly.settings.clearAllData();
          }}
        />
      </Group>
    </div>
  );
}

const HOTKEY_DEFAULTS: Record<HotkeyField, string> = {
  hotkeyToggle:     'CommandOrControl+\\',
  hotkeyAsk:        'CommandOrControl+Return',
  hotkeyScreenshot: 'CommandOrControl+Shift+S',
  hotkeyHide:       'CommandOrControl+Shift+H',
};

type HotkeyField = 'hotkeyToggle' | 'hotkeyAsk' | 'hotkeyScreenshot' | 'hotkeyHide';

export function HotkeySection({ settings }: { settings: UserSettings }) {
  return (
    <div className="space-y-8">
      <Heading title="Shortcuts" subtitle="Click a row to remap. Saved as soon as you press a valid combo." />
      <div className="rounded-xl border border-paper-900/[0.06] bg-paper-50 divide-y divide-paper-900/[0.05]">
        <HKEditableRow label="Toggle overlay"      field="hotkeyToggle"     value={settings.hotkeyToggle} />
        <HKEditableRow label="Focus ask input"     field="hotkeyAsk"        value={settings.hotkeyAsk} />
        <HKEditableRow label="Capture screen + ask" field="hotkeyScreenshot" value={settings.hotkeyScreenshot} />
        <HKEditableRow label="Hide overlay"        field="hotkeyHide"       value={settings.hotkeyHide} />
      </div>
      <p className="text-[11px] text-paper-500 leading-relaxed">
        Use at least one modifier (Ctrl, ⌘, Shift, Alt) + a key. Press Esc while editing to cancel.
      </p>
    </div>
  );
}

function HKEditableRow({ label, field, value }: { label: string; field: HotkeyField; value: string }) {
  const [editing, setEditing] = useState(false);
  const [hint, setHint] = useState<string | null>(null);

  const save = async (combo: string) => {
    await window.meetly.settings.update({ [field]: combo });
    setEditing(false);
    setHint(null);
  };

  const reset = async () => {
    await window.meetly.settings.update({ [field]: HOTKEY_DEFAULTS[field] });
  };

  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2.5">
      <span className="text-[12.5px] text-paper-800 flex-1 min-w-0">{label}</span>
      {editing ? (
        <KeyCapture
          onCapture={(combo) => save(combo)}
          onHint={(h) => setHint(h)}
          onCancel={() => { setEditing(false); setHint(null); }}
        />
      ) : (
        <KeyDisplay keys={value} />
      )}
      <div className="flex items-center gap-1">
        {editing ? (
          <button onClick={() => { setEditing(false); setHint(null); }} className="h-6 w-6 grid place-items-center rounded-md text-paper-500 hover:bg-paper-100 hover:text-paper-900" aria-label="Cancel">
            <X size={11} />
          </button>
        ) : (
          <>
            <button onClick={() => setEditing(true)} className="h-6 w-6 grid place-items-center rounded-md text-paper-500 hover:bg-paper-100 hover:text-paper-900" aria-label="Edit">
              <Pencil size={11} />
            </button>
            {value !== HOTKEY_DEFAULTS[field] && (
              <button onClick={reset} className="h-6 w-6 grid place-items-center rounded-md text-paper-500 hover:bg-paper-100 hover:text-paper-900" title="Reset to default" aria-label="Reset">
                <RotateCcw size={11} />
              </button>
            )}
          </>
        )}
      </div>
      {hint && <span className="text-[10px] text-signal-live ml-2">{hint}</span>}
    </div>
  );
}

function KeyDisplay({ keys }: { keys: string }) {
  const parts = keys.split('+').map((s) => s.trim());
  return (
    <span className="flex items-center gap-1">
      {parts.map((p, i) => (
        <kbd key={i} className="inline-flex items-center justify-center min-w-[22px] h-5 px-1.5 rounded bg-paper-100 border border-paper-900/[0.08] font-mono text-[10px] text-paper-700">
          {prettyKey(p)}
        </kbd>
      ))}
    </span>
  );
}

function KeyCapture({
  onCapture, onCancel, onHint,
}: {
  onCapture: (combo: string) => void;
  onCancel: () => void;
  onHint: (h: string | null) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ref.current?.focus();
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.key === 'Escape') { onCancel(); return; }
    if (['Control', 'Meta', 'Shift', 'Alt'].includes(e.key)) {
      onHint('Add a non-modifier key (e.g. S, Enter, \\)…');
      return;
    }
    const mods: string[] = [];
    if (e.ctrlKey || e.metaKey) mods.push('CommandOrControl');
    if (e.shiftKey)             mods.push('Shift');
    if (e.altKey)               mods.push('Alt');
    if (mods.length === 0) {
      onHint('Need at least one modifier (Ctrl, ⌘, Shift, Alt).');
      return;
    }
    const main = normalizeKey(e.key);
    if (!main) { onHint("Can't bind that key."); return; }
    onCapture([...mods, main].join('+'));
  };

  return (
    <div
      ref={ref}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      className="inline-flex items-center h-7 px-3 rounded-md border-2 border-dashed border-accent-500 bg-accent-50/40 text-[11px] text-accent-700 font-medium outline-none"
    >
      Press keys…
    </div>
  );
}

function normalizeKey(key: string): string | null {
  if (key.length === 1) return key.toUpperCase();
  // Map common JS key names to Electron accelerator names
  const map: Record<string, string> = {
    'Enter': 'Return',
    'ArrowUp': 'Up',
    'ArrowDown': 'Down',
    'ArrowLeft': 'Left',
    'ArrowRight': 'Right',
    'Backspace': 'Backspace',
    'Delete': 'Delete',
    'Tab': 'Tab',
    'Escape': 'Escape',
    'PageUp': 'PageUp',
    'PageDown': 'PageDown',
    'Home': 'Home',
    'End': 'End',
    ' ': 'Space',
  };
  if (map[key]) return map[key];
  if (/^F\d{1,2}$/.test(key)) return key;
  return key;
}

export function AccountSection({}: { settings: UserSettings }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    window.meetly.auth.getSession()
      .then(setSession)
      .finally(() => setLoading(false));
    return window.meetly.auth.onSessionChanged(setSession);
  }, []);

  const signOut = async () => {
    setSigningOut(true);
    try { await window.meetly.auth.signOut(); }
    finally { setSigningOut(false); }
  };

  if (loading) {
    return (
      <div className="space-y-8">
        <Heading title="Account" />
        <div className="rounded-xl border border-paper-900/[0.06] bg-paper-50 p-5 flex items-center gap-3 text-paper-500 text-[12.5px]">
          <Loader2 className="animate-spin" size={14} /> Loading profile…
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="space-y-8">
        <Heading title="Account" subtitle="You're not signed in." />
        <Button variant="primary" onClick={() => window.meetly.window.openAuth()}>
          Sign in
        </Button>
      </div>
    );
  }

  const isDev = session.idToken === 'dev';
  const name = session.displayName || session.email.split('@')[0];
  const initials = name
    .split(/\s+|\./).filter(Boolean).slice(0, 2)
    .map((s) => s[0]!.toUpperCase()).join('') || '?';
  const joined = new Date(session.expiresAt - 60 * 60 * 1000)
    .toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

  return (
    <div className="space-y-8">
      <Heading title="Account" subtitle="Your profile and session." />

      <div className="rounded-xl border border-paper-900/[0.06] bg-paper-50 overflow-hidden">
        <div className="p-5 flex items-center gap-4">
          <div className="h-16 w-16 rounded-full bg-gradient-to-br from-accent-500 to-accent-700 grid place-items-center text-white text-[20px] font-semibold shrink-0 shadow-[0_2px_6px_rgba(109,40,217,0.35)]">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <div className="text-[16px] font-semibold text-paper-900 truncate">{name}</div>
              {isDev && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-signal-ai/10 text-signal-ai text-[9.5px] font-semibold uppercase tracking-wide">
                  <Code2 size={9} /> Dev
                </span>
              )}
            </div>
            <div className="text-[12.5px] text-paper-500 truncate">{session.email}</div>
          </div>
        </div>

        <div className="grid grid-cols-2 border-t border-paper-900/[0.05] divide-x divide-paper-900/[0.05]">
          <Stat label="User ID"  value={<span className="font-mono text-[10.5px] text-paper-700 truncate block" title={session.userId}>{session.userId.slice(0, 12)}…</span>} />
          <Stat label="Session"  value={<span className="text-[11px] text-paper-700">expires {joined}</span>} />
        </div>
      </div>

      {isDev ? (
        <div className="rounded-lg border border-signal-ai/20 bg-signal-ai/[0.04] px-4 py-3 text-[11.5px] text-paper-700 leading-relaxed">
          <strong className="text-signal-ai">Dev mode.</strong> Running with{' '}
          <code className="font-mono text-[10.5px]">DEV_SKIP_AUTH=true</code> — no real Cognito session.
          Set the flag to <code className="font-mono text-[10.5px]">false</code> in{' '}
          <code className="font-mono text-[10.5px]">.env.local</code> to sign in with a real account.
        </div>
      ) : (
        <Group title="Session">
          <Button variant="outline" onClick={signOut} disabled={signingOut}>
            {signingOut ? <Loader2 className="animate-spin" size={12} /> : <LogOut size={12} />}
            Sign out
          </Button>
        </Group>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="px-5 py-3">
      <div className="text-[10px] uppercase tracking-wide text-paper-500 font-semibold mb-1">{label}</div>
      {value}
    </div>
  );
}

// ============================================================
// Primitives
// ============================================================

function NavItem({ icon, active, onClick, children }: { icon: React.ReactNode; active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-2 px-2.5 h-8 rounded-md text-[12.5px] font-medium transition-colors text-left',
        active ? 'bg-paper-50 text-paper-900 border border-paper-900/[0.08]'
               : 'text-paper-600 hover:text-paper-900 hover:bg-paper-50',
      )}
    >
      <span className={cn(active ? 'text-accent-600' : 'text-paper-500')}>{icon}</span>
      {children}
    </button>
  );
}

function Heading({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <header>
      <h1 className="text-[20px] font-semibold tracking-tight text-paper-900">{title}</h1>
      {subtitle && <p className="mt-1 text-[12.5px] text-paper-500">{subtitle}</p>}
    </header>
  );
}

function Group({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-2.5">
        <h2 className="text-[13px] font-semibold text-paper-900">{title}</h2>
        {hint && <p className="mt-0.5 text-[11.5px] text-paper-500 leading-relaxed">{hint}</p>}
      </div>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function Toggle({ label, desc, value, onChange }: { label: string; desc?: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-start gap-3 rounded-lg border border-paper-900/[0.06] bg-paper-50 px-4 py-3 cursor-pointer hover:bg-paper-100/60 transition-colors">
      <div className="flex-1">
        <div className="text-[12.5px] font-medium text-paper-900" dangerouslySetInnerHTML={{ __html: label }} />
        {desc && <p className="mt-0.5 text-[11px] text-paper-500 leading-relaxed">{desc}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        onClick={() => onChange(!value)}
        className={cn(
          'mt-0.5 relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors',
          value ? 'bg-accent-600' : 'bg-paper-300',
        )}
      >
        <span className={cn(
          'absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform',
          value ? 'translate-x-4' : 'translate-x-0.5',
        )} />
      </button>
    </label>
  );
}


function prettyKey(k: string): string {
  switch (k) {
    case 'CommandOrControl': return '⌘';
    case 'Shift':            return '⇧';
    case 'Alt':              return '⌥';
    case 'Return':           return '↵';
    case '\\':               return '\\';
    default:                 return k;
  }
}

function DangerRow({ title, desc, onConfirm }: { title: string; desc: string; onConfirm: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex items-start gap-3 rounded-lg border border-signal-live/30 bg-signal-live/[0.04] px-4 py-3.5">
      <Trash2 size={14} className="text-signal-live mt-0.5 shrink-0" />
      <div className="flex-1">
        <div className="text-[12.5px] font-medium text-paper-900">{title}</div>
        <p className="mt-0.5 text-[11px] text-paper-600 leading-relaxed">{desc}</p>
      </div>
      <Button
        variant="danger"
        size="sm"
        disabled={busy}
        onClick={async () => {
          if (!confirm('Are you sure? This cannot be undone.')) return;
          setBusy(true);
          try { await onConfirm(); } finally { setBusy(false); }
        }}
      >
        {busy && <Loader2 className="animate-spin" size={11} />} Wipe
      </Button>
    </div>
  );
}
