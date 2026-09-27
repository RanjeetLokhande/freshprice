import { NextResponse } from 'next/server';
import { loadBootstrap } from '@/server/bootstrap';
import { ok, withApi } from '@/server/api/with-api';

export const dynamic = 'force-dynamic';

// Masters + settings + permissions in one response. The ETag lets the client revalidate cheaply (304).
export const GET = withApi({}, async ({ req, supabase, user }) => {
  const data = await loadBootstrap(supabase, user!);
  const etag = `"${data.version}"`;
  const headers = { ETag: etag, 'Cache-Control': 'private, no-cache' };

  if (req.headers.get('if-none-match') === etag) {
    return new NextResponse(null, { status: 304, headers });
  }
  return ok(data, { headers });
});
