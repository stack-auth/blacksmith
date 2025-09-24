import { Workspace } from '@/components/Workspace';
import { listFiles, listLanguages, readFileContent } from '@/lib/fileSystem';

export default async function Page() {
  const languages = await listLanguages();
  const initialLanguage = languages[0]?.id ?? 'english';
  const initialFiles = await listFiles(initialLanguage);
  const initialFilePath = initialFiles[0] ?? null;
  const initialContent = initialFilePath
    ? await readFileContent(initialLanguage, initialFilePath)
    : 'No content available.';

  return (
    <Workspace
      languages={languages.map(({ id, label }) => ({ id, label }))}
      initialLanguage={initialLanguage}
      initialFiles={initialFiles}
      initialFilePath={initialFilePath}
      initialContent={initialContent}
    />
  );
}
