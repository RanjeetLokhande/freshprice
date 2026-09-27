'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { useQueryClient } from '@tanstack/react-query';
import { Alert, Button, TextField } from '@/components/ui';
import { LeafIcon } from '@/components/icons';
import { getBrowserSupabase } from '@/lib/supabase/browser';

const schema = z.object({
  email: z.email('Enter a valid email address.'),
  password: z.string().min(8, 'Password must be at least 8 characters.'),
  fullName: z.string().max(80).optional(),
});
type FormValues = z.infer<typeof schema>;

function safeNext(next: string | null) {
  // Only allow same-site relative paths
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/';
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const linkError = params.get('error') === 'link';
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [message, setMessage] = useState<{ tone: 'danger' | 'info'; text: string } | null>(null);
  const [unconfirmedEmail, setUnconfirmedEmail] = useState<string | null>(null);
  const [resending, setResending] = useState(false);

  const {
    register,
    handleSubmit,
    getValues,
    trigger,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });
  const [sendingReset, setSendingReset] = useState(false);

  const callbackUrl = (next: string) =>
    `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;

  async function forgotPassword() {
    setMessage(null);
    if (!(await trigger('email'))) return;
    const email = getValues('email');
    setSendingReset(true);
    const { error } = await getBrowserSupabase().auth.resetPasswordForEmail(email, {
      redirectTo: callbackUrl('/reset-password'),
    });
    setSendingReset(false);
    setMessage(
      error
        ? { tone: 'danger', text: error.status === 429 ? 'Too many emails sent. Wait a minute and try again.' : error.message }
        : { tone: 'info', text: `If ${email} has an account, a reset link is on its way. Open it on this device.` },
    );
  }

  async function resendConfirmation() {
    if (!unconfirmedEmail) return;
    setResending(true);
    const { error } = await getBrowserSupabase().auth.resend({
      type: 'signup',
      email: unconfirmedEmail,
      options: { emailRedirectTo: callbackUrl('/') },
    });
    setResending(false);
    setMessage(
      error
        ? { tone: 'danger', text: error.message }
        : { tone: 'info', text: `Confirmation email sent to ${unconfirmedEmail}. Open the link, then sign in.` },
    );
  }

  const onSubmit = handleSubmit(async ({ email, password, fullName }) => {
    setMessage(null);
    setUnconfirmedEmail(null);
    const supabase = getBrowserSupabase();

    if (mode === 'signin') {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        if (error.code === 'email_not_confirmed') {
          setUnconfirmedEmail(email);
          setMessage({ tone: 'danger', text: 'Your email is not confirmed yet. Open the link we emailed you.' });
        } else if (error.code === 'invalid_credentials') {
          setMessage({ tone: 'danger', text: 'Email or password is incorrect.' });
        } else if (error.status === 429) {
          setMessage({ tone: 'danger', text: 'Too many attempts. Wait a minute and try again.' });
        } else {
          setMessage({ tone: 'danger', text: error.message });
        }
        return;
      }
    } else {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName || undefined }, emailRedirectTo: callbackUrl('/') },
      });
      if (error) {
        setMessage({ tone: 'danger', text: error.message });
        return;
      }
      if (!data.session) {
        setMessage({ tone: 'info', text: 'Account created. Check your email to confirm, then sign in.' });
        setMode('signin');
        return;
      }
    }

    queryClient.clear();
    router.replace(safeNext(params.get('next')));
    router.refresh();
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      {linkError && !message && (
        <Alert>
          That email link has expired or was already used. Each link works once. Request a new one below and open
          the newest email.
        </Alert>
      )}
      {message && <Alert tone={message.tone}>{message.text}</Alert>}
      {unconfirmedEmail && (
        <Button type="button" variant="secondary" loading={resending} onClick={resendConfirmation}>
          Resend confirmation email
        </Button>
      )}
      {mode === 'signup' && (
        <TextField label="Your name" autoComplete="name" {...register('fullName')} error={errors.fullName?.message} />
      )}
      <TextField
        label="Email"
        type="email"
        inputMode="email"
        autoComplete="email"
        autoCapitalize="none"
        {...register('email')}
        error={errors.email?.message}
      />
      <TextField
        label="Password"
        type="password"
        autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
        {...register('password')}
        error={errors.password?.message}
      />
      {mode === 'signin' && (
        <button
          type="button"
          onClick={forgotPassword}
          disabled={sendingReset}
          className="-mt-2 min-h-11 self-end text-sm font-medium text-brand disabled:opacity-60"
        >
          {sendingReset ? 'Sending…' : 'Forgot password?'}
        </button>
      )}
      <Button type="submit" loading={isSubmitting} className="mt-2 w-full">
        {mode === 'signin' ? 'Sign in' : 'Create account'}
      </Button>
      <button
        type="button"
        className="min-h-11 text-sm font-medium text-brand"
        onClick={() => {
          setMessage(null);
          setMode(mode === 'signin' ? 'signup' : 'signin');
        }}
      >
        {mode === 'signin' ? 'New here? Create an account' : 'Already have an account? Sign in'}
      </button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-4 py-10">
      <div className="mb-8 flex flex-col items-center gap-2 text-center">
        <span className="flex size-14 items-center justify-center rounded-2xl bg-brand-soft text-brand">
          <LeafIcon width={30} height={30} />
        </span>
        <h1 className="text-2xl font-semibold">Fresh Price</h1>
        <p className="text-sm text-muted">Daily prices and cost calculation</p>
      </div>
      <Suspense>
        <LoginForm />
      </Suspense>
    </main>
  );
}
