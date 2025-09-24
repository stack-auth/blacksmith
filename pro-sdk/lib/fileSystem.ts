import { promises as fs } from 'fs';
import path from 'path';

const repoRoot = path.resolve(process.cwd(), '..');
const filesRoot = path.join(repoRoot, 'files');
const languagesRoot = path.join(filesRoot, 'languages');
const englishRoot = path.join(filesRoot, 'english');

const IGNORED_FOLDERS = new Set(['.git', '.DS_Store']);

export type LanguageId = 'english' | string;

export interface LanguageMeta {
  id: LanguageId;
  label: string;
  path: string;
}

export async function pathExists(targetPath: string) {
  try {
    await fs.access(targetPath);
    return true;
  } catch (error) {
    return false;
  }
}

export function resolveLanguagePath(language: LanguageId) {
  if (language === 'english') {
    return englishRoot;
  }
  return path.join(languagesRoot, language);
}

export async function listLanguages(): Promise<LanguageMeta[]> {
  const languages: LanguageMeta[] = [
    { id: 'english', label: 'English', path: englishRoot }
  ];

  if (!(await pathExists(languagesRoot))) {
    return languages;
  }

  const entries = await fs.readdir(languagesRoot, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (IGNORED_FOLDERS.has(entry.name)) continue;

    languages.push({
      id: entry.name,
      label: formatLanguageLabel(entry.name),
      path: path.join(languagesRoot, entry.name)
    });
  }

  return languages;
}

export async function listFiles(language: LanguageId): Promise<string[]> {
  const basePath = resolveLanguagePath(language);
  if (!(await pathExists(basePath))) {
    return [];
  }

  const files: string[] = [];

  async function dive(currentPath: string, relative: string) {
    const entries = await fs.readdir(currentPath, { withFileTypes: true });

    for (const entry of entries) {
      if (IGNORED_FOLDERS.has(entry.name)) {
        continue;
      }

      const entryPath = path.join(currentPath, entry.name);
      const entryRelative = relative ? path.join(relative, entry.name) : entry.name;

      if (entry.isDirectory()) {
        await dive(entryPath, entryRelative);
      } else if (entry.isFile()) {
        files.push(entryRelative);
      }
    }
  }

  await dive(basePath, '');
  files.sort((a, b) => a.localeCompare(b));
  return files;
}

export async function readFileContent(language: LanguageId, relativePath: string) {
  const basePath = resolveLanguagePath(language);
  const safeRelative = sanitizeRelativePath(relativePath);
  const resolvedPath = path.resolve(basePath, safeRelative);
  const relativePosition = path.relative(basePath, resolvedPath);

  if (relativePosition.startsWith('..') || path.isAbsolute(relativePosition)) {
    throw new Error('Invalid path');
  }

  return fs.readFile(resolvedPath, 'utf-8');
}

export function sanitizeRelativePath(relativePath: string) {
  const normalized = path.normalize(relativePath);
  if (normalized.startsWith('..')) {
    throw new Error('Path traversal not allowed');
  }
  return normalized;
}

function formatLanguageLabel(language: string) {
  if (!language) return '';
  return language
    .split(/[-_]/)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
}
