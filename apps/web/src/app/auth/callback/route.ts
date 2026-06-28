import { NextResponse } from 'next/server';

import { createServerSupabaseClient } from '@/server/auth';

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const next = requestUrl.searchParams.get('next') ?? '/';
  const supabase = await createServerSupabaseClient();

  if (!supabase || !code) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    const url = new URL('/login', request.url);
    url.searchParams.set(
      'message',
      'Could not finish email confirmation. Please sign in again.',
    );
    return NextResponse.redirect(url);
  }

  return NextResponse.redirect(new URL(next, request.url));
}
