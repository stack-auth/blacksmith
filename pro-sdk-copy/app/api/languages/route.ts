import { NextResponse } from 'next/server';
import { listLanguages } from '@/lib/fileSystem';

export async function GET() {
  try {
    const languages = await listLanguages();
    return NextResponse.json({ languages });
  } catch (error) {
    console.error('Failed to list languages:', error);
    return NextResponse.json({ error: 'Failed to list languages' }, { status: 500 });
  }
}
