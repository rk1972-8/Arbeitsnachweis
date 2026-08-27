import { NextResponse } from 'next/server';
import { STAFF_SESSION_COOKIE } from '../../../staff-auth';

export async function POST() {
  const response = NextResponse.json({ loggedOut: true });
  response.cookies.set(STAFF_SESSION_COOKIE, '', { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 0 });
  return response;
}
