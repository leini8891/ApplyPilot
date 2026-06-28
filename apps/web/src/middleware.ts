import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

import { env, hasSupabaseConfig, supabasePublicKey } from '@/lib/env';

export async function middleware(request: NextRequest) {
  const response = NextResponse.next({
    request,
  });

  if (hasSupabaseConfig && env.NEXT_PUBLIC_SUPABASE_URL && supabasePublicKey) {
    const supabase = createServerClient(
      env.NEXT_PUBLIC_SUPABASE_URL,
      supabasePublicKey,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet, headers) {
            cookiesToSet.forEach(({ name, value, options }) => {
              request.cookies.set(name, value);
              response.cookies.set(name, value, options);
            });
            Object.entries(headers).forEach(([key, value]) => {
              response.headers.set(key, value);
            });
          },
        },
      },
    );

    await supabase.auth.getClaims();
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
