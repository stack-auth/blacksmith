'use client';

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import clsx from 'clsx';
import {
  ArrowUpRight,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Loader2,
  RefreshCw,
  X
} from 'lucide-react';
import { approveLanguage, rejectLanguage, updateEnglish } from '@/app/actions';
import { getLanguageVisual } from '@/lib/languageMeta';
import type { FileEntry, LanguageWithStatus } from '@/lib/fileSystem';

export interface WorkspaceProps {
  languages: LanguageWithStatus[];
  initialLanguage: string;
  initialFiles: FileEntry[];
  initialFilePath: string | null;
  initialContent: string;
}

interface BannerState {
  type: 'success' | 'error';
  message: string;
}

interface ProgressState {
  value: number;
  message: string;
}

interface FilesResponse {
  files: FileEntry[];
  languageStatus: {
    hasStagedChanges: boolean;
    hasUnstagedChanges: boolean;
  };
}

export function Workspace({
  languages,
  initialLanguage,
  initialFiles,
  initialFilePath,
  initialContent
}: WorkspaceProps) {
  const [languageList, setLanguageList] = useState(languages);
  const [currentLanguage, setCurrentLanguage] = useState(initialLanguage);
  const [files, setFiles] = useState<FileEntry[]>(initialFiles);
  const [activeFile, setActiveFile] = useState<string | null>(initialFilePath);
  const [content, setContent] = useState(initialContent);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [loadingContent, setLoadingContent] = useState(false);
  const [banner, setBanner] = useState<BannerState | null>(null);
  const [actionPending, startAction] = useTransition();
  const [progress, setProgress] = useState<ProgressState | null>(null);
  const [updateRunning, setUpdateRunning] = useState(false);
  const skippedInitialLoad = useRef(false);
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const progressCompletionHandled = useRef(false);
  const progressDismissTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const fetchFiles = useCallback(async (language: string): Promise<FilesResponse> => {
    setLoadingFiles(true);
    try {
      const response = await fetch(`/api/files?language=${language}`, { cache: 'no-store' });
      const payload = await response.json();
      if (response.ok) {
        return {
          files: payload.files as FileEntry[],
          languageStatus: payload.languageStatus as FilesResponse['languageStatus']
        };
      }
      throw new Error(payload.error as string);
    } finally {
      setLoadingFiles(false);
    }
  }, []);

  const fetchContent = useCallback(async (language: string, path: string) => {
    setLoadingContent(true);
    try {
      const response = await fetch(`/api/file-content?language=${language}&path=${encodeURIComponent(path)}`, {
        cache: 'no-store'
      });
      const payload = await response.json();
      if (response.ok) {
        return payload.content as string;
      }
      throw new Error(payload.error as string);
    } finally {
      setLoadingContent(false);
    }
  }, []);

  const updateLanguageStatus = useCallback(
    (languageId: string, status: FilesResponse['languageStatus']) => {
      setLanguageList((current) =>
        current.map((language) =>
          language.id === languageId
            ? {
                ...language,
                hasStagedChanges: status.hasStagedChanges,
                hasUnstagedChanges: status.hasUnstagedChanges
              }
            : language
        )
      );
    },
    []
  );

  const refreshLanguages = useCallback(async () => {
    const response = await fetch('/api/languages', { cache: 'no-store' });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error as string);
    }
    setLanguageList(payload.languages as LanguageWithStatus[]);
  }, []);

  const refreshCurrentLanguage = useCallback(
    async ({ preserveActive = false }: { preserveActive?: boolean } = {}) => {
      const { files: nextFiles, languageStatus } = await fetchFiles(currentLanguage);
      setFiles(nextFiles);
      updateLanguageStatus(currentLanguage, languageStatus);

      let nextActive = nextFiles[0]?.path ?? null;
      if (preserveActive && activeFile) {
        const stillPresent = nextFiles.find((file) => file.path === activeFile);
        if (stillPresent) {
          nextActive = activeFile;
        }
      }

      setActiveFile(nextActive);

      if (nextActive) {
        const nextContent = await fetchContent(currentLanguage, nextActive);
        setContent(nextContent);
      } else {
        setContent('');
      }
    },
    [activeFile, currentLanguage, fetchContent, fetchFiles, updateLanguageStatus]
  );

  const stopProgressPolling = useCallback(() => {
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
  }, []);

  const clearProgressDismissTimer = useCallback(() => {
    if (progressDismissTimeoutRef.current) {
      clearTimeout(progressDismissTimeoutRef.current);
      progressDismissTimeoutRef.current = null;
    }
  }, []);

  const pollProgress = useCallback(async () => {
    try {
      const response = await fetch('/api/progress', { cache: 'no-store' });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error as string);
      }

      const rawValue = Number(payload.progress ?? 0);
      const value = Number.isFinite(rawValue) ? rawValue : 0;
      const clampedValue = Math.min(1, Math.max(0, value));
      const message = typeof payload.progress_message === 'string' ? payload.progress_message : '';

      setProgress({ value: clampedValue, message });

      if (clampedValue >= 1 && !progressCompletionHandled.current) {
        progressCompletionHandled.current = true;
        stopProgressPolling();
        await Promise.all([
          refreshLanguages(),
          refreshCurrentLanguage({ preserveActive: true })
        ]);
        setUpdateRunning(false);
        setBanner({ type: 'success', message: 'English specification refreshed' });
        clearProgressDismissTimer();
        progressDismissTimeoutRef.current = setTimeout(() => {
          setProgress(null);
          progressDismissTimeoutRef.current = null;
        }, 1500);
      }
    } catch (error) {
      console.error('Failed to fetch progress', error);
      setProgress((prev) => prev ?? { value: 0, message: 'Waiting for progress...' });
    }
  }, [clearProgressDismissTimer, refreshCurrentLanguage, refreshLanguages, stopProgressPolling]);

  const startProgressPolling = useCallback(() => {
    progressCompletionHandled.current = false;
    stopProgressPolling();
    clearProgressDismissTimer();
    setProgress({ value: 0, message: 'Initializing update…' });
    void pollProgress();
    progressIntervalRef.current = setInterval(() => {
      void pollProgress();
    }, 5000);
  }, [clearProgressDismissTimer, pollProgress, stopProgressPolling]);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!currentLanguage) return;
      try {
        const { files: nextFiles, languageStatus } = await fetchFiles(currentLanguage);
        if (cancelled) return;

        setFiles(nextFiles);
        updateLanguageStatus(currentLanguage, languageStatus);

        const nextFile = nextFiles[0]?.path ?? null;
        setActiveFile(nextFile);

        if (nextFile) {
          const nextContent = await fetchContent(currentLanguage, nextFile);
          if (cancelled) return;
          setContent(nextContent);
        } else {
          setContent('');
        }
      } catch (error) {
        if (cancelled) return;
        setBanner({ type: 'error', message: (error as Error).message });
        setFiles([]);
        setActiveFile(null);
        setContent('');
      }
    }

    if (!skippedInitialLoad.current) {
      skippedInitialLoad.current = true;
      if (currentLanguage === initialLanguage) {
        return;
      }
    }

    run();

    return () => {
      cancelled = true;
    };
  }, [currentLanguage, fetchContent, fetchFiles, initialLanguage, updateLanguageStatus]);

  useEffect(() => {
    return () => {
      stopProgressPolling();
      clearProgressDismissTimer();
    };
  }, [clearProgressDismissTimer, stopProgressPolling]);

  const handleSelectLanguage = (language: string) => {
    if (language === currentLanguage) return;
    setCurrentLanguage(language);
    setActiveFile(null);
    setContent('');
    setBanner(null);
  };

  const handleSelectFile = async (file: string) => {
    setActiveFile(file);
    setBanner(null);

    try {
      const nextContent = await fetchContent(currentLanguage, file);
      setContent(nextContent);
    } catch (error) {
      setBanner({ type: 'error', message: (error as Error).message });
    }
  };

  const runAction = (
    action: () => Promise<unknown>,
    successMessage: string,
    { refresh }: { refresh?: boolean } = {}
  ) => {
    setBanner(null);
    startAction(async () => {
      try {
        await action();

        if (refresh) {
          try {
            await refreshCurrentLanguage({ preserveActive: true });
            await refreshLanguages();
          } catch (refreshError) {
            setBanner({ type: 'error', message: (refreshError as Error).message });
            return;
          }
        }

        setBanner({ type: 'success', message: successMessage });
      } catch (error) {
        setBanner({ type: 'error', message: (error as Error).message });
      }
    });
  };

  const approve = () => {
    runAction(() => approveLanguage(currentLanguage), `${prettyName(currentLanguage)} approved`, {
      refresh: true
    });
  };

  const reject = () => {
    runAction(() => rejectLanguage(currentLanguage), `${prettyName(currentLanguage)} rejected`, {
      refresh: true
    });
  };

  const update = () => {
    if (updateRunning) return;
    setBanner(null);
    startAction(async () => {
      try {
        setUpdateRunning(true);
        startProgressPolling();
        await updateEnglish();
      } catch (error) {
        stopProgressPolling();
        clearProgressDismissTimer();
        setProgress(null);
        setUpdateRunning(false);
        setBanner({ type: 'error', message: (error as Error).message });
      }
    });
  };

  return (
    <div className="flex h-screen w-full overflow-hidden">
      <aside className="flex h-full w-56 flex-col border-r border-panel-border bg-panel/80 backdrop-blur">
        <header className="px-4 pb-3 pt-4">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Locales</p>
        </header>
        <nav className="flex-1 space-y-1 overflow-y-auto px-2 pb-4">
          {languageList.map((language) => {
            const isActive = language.id === currentLanguage;
            const { icon: Icon, accent } = getLanguageVisual(language.id);
            const pendingReview = language.hasStagedChanges && !language.hasUnstagedChanges;

            const statusIcon = pendingReview ? (
              <Clock3 className="h-3.5 w-3.5 text-orange-300" />
            ) : (
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
            );

            const labelClasses = clsx(
              'text-sm',
              pendingReview ? 'font-semibold text-orange-200' : 'font-medium text-slate-300'
            );

            const buttonClasses = clsx(
              'group flex w-full items-center justify-between rounded-md border border-transparent px-3 py-2 text-left transition duration-150',
              isActive
                ? 'border-accent-soft/40 bg-accent-soft/20 text-white shadow-glow'
                : pendingReview
                ? 'border-orange-500/40 bg-orange-500/10 text-orange-200 hover:border-orange-400/60 hover:bg-orange-500/20'
                : 'text-slate-300 hover:border-accent-soft/30 hover:bg-panel-light/50'
            );

            return (
              <button
                key={language.id}
                className={buttonClasses}
                onClick={() => handleSelectLanguage(language.id)}
              >
                <span className="flex items-center gap-3">
                  <span
                    className="flex h-7 w-7 items-center justify-center rounded-md bg-slate-900/70"
                    style={{ border: `1px solid ${accent}33`, color: accent }}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className={labelClasses}>{language.label}</span>
                </span>
                <span className="flex items-center gap-2">
                  {statusIcon}
                  {isActive && <ChevronRight className="h-4 w-4 text-accent" />}
                </span>
              </button>
            );
          })}
        </nav>
      </aside>

      <aside className="flex h-full w-72 flex-col border-r border-panel-border bg-panel-light/60 backdrop-blur">
        <header className="flex items-center justify-between px-4 pb-3 pt-4 text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
          <span>Files</span>
          {loadingFiles && <Loader2 className="h-4 w-4 animate-spin text-accent" />}
        </header>
        <div className="flex-1 overflow-y-auto px-2 pb-4">
          {files.length === 0 ? (
            <p className="rounded-md border border-dashed border-slate-600 bg-panel-light/30 px-3 py-4 text-xs text-slate-400">
              Nothing here yet. Run an update to generate files for this locale.
            </p>
          ) : (
            <ul className="space-y-1 text-sm">
              {files.map((file) => {
                const isActive = file.path === activeFile;
                const stage = file.stagedState;

                const statusClass = stage
                  ? stage === 'added'
                    ? 'text-emerald-300 font-semibold'
                    : 'text-orange-300 font-semibold'
                  : '';

                const buttonClasses = clsx(
                  'flex w-full items-center justify-between rounded-md border border-transparent px-3 py-2 text-left font-mono text-[13px] transition duration-150',
                  isActive
                    ? 'border-accent-soft/40 bg-accent-soft/25 text-accent'
                    : 'text-slate-300 hover:border-accent-soft/20 hover:bg-panel/50'
                );

                return (
                  <li key={file.path}>
                    <button
                      className={buttonClasses}
                      onClick={() => handleSelectFile(file.path)}
                    >
                      <span className={clsx('truncate', statusClass)} title={file.path}>
                        {file.path}
                      </span>
                      {isActive && <ArrowUpRight className="h-3.5 w-3.5 text-accent" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </aside>

      <section className="flex h-full flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-panel-border bg-panel/70 px-6 py-4">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-slate-400">{prettyName(currentLanguage)}</p>
            <p className="font-mono text-sm text-slate-200">
              {activeFile ? activeFile : 'No file selected'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {currentLanguage === 'english' ? (
              <button
                onClick={update}
                disabled={actionPending || updateRunning}
                className="inline-flex items-center gap-2 rounded-md border border-accent/60 bg-accent-soft/40 px-4 py-2 text-sm font-semibold text-slate-50 transition hover:bg-accent-soft/60 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {actionPending || updateRunning ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                Update
              </button>
            ) : (
              <>
                <button
                  onClick={reject}
                  disabled={actionPending}
                  className="inline-flex items-center gap-2 rounded-md border border-transparent bg-red-500/20 px-4 py-2 text-sm font-semibold text-red-200 transition hover:bg-red-500/30 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {actionPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
                  Reject
                </button>
                <button
                  onClick={approve}
                  disabled={actionPending}
                  className="inline-flex items-center gap-2 rounded-md border border-transparent bg-emerald-500/20 px-4 py-2 text-sm font-semibold text-emerald-200 transition hover:bg-emerald-500/30 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {actionPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  Approve
                </button>
              </>
            )}
          </div>
        </header>

        {progress && (
          <div className="border-b border-accent/20 bg-accent-soft/10 px-6 py-3 text-sm text-slate-200">
            <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
              <span>Update In Progress</span>
              <span>{Math.round(progress.value * 100)}%</span>
            </div>
            <div className="mt-3 h-2 w-full rounded-full bg-slate-900/70">
              <div
                className="h-full rounded-full bg-accent transition-all duration-500"
                style={{ width: `${Math.min(100, Math.max(6, progress.value * 100))}%` }}
              />
            </div>
            <p className="mt-3 font-mono text-[13px] text-slate-300">
              {progress.message || 'Coordinating language updates…'}
            </p>
          </div>
        )}

        {banner && (
          <div
            className={clsx(
              'flex items-center gap-2 border-b px-6 py-2 text-sm',
              banner.type === 'success'
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                : 'border-red-500/30 bg-red-500/10 text-red-200'
            )}
          >
            {banner.type === 'success' ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
            {banner.message}
          </div>
        )}

        <div className="relative flex-1 overflow-hidden bg-[#030712]">
          {loadingContent && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#030712]/80">
              <Loader2 className="h-8 w-8 animate-spin text-accent" />
            </div>
          )}
          {activeFile ? (
            <pre className="h-full w-full overflow-auto px-8 py-6 text-sm text-slate-200">
              <code className="font-mono whitespace-pre-wrap leading-6 text-[13px] text-slate-200">
                {content}
              </code>
            </pre>
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-slate-500">
              Select a file to preview its contents.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function prettyName(language: string) {
  if (!language) return '';
  return language
    .split(/[-_]/)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
}
