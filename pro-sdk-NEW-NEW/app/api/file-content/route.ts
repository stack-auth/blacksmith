import { NextResponse } from 'next/server';
import { readFileContent, sanitizeRelativePath } from '@/lib/fileSystem';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const language = (searchParams.get('language') ?? 'english').toLowerCase();
  const filePath = searchParams.get('path');

  if (!filePath) {
    return NextResponse.json({ error: 'File path is required' }, { status: 400 });
  }

  try {
    const safePath = sanitizeRelativePath(filePath);
    const content = await readFileContent(language, safePath);
    return NextResponse.json({ content });
  } catch (error) {
    console.error(`Failed to read file for ${language}:`, error);
    return NextResponse.json({ error: 'Failed to read file' }, { status: 500 });
  }
}
