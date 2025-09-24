'use client';

import { DiffEditor } from '@monaco-editor/react';
import { useCallback, useEffect, useState } from 'react';
import { Loader2, Save } from 'lucide-react';

interface MonacoDiffEditorProps {
  language: string;
  filePath: string | null;
  currentContent: string;
  onSave?: (content: string) => void;
  readOnly?: boolean;
}

export function MonacoDiffEditor({
  language,
  filePath,
  currentContent,
  onSave,
  readOnly = false
}: MonacoDiffEditorProps) {
  const [originalContent, setOriginalContent] = useState('');
  const [modifiedContent, setModifiedContent] = useState(currentContent);
  const [loading, setLoading] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // Fetch the diff when file or language changes
  useEffect(() => {
    if (!filePath || !language) return;

    const fetchDiff = async () => {
      setLoading(true);
      try {
        const response = await fetch(
          `http://localhost:3003/file-diff?language=${language}&filePath=${encodeURIComponent(filePath)}`
        );
        const data = await response.json();
        if (data.success) {
          setOriginalContent(data.original || '');
          setModifiedContent(data.modified || currentContent);
        }
      } catch (error) {
        console.error('Failed to fetch diff:', error);
        setOriginalContent('');
        setModifiedContent(currentContent);
      } finally {
        setLoading(false);
      }
    };

    fetchDiff();
  }, [filePath, language, currentContent]);

  // Update modified content when current content changes
  useEffect(() => {
    setModifiedContent(currentContent);
  }, [currentContent]);

  const handleEditorChange = useCallback((value: string | undefined) => {
    if (value !== undefined) {
      setModifiedContent(value);
      setHasChanges(value !== originalContent);
    }
  }, [originalContent]);

  const handleSave = useCallback(() => {
    if (onSave && hasChanges) {
      onSave(modifiedContent);
      setHasChanges(false);
    }
  }, [onSave, hasChanges, modifiedContent]);

  // Get file extension for Monaco language detection
  const getMonacoLanguage = (filePath: string | null) => {
    if (!filePath) return 'plaintext';

    const ext = filePath.split('.').pop()?.toLowerCase();
    const languageMap: Record<string, string> = {
      js: 'javascript',
      jsx: 'javascript',
      ts: 'typescript',
      tsx: 'typescript',
      py: 'python',
      java: 'java',
      cs: 'csharp',
      cpp: 'cpp',
      c: 'cpp',
      rb: 'ruby',
      go: 'go',
      rs: 'rust',
      swift: 'swift',
      kt: 'kotlin',
      json: 'json',
      md: 'markdown',
      txt: 'plaintext'
    };

    return languageMap[ext || ''] || 'plaintext';
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center bg-[#1e1e1e]">
        <Loader2 className="h-8 w-8 animate-spin text-accent" />
      </div>
    );
  }

  if (!filePath) {
    return (
      <div className="flex h-full items-center justify-center bg-[#1e1e1e] text-sm text-slate-500">
        Select a file to view and edit its contents.
      </div>
    );
  }

  return (
    <div className="relative h-full w-full">
      <DiffEditor
        original={originalContent}
        modified={modifiedContent}
        language={getMonacoLanguage(filePath)}
        theme="vs-dark"
        options={{
          readOnly: readOnly,
          fontSize: 13,
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          renderSideBySide: true,
          diffWordWrap: 'on',
          originalEditable: false,
          ignoreTrimWhitespace: false,
          renderIndicators: true,
          renderOverviewRuler: true
        }}
        onMount={(editor) => {
          // Get the modified editor (right side)
          const modifiedEditor = editor.getModifiedEditor();

          // Listen for changes
          modifiedEditor.onDidChangeModelContent(() => {
            const value = modifiedEditor.getValue();
            handleEditorChange(value);
          });

          // Add save keybinding (Cmd/Ctrl + S)
          modifiedEditor.addCommand(
            // eslint-disable-next-line no-bitwise
            monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS,
            () => handleSave()
          );
        }}
      />

      {/* Save button overlay */}
      {hasChanges && !readOnly && (
        <button
          onClick={handleSave}
          className="absolute bottom-4 right-4 z-10 inline-flex items-center gap-2 rounded-md bg-accent/90 px-4 py-2 text-sm font-semibold text-white shadow-lg transition hover:bg-accent"
        >
          <Save className="h-4 w-4" />
          Save Changes
        </button>
      )}
    </div>
  );
}