import { NextResponse } from 'next/server';

import { requireRouteAuth, type AuthContext } from '@/server/auth';
import { withAppStore } from '@/server/services/app-service';

export const withRouteError = async <T>(callback: () => Promise<T>) => {
  try {
    const data = await callback();
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : 'Unexpected server error.',
      },
      {
        status: 400,
      },
    );
  }
};

export const withAuthenticatedRoute = async <T>(
  request: Request,
  callback: (auth: AuthContext) => Promise<T>,
) => {
  const { auth, response } = await requireRouteAuth(request);

  if (response) {
    return response;
  }

  return withRouteError(() => withAppStore(auth.store, () => callback(auth)));
};
