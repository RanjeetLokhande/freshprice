'use client';

import { useMemo, useState } from 'react';
import { ApiClientError } from '@/client/api-client';
import { useMasters } from '@/client/queries/bootstrap';
import { useSaveSettings, useSettings } from '@/client/queries/masters';
import { Alert, Button, PageTitle, Skeleton } from '@/components/ui';
import { useToast } from '@/components/toast';
import { validateSetting, type SettingDto } from '@/shared/settings-rules';

const INPUT =
  'min-h-12 w-full rounded-xl border border-border bg-surface px-4 text-base outline-none focus:border-brand aria-[invalid=true]:border-danger';

export default function SettingsPage() {
  const { derived } = useMasters();
  const settings = useSettings();
  const save = useSaveSettings();
  const toast = useToast();

  // Only edited values live here; everything else comes from the server cache.
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  const rows = useMemo(() => settings.data ?? [], [settings.data]);
  const canWrite = derived?.can('settings.write') ?? false;

  const changes = useMemo(
    () =>
      rows
        .filter((s) => s.key in draft && JSON.stringify(draft[s.key]) !== JSON.stringify(s.value))
        .map((s) => ({ key: s.key, value: draft[s.key], version: s.version })),
    [rows, draft],
  );

  function setValue(s: SettingDto, value: unknown) {
    setDraft((d) => ({ ...d, [s.key]: value }));
    const message = validateSetting(s, value);
    setErrors((e) => {
      const next = { ...e };
      if (message) next[s.key] = message;
      else delete next[s.key];
      return next;
    });
  }

  async function onSave() {
    if (Object.keys(errors).length) return;
    try {
      const res = await save.mutateAsync(changes);
      const failed: Record<string, string> = {};
      for (const r of res.results) if (r.status === 'error') failed[r.key] = Object.values(r.errors ?? {}).flat().join(' ');
      setErrors(failed);
      // Keep failed edits in the draft so the user can fix them
      setDraft((d) => Object.fromEntries(Object.entries(d).filter(([k]) => k in failed)));
      if (res.summary.failed === 0) toast.show(`${res.summary.updated} setting${res.summary.updated === 1 ? '' : 's'} saved`);
      else toast.show(`${res.summary.updated} saved, ${res.summary.failed} need attention`, 'error');
    } catch (e) {
      if (e instanceof ApiClientError && e.errors) setErrors(Object.fromEntries(Object.entries(e.errors).map(([k, v]) => [k, v.join(' ')])));
      toast.error(e);
    }
  }

  if (settings.isPending) return <Skeleton className="h-96" />;
  if (settings.isError) return <Alert>Could not load settings. {settings.error.message}</Alert>;

  return (
    <>
      <PageTitle title="Settings" subtitle="Business rules used across the app." />
      {!canWrite && (
        <div className="mb-4">
          <Alert tone="info">You can view settings but not change them.</Alert>
        </div>
      )}

      <fieldset disabled={!canWrite} className="flex flex-col gap-3">
        {rows.map((s) => {
          const value = s.key in draft ? draft[s.key] : s.value;
          const id = `setting-${s.key}`;
          const error = errors[s.key];
          const aria = { id, 'aria-invalid': error ? true : undefined, 'aria-describedby': `${id}-hint` } as const;

          return (
            <div key={s.key} className="rounded-2xl border border-border bg-surface p-4">
              {s.dataType === 'boolean' ? (
                <label htmlFor={id} className="flex min-h-11 cursor-pointer items-center justify-between gap-4">
                  <span className="font-medium">{s.label}</span>
                  <input
                    type="checkbox"
                    className="size-6 accent-[var(--brand)]"
                    checked={Boolean(value)}
                    onChange={(e) => setValue(s, e.target.checked)}
                    {...aria}
                  />
                </label>
              ) : (
                <div className="flex flex-col gap-1.5">
                  <label htmlFor={id} className="font-medium">
                    {s.label}
                  </label>
                  {s.dataType === 'select' ? (
                    <select className={INPUT} value={String(value ?? '')} onChange={(e) => setValue(s, e.target.value)} {...aria}>
                      {(s.options ?? []).map((o) => (
                        <option key={o} value={o}>
                          {o.replace(/_/g, ' ')}
                        </option>
                      ))}
                    </select>
                  ) : s.dataType === 'number' ? (
                    <input
                      type="text"
                      inputMode="numeric"
                      className={`${INPUT} num`}
                      value={value === null || value === undefined ? '' : String(value)}
                      onChange={(e) => setValue(s, e.target.value === '' ? null : Number(e.target.value))}
                      {...aria}
                    />
                  ) : (
                    <input
                      type="text"
                      className={INPUT}
                      value={String(value ?? '')}
                      onChange={(e) => setValue(s, e.target.value)}
                      {...aria}
                    />
                  )}
                </div>
              )}
              <p id={`${id}-hint`} className={`mt-1.5 text-sm ${error ? 'text-danger' : 'text-muted'}`}>
                {error ?? s.description}
              </p>
            </div>
          );
        })}
      </fieldset>

      {canWrite && changes.length > 0 && (
        <div className="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-20 border-t border-border bg-surface px-4 py-3 md:bottom-0 md:left-56">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
            <span className="text-sm text-muted">
              {changes.length} unsaved change{changes.length === 1 ? '' : 's'}
            </span>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                onClick={() => {
                  setDraft({});
                  setErrors({});
                }}
              >
                Discard
              </Button>
              <Button onClick={onSave} loading={save.isPending} disabled={Object.keys(errors).length > 0}>
                Save
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
