'use client';

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { ApiClientError } from '@/client/api-client';

type Tone = 'success' | 'error' | 'info';
interface Toast {
  id: number;
  tone: Tone;
  text: string;
  detail?: string;
}

interface ToastApi {
  show: (text: string, tone?: Tone, detail?: string) => void;
  /** Shows an API error with its requestId so support can trace it. */
  error: (error: unknown, fallback?: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const show = useCallback((text: string, tone: Tone = 'success', detail?: string) => {
    const id = nextId.current++;
    setToasts((t) => [...t.slice(-2), { id, tone, text, detail }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === 'error' ? 7000 : 3500);
  }, []);

  const error = useCallback(
    (e: unknown, fallback = 'Something went wrong.') => {
      if (e instanceof ApiClientError) show(e.message, 'error', e.requestId ? `Ref: ${e.requestId.slice(0, 16)}` : undefined);
      else show(fallback, 'error');
    },
    [show],
  );

  const tones: Record<Tone, string> = {
    success: 'bg-brand text-brand-fg',
    error: 'bg-danger text-white',
    info: 'bg-text text-bg',
  };

  return (
    <ToastContext.Provider value={{ show, error }}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-[60] flex flex-col items-center gap-2 px-4 md:bottom-6"
      >
        {toasts.map((t) => (
          <div key={t.id} role={t.tone === 'error' ? 'alert' : 'status'} className={`pointer-events-auto w-full max-w-sm rounded-xl px-4 py-3 text-sm shadow-lg ${tones[t.tone]}`}>
            <div className="font-medium">{t.text}</div>
            {t.detail && <div className="mt-0.5 text-xs opacity-80">{t.detail}</div>}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside ToastProvider');
  return ctx;
}
