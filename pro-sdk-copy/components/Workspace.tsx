'use client';

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import dynamic from 'next/dynamic';
import clsx from 'clsx';
import {
  ArrowUpRight,
  Check,
  ChevronRight,
  Loader2,
  RefreshCw,
  X
} from 'lucide-react';
import { approveLanguage, rejectLanguage, updateEnglish } from '@/app/actions';
import { getLanguageVisual } from '@/lib/languageMeta';

// Dynamically import Monaco to avoid SSR issues
const MonacoDiffEditor = dynamic(
  () => import('./MonacoDiffEditor').then((mod) => mod.MonacoDiffEditor),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center bg-[#1e1e1e]">
        <Loader2 className="h-8 w-8 animate-spin text-accent" />
      </div>
    )
  }
);

export interface WorkspaceProps {
  languages: Array<{ id: string; label: string }>;
  initialLanguage: string;
  initialFiles: string[];
  initialFilePath: string | null;
  initialContent: string;
}

interface BannerState {
  type: 'success' | 'error';
  message: string;
}

export function Workspace({
  languages,
  initialLanguage,
  initialFiles,
  initialFilePath,
  initialContent
}: WorkspaceProps) {
  const [currentLanguage, setCurrentLanguage] = useState(initialLanguage);
  const [files, setFiles] = useState(initialFiles);
  const [activeFile, setActiveFile] = useState<string | null>(initialFilePath);
  const [content, setContent] = useState(initialContent);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [loadingContent, setLoadingContent] = useState(false);
  const [banner, setBanner] = useState<BannerState | null>(null);
  const [actionPending, startAction] = useTransition();
  const skippedInitialLoad = useRef(false);

  const fetchFiles = useCallback(async (language: string) => {
    setLoadingFiles(true);
    try {
      const response = await fetch(`/api/files?language=${language}`, { cache: 'no-store' });
      const payload = await response.json();
      if (response.ok) {
        return payload.files as string[];
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

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!currentLanguage) return;
      try {
        const nextFiles = await fetchFiles(currentLanguage);
        if (cancelled) return;

        setFiles(nextFiles);
        const nextFile = nextFiles[0] ?? null;
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
  }, [currentLanguage, fetchContent, fetchFiles, initialLanguage]);

  const handleSelectLanguage = async (language: string) => {
    if (language === currentLanguage) return;
    setCurrentLanguage(language);
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

  const handleSaveFile = async (newContent: string) => {
    if (!activeFile || !currentLanguage) return;

    setBanner(null);
    try {
      const response = await fetch('http://localhost:3003/save-file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          language: currentLanguage,
          filePath: activeFile,
          content: newContent
        })
      });

      const data = await response.json();
      if (data.success) {
        setBanner({ type: 'success', message: `File saved and staged: ${activeFile}` });
        // Update the local content
        setContent(newContent);
      } else {
        throw new Error(data.error);
      }
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
            const updatedFiles = await fetchFiles(currentLanguage);
            setFiles(updatedFiles);
            const nextFile = activeFile && updatedFiles.includes(activeFile)
              ? activeFile
              : updatedFiles[0] ?? null;
            setActiveFile(nextFile);

            if (nextFile) {
              const updatedContent = await fetchContent(currentLanguage, nextFile);
              setContent(updatedContent);
            } else {
              setContent('');
            }
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
    runAction(() => updateEnglish(), 'English specification refreshed', { refresh: true });
  };

  return (
    <div className="flex h-screen w-full overflow-hidden">
      <aside className="flex h-full w-56 flex-col border-r border-panel-border bg-panel/80 backdrop-blur">
        <header className="px-4 pb-3 pt-4">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Locales</p>
        </header>
        <nav className="flex-1 space-y-1 overflow-y-auto px-2 pb-4">
          {languages.map((language) => {
            const isActive = language.id === currentLanguage;
            const { icon: Icon, accent } = getLanguageVisual(language.id);

            return (
              <button
                key={language.id}
                className={clsx(
                  'group flex w-full items-center justify-between rounded-md border border-transparent px-3 py-2 text-left transition duration-150',
                  isActive
                    ? 'border-accent-soft/40 bg-accent-soft/20 text-white shadow-glow'
                    : 'text-slate-300 hover:border-accent-soft/30 hover:bg-panel-light/50'
                )}
                onClick={() => handleSelectLanguage(language.id)}
              >
                <span className="flex items-center gap-3">
                  <span
                    className="flex h-7 w-7 items-center justify-center rounded-md bg-slate-900/70"
                    style={{ border: `1px solid ${accent}33`, color: accent }}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="text-sm font-medium">{language.label}</span>
                </span>
                {isActive && <ChevronRight className="h-4 w-4 text-accent" />}
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
                const isActive = file === activeFile;
                return (
                  <li key={file}>
                    <button
                      className={clsx(
                        'flex w-full items-center justify-between rounded-md border border-transparent px-3 py-2 text-left font-mono text-[13px] transition duration-150',
                        isActive
                          ? 'border-accent-soft/40 bg-accent-soft/25 text-accent'
                          : 'text-slate-300 hover:border-accent-soft/20 hover:bg-panel/50'
                      )}
                      onClick={() => handleSelectFile(file)}
                    >
                      <span className="truncate" title={file}>
                        {file}
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
                disabled={actionPending}
                className="inline-flex items-center gap-2 rounded-md border border-accent/60 bg-accent-soft/40 px-4 py-2 text-sm font-semibold text-slate-50 transition hover:bg-accent-soft/60 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {actionPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
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

        <div className="relative flex-1 overflow-hidden bg-[#1e1e1e]">
          <MonacoDiffEditor
            language={currentLanguage}
            filePath={activeFile}
            currentContent={content}
            onSave={handleSaveFile}
            readOnly={false}
          />
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
