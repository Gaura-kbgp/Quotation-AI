
"use server";

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

/**
 * Creates a server-side session cookie after successful client-side Firebase authentication.
 */
export async function createSession() {
  (await cookies()).set('kabs_admin_session', 'authenticated_v1', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24, // 24 hours
    path: '/',
  });
}

export async function logout() {
  (await cookies()).delete('kabs_admin_session');
  redirect('/admin/login');
}
