import { z } from 'zod';
import type { BatchRowResult } from '@/shared/api';
import { validateSetting, type SettingDto } from '@/shared/settings-rules';
import type { ServerSupabase } from '@/lib/supabase/server';
import type { Json } from '@/lib/supabase/database.types';
import { ok, withApi } from '@/server/api/with-api';

async function loadSettings(supabase: ServerSupabase): Promise<SettingDto[]> {
  const { data, error } = await supabase.from('app_settings').select('*').order('sort_order');
  if (error) throw error;
  return (data ?? []).map((s) => ({
    key: s.key,
    value: s.value,
    dataType: s.data_type as SettingDto['dataType'],
    label: s.label,
    description: s.description,
    options: (s.options as string[] | null) ?? null,
    sortOrder: s.sort_order,
    version: s.version,
  }));
}

export const GET = withApi({}, async ({ supabase }) => ok(await loadSettings(supabase)));

const bodySchema = z.object({
  changes: z
    .array(z.object({ key: z.string().min(1).max(100), value: z.unknown(), version: z.number().int().positive() }))
    .min(1, 'Nothing to save.')
    .max(100),
});

type SettingStatus = 'updated' | 'unchanged';

/**
 * Batch update with a result per row (partial mode): valid rows are saved,
 * invalid or stale rows are reported and left unchanged.
 */
export const PUT = withApi({ permission: 'settings.write', body: bodySchema }, async ({ supabase, body }) => {
  const current = new Map((await loadSettings(supabase)).map((s) => [s.key, s]));

  const results = await Promise.all(
    body.changes.map(async (change, index): Promise<BatchRowResult<SettingStatus> & { key: string }> => {
      const setting = current.get(change.key);
      if (!setting) return { index, key: change.key, status: 'error', errors: { key: ['Unknown setting.'] } };

      const message = validateSetting(setting, change.value);
      if (message) return { index, key: change.key, status: 'error', errors: { value: [message] } };

      if (JSON.stringify(setting.value) === JSON.stringify(change.value)) {
        return { index, key: change.key, status: 'unchanged' };
      }

      const { data, error } = await supabase
        .from('app_settings')
        .update({ value: change.value as Json })
        .eq('key', change.key)
        .eq('version', change.version)
        .select('key')
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        return {
          index,
          key: change.key,
          status: 'error',
          errors: { value: ['Changed by someone else. Reload and try again.'] },
        };
      }
      return { index, key: change.key, status: 'updated' };
    }),
  );

  const summary = {
    updated: results.filter((r) => r.status === 'updated').length,
    unchanged: results.filter((r) => r.status === 'unchanged').length,
    failed: results.filter((r) => r.status === 'error').length,
  };
  return ok({ results, summary, settings: await loadSettings(supabase) });
});
