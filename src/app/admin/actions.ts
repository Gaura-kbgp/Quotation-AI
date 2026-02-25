"use server";

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export async function login(email: string, pass: string) {
  // Hardcoded for Phase 1 as per requirements
  const ADMIN_EMAIL = "admin@kabs.com";
  const ADMIN_PASS = "admin123";

  if (email === ADMIN_EMAIL && pass === ADMIN_PASS) {
    // Set a secure session cookie
    (await cookies()).set('kabs_admin_session', 'authenticated_admin_v1', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24, // 24 hours
      path: '/',
    });
    
    redirect('/admin/dashboard');
  } else {
    return { error: "Invalid credentials. Please try again." };
  }
}

export async function logout() {
  (await cookies()).delete('kabs_admin_session');
  redirect('/admin/login');
}
