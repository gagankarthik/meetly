import { useEffect, useState } from 'react';
import { Library } from '@/screens/library/Library';
import { PrivacySection, HotkeySection, AccountSection, SettingsSection } from '@/screens/settings/Settings';
import { cn } from '@/lib/utils';
import { FolderClock, ShieldCheck, Keyboard, Plus, Loader2, LogIn, ChevronRight } from 'lucide-react';
import type { UserSettings, AuthSession } from '@shared/types';

type Section = 'transcripts' | 'privacy' | 'shortcuts' | 'account';

export function Hub() {
  const [section, setSection] = useState<Section>('transcripts');
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [session, setSession] = useState<AuthSession | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    window.meetly.settings.get().then(setSettings);
    return window.meetly.settings.onChanged(setSettings);
  }, []);

  useEffect(() => {
    window.meetly.auth.getSession()
      .then(setSession)
      .finally(() => setAuthChecked(true));
    return window.meetly.auth.onSessionChanged(setSession);
  }, []);

  if (!authChecked) {
    return (
      <div className="h-screen grid place-items-center text-paper-500 text-sm gap-3">
        <Loader2 className="animate-spin" size={20} />
        <div>Checking session…</div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="h-screen grid place-items-center bg-paper-100">
        <div className="text-center max-w-[360px] p-8">
          <h1 className="text-[20px] font-semibold text-paper-900">Please sign in</h1>
          <p className="mt-2 text-[13px] text-paper-600">
            You need to be signed in to access your meetings.
          </p>
          <button
            onClick={() => window.meetly.window.openAuth()}
            className="mt-5 inline-flex items-center gap-2 h-10 px-5 rounded-lg bg-paper-900 text-paper-50 text-[13px] font-medium hover:bg-paper-800"
          >
            <LogIn size={13} /> Open sign-in
          </button>
        </div>
      </div>
    );
  }

  const startNewMeeting = async () => {
    await window.meetly.window.startMeeting();
  };

  return (
    <div className="h-screen w-screen flex bg-paper-50 text-paper-900">
      {/* ===== Sidebar ===== */}
      <aside className="w-[248px] shrink-0 flex flex-col bg-paper-100 border-r border-paper-900/[0.07]">
        {/* Top spacing — breathing room from the native window title bar */}
        <div className="h-7"></div>

        <div className="px-3 pt-1 pb-3">
          <button
            onClick={startNewMeeting}
            className="w-full inline-flex items-center justify-center gap-2 h-11 px-3 rounded-xl text-[13.5px] font-semibold transition-all active:scale-[0.98] bg-gradient-to-br from-accent-600 to-accent-700 text-white hover:from-accent-700 hover:to-accent-700 shadow-[0_2px_8px_rgba(109,40,217,0.32)]"
          >
            <Plus size={15} />
            New meeting
          </button>
        </div>

        <div className="px-3 pt-3 pb-1.5 text-[10px] uppercase tracking-[0.14em] font-semibold text-paper-500">
          Workspace
        </div>
        <nav className="px-2 flex flex-col gap-0.5">
          <NavItem icon={<FolderClock size={14} />} active={section === 'transcripts'} onClick={() => setSection('transcripts')}>Transcripts</NavItem>
          <NavItem icon={<ShieldCheck size={14} />} active={section === 'privacy'}     onClick={() => setSection('privacy')}>Privacy</NavItem>
          <NavItem icon={<Keyboard size={14} />}    active={section === 'shortcuts'}   onClick={() => setSection('shortcuts')}>Shortcuts</NavItem>
        </nav>

        {/* ===== Bottom: User profile, anchored to viewport floor ===== */}
        <div className="mt-auto">
          <button
            onClick={() => setSection('account')}
            className={cn(
              'group w-full text-left flex items-center gap-3 px-3 py-3 border-t transition-colors',
              section === 'account'
                ? 'bg-paper-50 border-paper-900/[0.08]'
                : 'border-paper-900/[0.07] hover:bg-paper-50/70',
            )}
            title="Account & settings"
          >
            <UserAvatar session={session} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="text-[12.5px] font-semibold text-paper-900 truncate">
                  {session.displayName || session.email.split('@')[0]}
                </span>
                {session.idToken === 'dev' && (
                  <span className="px-1 py-px rounded text-[8.5px] font-bold uppercase tracking-wide bg-signal-ai/15 text-signal-ai">
                    DEV
                  </span>
                )}
              </div>
              <div className="text-[10.5px] text-paper-500 truncate">{session.email}</div>
            </div>
            <ChevronRight size={13} className="text-paper-400 group-hover:text-paper-700 shrink-0 transition-colors" />
          </button>
        </div>
      </aside>

      {/* ===== Main content ===== */}
      <main className="flex-1 min-w-0 bg-paper-50 flex flex-col">
        {/* Top breathing strip — leaves clean space under the native title bar */}
        <div className="h-7 shrink-0"></div>
        <div className="flex-1 min-h-0">
          {section === 'transcripts' && <Library />}
          {section === 'privacy'     && settings && <SettingsSection><PrivacySection settings={settings} /></SettingsSection>}
          {section === 'shortcuts'   && settings && <SettingsSection><HotkeySection  settings={settings} /></SettingsSection>}
          {section === 'account'     && settings && <SettingsSection><AccountSection settings={settings} /></SettingsSection>}
        </div>
      </main>
    </div>
  );
}

function NavItem({
  icon, active, onClick, children,
}: {
  icon: React.ReactNode;
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'group flex items-center gap-2.5 px-2.5 h-9 rounded-lg text-[13px] font-medium transition-all text-left',
        active
          ? 'bg-paper-50 text-paper-900 shadow-[0_1px_2px_rgba(15,15,13,0.06)] border border-paper-900/[0.08]'
          : 'text-paper-600 hover:text-paper-900 hover:bg-paper-50/70 border border-transparent',
      )}
    >
      <span className={cn(active ? 'text-accent-600' : 'text-paper-500 group-hover:text-paper-700')}>{icon}</span>
      <span className="flex-1">{children}</span>
    </button>
  );
}

function UserAvatar({ session }: { session: AuthSession }) {
  const name = session.displayName || session.email.split('@')[0];
  const initials = name
    .split(/\s+|\./).filter(Boolean).slice(0, 2)
    .map((s) => s[0]!.toUpperCase()).join('') || '?';
  return (
    <div className="h-10 w-10 rounded-full bg-gradient-to-br from-accent-500 to-accent-700 grid place-items-center text-white text-[13px] font-semibold shrink-0 shadow-[0_2px_6px_rgba(109,40,217,0.25)]">
      {initials}
    </div>
  );
}
