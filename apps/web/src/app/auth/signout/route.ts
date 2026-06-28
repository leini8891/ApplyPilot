import { NextResponse } from 'next/server';

import { createServerSupabaseClient } from '@/server/auth';

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();

  if (supabase) {
    await supabase.auth.signOut();
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return NextResponse.redirect(new URL('/', request.url));
}

export async function GET(request: Request) {
  return POST(request);
}
