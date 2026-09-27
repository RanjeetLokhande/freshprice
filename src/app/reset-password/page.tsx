'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Alert, Button, TextField } from '@/components/ui';
import { getBrowserSupabase } from '@/lib/supabase/browser';

const schema = z
  .object({
    password: z.string().min(8, 'Password must be at least 8 characters.'),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'Passwords do not match.' });
type FormValues = z.infer<typeof schema>;

// Reached from the recovery email (via /auth/callback) or from More → Change password.
export default function ResetPasswordPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = handleSubmit(async ({ password }) => {
    setError(null);
    const { error } = await getBrowserSupabase().auth.updateUser({ password });
    if (error) {
      setError(error.message);
      return;
    }
    router.replace('/');
    router.refresh();
  });

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-4 py-10">
      <h1 className="mb-1 text-2xl font-semibold">Set a new password</h1>
      <p className="mb-6 text-sm text-muted">Use at least 8 characters.</p>
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        {error && <Alert>{error}</Alert>}
        <TextField
          label="New password"
          type="password"
          autoComplete="new-password"
          {...register('password')}
          error={errors.password?.message}
        />
        <TextField
          label="Confirm password"
          type="password"
          autoComplete="new-password"
          {...register('confirm')}
          error={errors.confirm?.message}
        />
        <Button type="submit" loading={isSubmitting} className="mt-2 w-full">
          Save password
        </Button>
      </form>
    </main>
  );
}
