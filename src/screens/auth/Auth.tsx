import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Logo } from '@/components/ui/Logo';
import { Field } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Loader2, ArrowLeft } from 'lucide-react';

type Mode = 'sign-in' | 'sign-up' | 'confirm';

export function Auth() {
  const [mode, setMode] = useState<Mode>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const resendCooldownRef = useRef<number>(0);
  const [, force] = useState(0);

  // Tick every second so the resend cooldown counter re-renders.
  useEffect(() => {
    if (mode !== 'confirm') return;
    const id = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [mode]);

  const cooldownLeft = Math.max(0, Math.ceil((resendCooldownRef.current - Date.now()) / 1000));

  const goToConfirm = (forEmail: string) => {
    setMode('confirm');
    setEmail(forEmail);
    setCode('');
    setError(null);
    setInfo("We sent a 6-digit code to your email. Enter it below.");
    resendCooldownRef.current = Date.now() + 30_000;
  };

  const submitSignIn = async () => {
    const res = await window.meetly.auth.signIn({ email, password });
    if (!res.ok) {
      if (/UserNotConfirmed/i.test(res.reason || res.error || '')) {
        await window.meetly.auth.resendCode({ email }).catch(() => {/* noop */});
        goToConfirm(email);
        return;
      }
      setError(humanize(res.error));
    }
  };

  const submitSignUp = async () => {
    const res = await window.meetly.auth.signUp({ email, password, displayName: name || undefined });
    if (!res.ok) { setError(humanize(res.error)); return; }
    goToConfirm(res.email);
  };

  const submitConfirm = async () => {
    const res = await window.meetly.auth.confirmSignUp({ email, code: code.trim(), password });
    if (!res.ok) { setError(humanize(res.error)); return; }
    if ('requiresSignIn' in res) {
      setMode('sign-in');
      setInfo('Account confirmed. Please sign in.');
    }
    // ok+session → main process closed this window and opened the hub.
  };

  const submit = async () => {
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      if (mode === 'sign-in') await submitSignIn();
      else if (mode === 'sign-up') await submitSignUp();
      else await submitConfirm();
    } catch (e: any) {
      setError(humanize(e?.message || 'Something went wrong'));
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    if (cooldownLeft > 0) return;
    setError(null);
    const res = await window.meetly.auth.resendCode({ email });
    if (!res.ok) { setError(humanize(res.error)); return; }
    setInfo('New code sent — check your email.');
    resendCooldownRef.current = Date.now() + 30_000;
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center px-6 py-10 relative">
      <div className="absolute inset-0 grid-lines opacity-50 pointer-events-none" />
      <div
        className="absolute top-0 left-1/2 -translate-x-1/2 h-[420px] w-[820px] rounded-full pointer-events-none"
        style={{
          background: 'radial-gradient(closest-side, rgba(109,40,217,0.18), transparent 70%)',
          filter: 'blur(36px)',
        }}
      />

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.2, 0.8, 0.2, 1] }}
        className="relative w-full max-w-[380px]"
      >
        <div className="flex flex-col items-center mb-7">
          <Logo size="lg" />
          <p className="mt-3 text-[13px] text-paper-600">
            {mode === 'sign-in' && 'Welcome back.'}
            {mode === 'sign-up' && 'Create your account.'}
            {mode === 'confirm' && 'Confirm your email.'}
          </p>
        </div>

        <div className="rounded-2xl p-5 space-y-3 bg-paper-50 border border-paper-900/[0.06] shadow-glass-soft">
          <AnimatePresence mode="wait">
            <motion.div
              key={mode}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18 }}
              className="space-y-3"
            >
              {mode === 'confirm' ? (
                <>
                  <div className="text-[12.5px] text-paper-600 leading-relaxed">
                    Code sent to <span className="text-paper-800 font-medium">{email}</span>.
                  </div>
                  <Field
                    label="6-digit code"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder=" "
                    autoFocus
                    inputMode="numeric"
                    autoComplete="one-time-code"
                  />
                </>
              ) : (
                <>
                  {mode === 'sign-up' && (
                    <Field
                      label="Name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder=" "
                    />
                  )}
                  <Field
                    label="Email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    placeholder=" "
                    autoFocus={mode === 'sign-in'}
                  />
                  <Field
                    label="Password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'}
                    placeholder=" "
                    hint={mode === 'sign-up' ? '8+ chars, with a number' : undefined}
                  />
                </>
              )}

              {error && (
                <div className="text-[12px] text-signal-live bg-signal-live/[0.06] border border-signal-live/20 rounded-lg px-3 py-2">
                  {error}
                </div>
              )}
              {!error && info && (
                <div className="text-[12px] text-paper-700 bg-paper-100 border border-paper-900/[0.06] rounded-lg px-3 py-2">
                  {info}
                </div>
              )}

              <Button
                variant="accent"
                size="lg"
                onClick={submit}
                disabled={busy || !canSubmit({ mode, email, password, code })}
                className="w-full rounded-lg mt-1"
              >
                {busy && <Loader2 className="animate-spin" size={14} />}
                {!busy && labelFor(mode)}
              </Button>

              {mode === 'confirm' && (
                <div className="flex items-center justify-between text-[12px] pt-1">
                  <button
                    className="text-paper-600 hover:text-paper-800 inline-flex items-center gap-1"
                    onClick={() => { setMode('sign-up'); setError(null); setInfo(null); }}
                  >
                    <ArrowLeft size={12} /> Back
                  </button>
                  <button
                    disabled={cooldownLeft > 0 || busy}
                    onClick={resend}
                    className={cooldownLeft > 0
                      ? 'text-paper-400 cursor-not-allowed'
                      : 'text-accent-600 hover:text-accent-700 underline-offset-4 hover:underline'}
                  >
                    {cooldownLeft > 0 ? `Resend in ${cooldownLeft}s` : 'Resend code'}
                  </button>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="mt-5 text-center text-[12.5px] text-paper-600">
          {mode === 'sign-in' && (
            <>
              No account?{' '}
              <button
                className="text-accent-600 hover:text-accent-700 underline-offset-4 hover:underline"
                onClick={() => { setMode('sign-up'); setError(null); setInfo(null); }}
              >
                Sign up
              </button>
            </>
          )}
          {mode === 'sign-up' && (
            <>
              Have an account?{' '}
              <button
                className="text-accent-600 hover:text-accent-700"
                onClick={() => { setMode('sign-in'); setError(null); setInfo(null); }}
              >
                Sign in
              </button>
            </>
          )}
        </div>

        <p className="mt-10 text-center text-[11px] text-paper-500 leading-relaxed">
          By continuing you agree to our terms.
          <br />Audio is processed via Deepgram and OpenAI per their policies.
        </p>
      </motion.div>
    </div>
  );
}

function canSubmit({ mode, email, password, code }: { mode: Mode; email: string; password: string; code: string }) {
  if (mode === 'confirm') return /^\d{6}$/.test(code);
  return /.+@.+/.test(email) && password.length >= 8;
}

function labelFor(mode: Mode): string {
  if (mode === 'sign-in') return 'Sign in';
  if (mode === 'sign-up') return 'Create account';
  return 'Confirm';
}

function humanize(err: string): string {
  if (/UserNotConfirmed/i.test(err))            return "Your email isn't confirmed yet — check your inbox for a code.";
  if (/NotAuthorized/i.test(err))               return 'Wrong email or password.';
  if (/UsernameExists|UserExists/i.test(err))   return 'An account with that email already exists.';
  if (/InvalidPassword/i.test(err))             return 'Password must be 8+ chars with a number.';
  if (/CodeMismatch/i.test(err))                return "That code didn't match — try again.";
  if (/ExpiredCode/i.test(err))                 return 'Code expired — request a new one.';
  if (/LimitExceeded/i.test(err))               return 'Too many attempts — try again in a minute.';
  if (/already confirmed/i.test(err))           return 'Already confirmed — try signing in.';
  return err;
}
