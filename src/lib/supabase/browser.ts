import { createBrowserClient } from '@supabase/ssr';
import type { Database } from './database.types';
import { SUPABASE_KEY, SUPABASE_URL } from './env';

let client: ReturnType<typeof createBrowserClient<Database>> | undefined;

/** Browser client — used only for auth (sign in/out). Data goes through /api. */
export function getBrowserSupabase() {
  client ??= createBrowserClient<Database>(SUPABASE_URL, SUPABASE_KEY);
  return client;
}
