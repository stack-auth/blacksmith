import { Workspace } from '@/components/Workspace';
import { getLanguageSnapshot, listLanguagesWithStatus, readFileContent } from '@/lib/fileSystem';

export default async function Page() {
  const languages = await listLanguagesWithStatus();
  const initialLanguage = languages[0]?.id ?? 'english';
  const { files: initialFiles } = await getLanguageSnapshot(initialLanguage);
  const initialFilePath = initialFiles[0]?.path ?? null;
  const initialContent = initialFilePath
    ? await readFileContent(initialLanguage, initialFilePath)
    : 'No content available.';

  return (
    <Workspace
      languages={languages}
      initialLanguage={initialLanguage}
      initialFiles={initialFiles}
      initialFilePath={initialFilePath}
      initialContent={initialContent}
    />
  );
}
