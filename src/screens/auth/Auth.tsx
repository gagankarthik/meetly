import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Logo } from '@/components/ui/Logo';
import { Field } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Loader2 } from 'lucide-react';

type Mode = 'sign-in' | 'sign-up';

export function Auth() {
  const [mode, setMode] = useState<Mode>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError(null);
    setBusy(true);
    try {
      const res = mode === 'sign-in'
        ? await window.meetly.auth.signIn({ email, password })
        : await window.meetly.auth.signUp({ email, password, displayName: name || undefined });
      if (!res.ok) setError(humanize(res.error));
    } catch (e: any) {
      setError(humanize(e?.message || 'Something went wrong'));
    } finally {
      setBusy(false);
    }
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
            {mode === 'sign-in' ? 'Welcome back.' : 'Create your account.'}
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

              {error && (
                <div className="text-[12px] text-signal-live bg-signal-live/[0.06] border border-signal-live/20 rounded-lg px-3 py-2">
                  {error}
                </div>
              )}

              <Button
                variant="accent"
                size="lg"
                onClick={submit}
                disabled={busy || !canSubmit({ mode, email, password })}
                className="w-full rounded-lg mt-1"
              >
                {busy && <Loader2 className="animate-spin" size={14} />}
                {!busy && labelFor(mode)}
              </Button>
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="mt-5 text-center text-[12.5px] text-paper-600">
          {mode === 'sign-in' && (
            <>
              No account?{' '}
              <button
                className="text-accent-600 hover:text-accent-700 underline-offset-4 hover:underline"
                onClick={() => { setMode('sign-up'); setError(null); }}
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
                onClick={() => { setMode('sign-in'); setError(null); }}
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

function canSubmit({ email, password }: { mode: Mode; email: string; password: string }) {
  return /.+@.+/.test(email) && password.length >= 8;
}

function labelFor(mode: Mode): string {
  return mode === 'sign-in' ? 'Sign in' : 'Create account';
}

function humanize(err: string): string {
  if (/UserNotConfirmed/i.test(err))            return "Your email isn't confirmed yet.";
  if (/NotAuthorized/i.test(err))               return 'Wrong email or password.';
  if (/UsernameExists|UserExists/i.test(err))   return 'An account with that email already exists.';
  if (/InvalidPassword/i.test(err))             return 'Password must be 8+ chars with a number.';
  if (/CodeMismatch/i.test(err))                return "That code didn't match — try again.";
  if (/ExpiredCode/i.test(err))                 return 'Code expired — request a new one.';
  if (/Cognito not configured/i.test(err))      return 'Run `terraform apply` and fill .env first.';
  return err;
}
