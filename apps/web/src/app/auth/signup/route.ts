import { NextResponse } from 'next/server';

import { createServerSupabaseClient } from '@/server/auth';

const getText = (formData: FormData, key: string) => {
  const value = formData.get(key);

  return typeof value === 'string' ? value.trim() : '';
};

const redirectToLogin = (request: Request, message: string) => {
  const url = new URL('/login', request.url);
  url.searchParams.set('message', message);

  return NextResponse.redirect(url);
};

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();

  if (!supabase) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  const formData = await request.formData();
  const email = getText(formData, 'email');
  const password = getText(formData, 'password');
  const emailRedirectTo = new URL('/auth/callback', request.url).toString();

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo,
    },
  });

  if (error) {
    return redirectToLogin(request, 'Could not create that account.');
  }

  if (data.session) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  return redirectToLogin(
    request,
    'Check your email to confirm the new account, then sign in.',
  );
}
