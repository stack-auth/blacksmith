import { promises as fs } from 'fs';
import { exec } from 'child_process';
import path from 'path';
import { promisify } from 'util';

const execAsync = promisify(exec);

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

export type StageState =
  | 'added'
  | 'modified'
  | 'deleted'
  | 'renamed'
  | 'copied'
  | 'conflict';

const STAGED_STATUS_MAP: Record<string, StageState> = {
  A: 'added',
  M: 'modified',
  D: 'deleted',
  R: 'renamed',
  C: 'copied',
  U: 'conflict',
  T: 'modified'
};

export interface FileEntry {
  path: string;
  stagedState?: StageState;
}

export interface LanguageGitStatus {
  stagedFiles: Record<string, StageState>;
  hasStagedChanges: boolean;
  hasUnstagedChanges: boolean;
}

export interface LanguageWithStatus extends LanguageMeta {
  hasStagedChanges: boolean;
  hasUnstagedChanges: boolean;
}

export interface LanguageSnapshot {
  files: FileEntry[];
  status: LanguageGitStatus;
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

export async function getLanguageGitStatus(language: LanguageId): Promise<LanguageGitStatus> {
  const repoPath = resolveLanguagePath(language);
  const initial: LanguageGitStatus = {
    stagedFiles: {},
    hasStagedChanges: false,
    hasUnstagedChanges: false
  };

  if (!(await pathExists(repoPath))) {
    return initial;
  }

  try {
    const { stdout } = await execAsync('git status --porcelain', { cwd: repoPath });
    const trimmed = stdout.trim();

    if (!trimmed) {
      return initial;
    }

    const stagedFiles: Record<string, StageState> = {};
    let hasStaged = false;
    let hasUnstaged = false;

    const lines = trimmed.split('\n');

    for (const rawLine of lines) {
      if (!rawLine) continue;
      if (rawLine.length < 3) continue;

      const stageCode = rawLine[0];
      const workTreeCode = rawLine[1];
      let filePath = rawLine.slice(3).trim();

      if (stageCode === '?' && workTreeCode === '?') {
        hasUnstaged = true;
        continue;
      }

      if (filePath.includes(' -> ')) {
        const segments = filePath.split(' -> ');
        filePath = segments[segments.length - 1] ?? filePath;
      }

      if (stageCode !== ' ' && stageCode !== '?') {
        hasStaged = true;
        stagedFiles[filePath] = mapStageCode(stageCode);
      }

      if (workTreeCode !== ' ' && workTreeCode !== '?') {
        hasUnstaged = true;
      }

      if (stageCode === 'U' || workTreeCode === 'U') {
        hasStaged = true;
        stagedFiles[filePath] = 'conflict';
      }
    }

    return {
      stagedFiles,
      hasStagedChanges: hasStaged,
      hasUnstagedChanges: hasUnstaged
    };
  } catch (error) {
    return initial;
  }
}

export async function listLanguagesWithStatus(): Promise<LanguageWithStatus[]> {
  const base = await listLanguages();
  const statuses = await Promise.all(base.map((language) => getLanguageGitStatus(language.id)));

  return base.map((language, index) => ({
    ...language,
    hasStagedChanges: statuses[index]?.hasStagedChanges ?? false,
    hasUnstagedChanges: statuses[index]?.hasUnstagedChanges ?? false
  }));
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

export async function getLanguageSnapshot(language: LanguageId): Promise<LanguageSnapshot> {
  const [status, fileList] = await Promise.all([
    getLanguageGitStatus(language),
    listFiles(language)
  ]);

  const stagedFiles = status.stagedFiles;
  const files: FileEntry[] = fileList.map((filePath) => ({
    path: filePath,
    stagedState: stagedFiles[filePath]
  }));

  return {
    files,
    status
  };
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

function mapStageCode(code: string): StageState {
  return STAGED_STATUS_MAP[code] ?? 'modified';
}
