import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export function GET() {
  const releaseSha = process.env.RELEASE_SHA || process.env.NEXT_PUBLIC_RELEASE_SHA || 'development';
  return NextResponse.json({ release_sha: releaseSha }, {
    headers: { 'Cache-Control': 'no-store, max-age=0' },
  });
}
