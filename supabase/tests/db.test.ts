import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { citext } from '@electric-sql/pglite/contrib/citext';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Runs every migration against a real (in-process) Postgres, with minimal
// stand-ins for what Supabase provides: roles, auth.users and auth.uid().
const SUPABASE_STUBS = `
  create role anon nologin;
  create role authenticated nologin;
  create schema extensions;
  create schema auth;
  create table auth.users (
    id uuid primary key default gen_random_uuid(),
    email text,
    raw_user_meta_data jsonb default '{}'::jsonb
  );
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth, extensions to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
`;

const MIGRATIONS_DIR = join(__dirname, '..', 'migrations');

let db: PGlite;
let admin: string;
let user: string;
let kg: number;
let potato: number;
let onion: number;

async function as<T>(userId: string, fn: () => Promise<T>): Promise<T> {
  await db.exec(`select set_config('request.jwt.claim.sub', '${userId}', false); set role authenticated;`);
  try {
    return await fn();
  } finally {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
  }
}

type BatchResult = {
  results: { index: number; itemId: number | null; status: string; errors?: Record<string, string[]> }[];
  rolledBack: boolean;
  summary: { created: number; updated: number; unchanged: number; failed: number };
};

async function upsert(date: string, rows: unknown[], atomic = true): Promise<BatchResult> {
  const r = await db.query<{ r: BatchResult }>('select public.upsert_prices($1::date, $2::jsonb, $3) as r', [
    date,
    JSON.stringify(rows),
    atomic,
  ]);
  return r.rows[0].r;
}

async function priceOf(itemId: number, date: string) {
  const r = await db.query<{ price: string }>(
    'select price::text from public.item_prices where item_id = $1 and price_date = $2',
    [itemId, date],
  );
  return r.rows[0]?.price ?? null;
}

beforeAll(async () => {
  db = new PGlite({ extensions: { citext } });
  await db.exec(SUPABASE_STUBS);
  for (const file of readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort()) {
    await db.exec(readFileSync(join(MIGRATIONS_DIR, file), 'utf8'));
  }

  const u1 = await db.query<{ id: string }>(`insert into auth.users (email) values ('owner@example.test') returning id`);
  const u2 = await db.query<{ id: string }>(`insert into auth.users (email) values ('staff@example.test') returning id`);
  admin = u1.rows[0].id;
  user = u2.rows[0].id;

  const ids = await db.query<{ name: string; id: number }>(
    `select name::text, id from public.items where name in ('Potato', 'Onion')
     union all select symbol::text, id from public.units where symbol = 'kg'`,
  );
  const byName = Object.fromEntries(ids.rows.map((r) => [r.name, Number(r.id)]));
  potato = byName.Potato;
  onion = byName.Onion;
  kg = byName.kg;
}, 60_000);

afterAll(async () => {
  await db?.close();
});

describe('migrations + seed', () => {
  it('seeds reference data', async () => {
    const r = await db.query<{ items: number; units: number }>(
      'select (select count(*) from public.items)::int as items, (select count(*) from public.units)::int as units',
    );
    expect(r.rows[0]).toEqual({ items: 20, units: 9 });
  });

  it('makes the first user admin and later users "user"', async () => {
    const r = await db.query<{ email: string; role: string }>(
      `select u.email, r.key as role from auth.users u
       join public.user_roles ur on ur.user_id = u.id join public.roles r on r.id = ur.role_id order by u.email`,
    );
    expect(r.rows).toEqual([
      { email: 'owner@example.test', role: 'admin' },
      { email: 'staff@example.test', role: 'user' },
    ]);
  });
});

describe('upsert_prices', () => {
  it('creates, then reports unchanged, then updates with a revision', async () => {
    const created = await as(admin, () =>
      upsert('2026-09-27', [
        { itemId: potato, unitId: kg, price: '30' },
        { itemId: onion, unitId: kg, price: '35.5' },
      ]),
    );
    expect(created.summary).toEqual({ created: 2, updated: 0, unchanged: 0, failed: 0 });
    expect(await priceOf(potato, '2026-09-27')).toBe('30.00');

    const same = await as(admin, () => upsert('2026-09-27', [{ itemId: potato, unitId: kg, price: '30.00' }]));
    expect(same.results[0].status).toBe('unchanged');

    const updated = await as(admin, () => upsert('2026-09-27', [{ itemId: potato, unitId: kg, price: '32', version: 1 }]));
    expect(updated.results[0].status).toBe('updated');
    expect(await priceOf(potato, '2026-09-27')).toBe('32.00');

    const revisions = await db.query<{ old_price: string; new_price: string }>(
      `select old_price::text, new_price::text from public.item_price_revisions r
       join public.item_prices p on p.id = r.price_id where p.item_id = $1`,
      [potato],
    );
    expect(revisions.rows).toEqual([{ old_price: '30.00', new_price: '32.00' }]);
  });

  it('rejects a stale version instead of overwriting (lost-update protection)', async () => {
    const r = await as(admin, () => upsert('2026-09-27', [{ itemId: potato, unitId: kg, price: '99', version: 1 }]));
    expect(r.rolledBack).toBe(true);
    expect(r.results[0].status).toBe('error');
    expect(r.results[0].errors?.price?.[0]).toMatch(/changed by someone else/i);
    expect(await priceOf(potato, '2026-09-27')).toBe('32.00');
  });

  it('atomic mode: one bad row → nothing saved, good rows reported as skipped', async () => {
    const r = await as(admin, () =>
      upsert('2026-09-28', [
        { itemId: potato, unitId: kg, price: '35' },
        { itemId: onion, unitId: kg, price: '-1' },
      ]),
    );
    expect(r.rolledBack).toBe(true);
    expect(r.results.map((x) => x.status)).toEqual(['skipped', 'error']);
    expect(r.summary.failed).toBe(1);
    expect(await priceOf(potato, '2026-09-28')).toBeNull();
  });

  it('partial mode: good rows saved, bad rows reported', async () => {
    const r = await as(admin, () =>
      upsert(
        '2026-09-28',
        [
          { itemId: potato, unitId: kg, price: '35' },
          { itemId: 999999, unitId: kg, price: '10' },
          { itemId: onion, unitId: kg, price: 'abc' },
        ],
        false,
      ),
    );
    expect(r.rolledBack).toBe(false);
    expect(r.results.map((x) => x.status)).toEqual(['created', 'error', 'error']);
    expect(r.results[1].errors).toHaveProperty('itemId');
    expect(await priceOf(potato, '2026-09-28')).toBe('35.00');
  });

  it('flags the same item twice in one batch', async () => {
    const r = await as(admin, () =>
      upsert(
        '2026-09-29',
        [
          { itemId: onion, unitId: kg, price: '30' },
          { itemId: onion, unitId: kg, price: '31' },
        ],
        false,
      ),
    );
    expect(r.results.map((x) => x.status)).toEqual(['created', 'error']);
  });

  it('refuses users without prices.write', async () => {
    await expect(as(user, () => upsert('2026-09-27', [{ itemId: potato, unitId: kg, price: '1' }]))).rejects.toThrow(
      /permission/i,
    );
  });

  it('keeps previous days untouched and resolves the latest earlier price', async () => {
    const r = await as(admin, () =>
      db.query<{ item_id: number; price_date: string; price: string }>(
        `select item_id, price_date::text, price::text from public.latest_prices_before('2026-09-29') where item_id = $1`,
        [potato],
      ),
    );
    expect(r.rows).toEqual([{ item_id: potato, price_date: '2026-09-28', price: '35.00' }]);
    expect(await priceOf(potato, '2026-09-27')).toBe('32.00');
  });
});

describe('row level security', () => {
  it('normal users can read prices but not write them directly', async () => {
    const read = await as(user, () => db.query('select count(*)::int as n from public.item_prices'));
    expect((read.rows[0] as { n: number }).n).toBeGreaterThan(0);
    await expect(
      as(user, () =>
        db.query(`insert into public.item_prices (item_id, price_date, unit_id, price) values ($1, '2026-10-01', $2, 5)`, [
          potato,
          kg,
        ]),
      ),
    ).rejects.toThrow(/row-level security/i);
  });
});

describe('calculations', () => {
  const DATE = '2026-09-27';

  async function line(itemId: number, qty: string, overrides: Record<string, unknown> = {}) {
    const p = await db.query<{ id: number; price: string }>(
      `select id, price::text from public.item_prices where item_id = $1 and price_date = $2`,
      [itemId, DATE],
    );
    const price = p.rows[0];
    const amount = (Number(qty) * Number(price.price)).toFixed(2);
    return {
      itemId, itemName: 'X', categoryName: null, quantity: qty, unitId: kg, unitSymbol: 'kg',
      normalizedQuantity: qty, price: price.price, priceUnitId: kg, priceUnitSymbol: 'kg',
      priceId: price.id, amount, ...overrides,
    };
  }

  async function save(lines: unknown[], opts: { id?: number; version?: number; finalize?: boolean; key?: string } = {}) {
    const r = await db.query<{ r: { id: number; replayed: boolean } }>(
      `select public.save_calculation($1, $2, $3::date, null, 0, $4::jsonb, $5, $6::uuid) as r`,
      [opts.id ?? null, opts.version ?? null, DATE, JSON.stringify(lines), opts.finalize ?? false, opts.key ?? null],
    );
    return r.rows[0].r;
  }

  const calc = (id: number) =>
    db
      .query<{ status: string; grand_total: string; version: number; reference_number: string }>(
        `select status::text, grand_total::text, version, reference_number from public.calculations where id = $1`,
        [id],
      )
      .then((r) => r.rows[0]);

  it('saves a draft with a reference number and snapshot lines', async () => {
    const { id } = await as(admin, async () => save([await line(potato, '1'), await line(onion, '10')]));
    const c = await calc(id);
    expect(c.status).toBe('draft');
    expect(c.reference_number).toMatch(/^CAL-\d{6}$/);
    expect(c.grand_total).toBe('387.00'); // 1 × 32 + 10 × 35.50
  });

  it('is idempotent: the same key returns the first calculation', async () => {
    const key = '11111111-1111-4111-8111-111111111111';
    const first = await as(admin, async () => save([await line(potato, '2')], { key }));
    const again = await as(admin, async () => save([await line(potato, '2')], { key }));
    expect(again).toEqual({ id: first.id, replayed: true });
    const n = await db.query<{ n: number }>(`select count(*)::int as n from public.calculations where idempotency_key = $1`, [key]);
    expect(n.rows[0].n).toBe(1);
  });

  it('rejects a line whose price does not match the live price', async () => {
    await expect(as(admin, async () => save([await line(potato, '1', { price: '30.00', amount: '30.00' })]))).rejects.toThrow(
      /price of X just changed/i,
    );
  });

  it('rejects a tampered amount', async () => {
    await expect(as(admin, async () => save([await line(potato, '1', { amount: '1.00' })]))).rejects.toThrow(/inconsistent amount/i);
  });

  it('only finalizes through finalize_calculation, then freezes the record', async () => {
    const { id } = await as(admin, async () => save([await line(potato, '1')]));
    await expect(as(admin, () => db.query(`update public.calculations set status = 'finalized' where id = $1`, [id]))).rejects.toThrow(
      /use finalize/i,
    );

    const { version } = await calc(id);
    await as(admin, () => db.query(`select public.finalize_calculation($1, $2)`, [id, version]));
    expect((await calc(id)).status).toBe('finalized');

    await expect(as(admin, async () => save([await line(potato, '5')], { id, version: version + 1 }))).rejects.toThrow(
      /only drafts/i,
    );
    // RLS hides finalized lines from writes: the update touches nothing
    await as(admin, () => db.query(`update public.calculation_items set amount = 0 where calculation_id = $1`, [id]));
    const amounts = await db.query<{ amount: string }>(`select amount::text from public.calculation_items where calculation_id = $1`, [id]);
    expect(amounts.rows).toEqual([{ amount: '32.00' }]);
  });

  it('refuses to finalize a draft whose price changed after saving', async () => {
    const { id } = await as(admin, async () => save([await line(onion, '1')]));
    await as(admin, () => upsert(DATE, [{ itemId: onion, unitId: kg, price: '36' }]));
    const { version } = await calc(id);
    await expect(as(admin, () => db.query(`select public.finalize_calculation($1, $2)`, [id, version]))).rejects.toThrow(
      /changed since this draft was saved/i,
    );
  });

  it('cancel: needs permission and a reason; the record stays', async () => {
    const { id } = await as(admin, async () => save([await line(potato, '1')], { finalize: true }));
    const { version } = await calc(id);
    await expect(as(user, () => db.query(`select public.cancel_calculation($1, $2, 'oops')`, [id, version]))).rejects.toThrow(
      /permission/i,
    );
    await expect(as(admin, () => db.query(`select public.cancel_calculation($1, $2, '')`, [id, version]))).rejects.toThrow(/reason/i);
    await as(admin, () => db.query(`select public.cancel_calculation($1, $2, 'Entered twice')`, [id, version]));
    expect((await calc(id)).status).toBe('cancelled');
    await as(admin, () => db.query(`delete from public.calculations where id = $1`, [id]));
    expect((await calc(id)).status).toBe('cancelled'); // still there
  });

  it('a normal user creates and finalizes their own, and cannot see other users’ calculations', async () => {
    const { id } = await as(user, async () => save([await line(potato, '3')], { finalize: true }));
    expect((await calc(id)).status).toBe('finalized');
    const visible = await as(user, () =>
      db.query<{ n: number }>(`select count(*)::int as n from public.calculations where created_by <> auth.uid()`),
    );
    expect(visible.rows[0].n).toBe(0);
  });

  it('keeps the snapshot price after the price changes (history rule)', async () => {
    const { id } = await as(admin, async () => save([await line(potato, '1')], { finalize: true }));
    await as(admin, () => upsert(DATE, [{ itemId: potato, unitId: kg, price: '50' }]));
    const r = await db.query<{ price: string; amount: string }>(
      `select price::text, amount::text from public.calculation_items where calculation_id = $1`,
      [id],
    );
    expect(r.rows[0]).toEqual({ price: '32.00', amount: '32.00' });
  });
});

describe('reports', () => {
  // Finalized on 2026-09-27 by earlier tests: potato 1 kg (admin), potato 3 kg (user), potato 1 kg (admin) — all @ ₹32.
  // Drafts and the cancelled calculation must not count.
  it('dashboard: admin sees everyone, a user sees only their own', async () => {
    const stats = (id: string) =>
      as(id, () => db.query<{ s: Record<string, unknown> }>(`select public.dashboard_stats('2026-09-27') as s`)).then(
        (r) => r.rows[0].s,
      );
    const a = await stats(admin);
    expect(a).toMatchObject({ todayCalculations: 3, todayTotal: 160, todayLines: 3, yesterdayTotal: 0, weekTotal: 160 });
    expect(Number(a.todayDrafts)).toBeGreaterThan(0);
    const u = await stats(user);
    expect(u).toMatchObject({ todayCalculations: 1, todayTotal: 96 });
  });

  it('item summary uses finalized snapshots only', async () => {
    const r = await as(admin, () =>
      db.query<{ item_id: number; quantity: string; amount: string; avg_rate: string; calculations: number }>(
        `select item_id, quantity::text, amount::text, avg_rate::text, calculations::int
         from public.report_item_summary('2026-09-27', '2026-09-27')`,
      ),
    );
    expect(r.rows).toEqual([{ item_id: potato, quantity: '5.000000', amount: '160.00', avg_rate: '32.00', calculations: 3 }]);
  });

  it('daily totals include empty days and reject bad ranges', async () => {
    const r = await as(admin, () =>
      db.query<{ day: string; calculations: number; total: string }>(
        `select day::text, calculations::int, total::text from public.report_daily_totals('2026-09-26', '2026-09-27')`,
      ),
    );
    expect(r.rows).toEqual([
      { day: '2026-09-27', calculations: 3, total: '160.00' },
      { day: '2026-09-26', calculations: 0, total: '0' },
    ]);
    await expect(as(admin, () => db.query(`select * from public.report_daily_totals('2026-09-27', '2026-09-01')`))).rejects.toThrow(
      /valid date range/i,
    );
  });
});

describe('user administration', () => {
  const roles = (id: string) =>
    db
      .query<{ key: string }>(
        `select r.key from public.user_roles ur join public.roles r on r.id = ur.role_id where ur.user_id = $1 order by 1`,
        [id],
      )
      .then((r) => r.rows.map((x) => x.key));

  it('copies emails onto profiles', async () => {
    const r = await db.query<{ email: string }>(`select email from public.profiles where user_id = $1`, [user]);
    expect(r.rows[0].email).toBe('staff@example.test');
  });

  it('never allows zero active admins', async () => {
    await expect(as(admin, () => db.query(`select public.set_user_roles($1, array['user'])`, [admin]))).rejects.toThrow(
      /at least one active admin/i,
    );
    expect(await roles(admin)).toEqual(['admin']);

    // Promote someone else first, then the original admin can step down
    await as(admin, () => db.query(`select public.set_user_roles($1, array['admin'])`, [user]));
    await as(admin, () => db.query(`select public.set_user_roles($1, array['user'])`, [admin]));
    expect(await roles(admin)).toEqual(['user']);
    // restore
    await as(user, () => db.query(`select public.set_user_roles($1, array['admin'])`, [admin]));
    await as(admin, () => db.query(`select public.set_user_roles($1, array['user'])`, [user]));
    expect(await roles(user)).toEqual(['user']);
  });

  it('only managers change roles or activation; nobody deactivates themselves', async () => {
    await expect(as(user, () => db.query(`select public.set_user_roles($1, array['admin'])`, [user]))).rejects.toThrow(/permission/i);
    await expect(as(user, () => db.query(`update public.profiles set email = 'x@y.z' where user_id = $1`, [user]))).rejects.toThrow(
      /only administrators/i,
    );
    await as(user, () => db.query(`update public.profiles set full_name = 'Staff Member' where user_id = $1`, [user]));
    await expect(as(admin, () => db.query(`update public.profiles set active = false where user_id = $1`, [admin]))).rejects.toThrow(
      /your own account/i,
    );
    await as(admin, () => db.query(`update public.profiles set active = false where user_id = $1`, [user]));
    const perms = await as(user, () => db.query<{ n: number }>(`select count(*)::int as n from public.my_permissions()`));
    expect(perms.rows[0].n).toBe(0); // deactivated users lose every permission
    await as(admin, () => db.query(`update public.profiles set active = true where user_id = $1`, [user]));
  });
});
