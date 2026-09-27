import type { EmailOtpType } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';
import { getServerSupabase } from '@/lib/supabase/server';

const EMAIL_OTP_TYPES: EmailOtpType[] = ['signup', 'recovery', 'invite', 'magiclink', 'email_change', 'email'];

function safeNext(next: string | null) {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/';
}

/**
 * Email links (sign-up confirmation, password recovery) land here.
 *  - ?token_hash=…&type=… : verified on the server, works in ANY browser (phone email apps included).
 *    Requires the Supabase email templates to link here (see docs/deployment.md).
 *  - ?code=…              : PKCE fallback, only works in the browser that requested the email.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;
  const code = searchParams.get('code');
  // Recovery links always continue to the new-password screen
  const next = type === 'recovery' ? '/reset-password' : safeNext(searchParams.get('next'));

  const supabase = await getServerSupabase();

  if (tokenHash && type && EMAIL_OTP_TYPES.includes(type)) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (!error) return NextResponse.redirect(new URL(next, origin));
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, origin));
  }

  const login = new URL('/login', origin);
  login.searchParams.set('error', 'link');
  return NextResponse.redirect(login);
}
