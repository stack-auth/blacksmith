"use client"

import { useEffect, useMemo, useState } from "react"
import { motion } from "framer-motion"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import Editor, { DiffEditor } from "@monaco-editor/react"
import { Loader2, FileText, ChevronRight, ChevronDown } from "lucide-react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { FileCode2 } from "lucide-react"
import LanguageIcon from "@/components/icons/language"

export default function Home() {
  const [spec, setSpec] = useState<string>(defaultSpec)
  const [isSyncing, setIsSyncing] = useState<boolean>(false)
  const [bundle, setBundle] = useState<Record<string, Record<string, string>> | null>(null)
  const [originalBundles, setOriginalBundles] = useState<Record<string, Record<string, string>>>({})
  const [englishFiles, setEnglishFiles] = useState<string[]>([])
  const [isLoadingFiles, setIsLoadingFiles] = useState<boolean>(false)
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null)
  const [originalSpec, setOriginalSpec] = useState<string>("")
  const [collapsedFiles, setCollapsedFiles] = useState<Record<string, boolean>>({})
  

  const languages = useMemo(() => [
    { id: "javascript", backend: "javascript", label: "JavaScript", monacoLang: "javascript", icon: "🟨" },
    { id: "typescript", backend: "javascript", label: "TypeScript", monacoLang: "typescript", icon: "🟦" },
    { id: "python", backend: "python", label: "Python", monacoLang: "python", icon: "🐍" },
    { id: "java", backend: "java", label: "Java", monacoLang: "java", icon: "☕" },
    { id: "csharp", backend: "csharp", label: "C#", monacoLang: "csharp", icon: "♯" },
    { id: "cpp", backend: "cpp", label: "C++", monacoLang: "cpp", icon: "➕➕" },
    { id: "ruby", backend: "ruby", label: "Ruby", monacoLang: "ruby", icon: "💎" },
    { id: "go", backend: "go", label: "Go", monacoLang: "go", icon: "🐹" },
    { id: "rust", backend: "rust", label: "Rust", monacoLang: "rust", icon: "🦀" },
    { id: "swift", backend: "swift", label: "Swift", monacoLang: "swift", icon: "🕊️" },
    { id: "kotlin", backend: "kotlin", label: "Kotlin", monacoLang: "kotlin", icon: "🔷" },
  ], [])
  const [selectedLangId, setSelectedLangId] = useState<string>(languages[0].id)

  function getLangById(id: string) {
    return languages.find((l) => l.id === id) ?? languages[0]
  }

  function inferLangIdFromFile(fileName: string): string | null {
    const base = fileName.replace(/\.[^/.]+$/, "").toLowerCase()
    const candidate = languages.find((l) => l.id.toLowerCase() === base || l.label.toLowerCase() === base)
    return candidate ? candidate.id : null
  }

  function getMonacoLanguageForFilename(filename: string): string {
    const ext = filename.split(".").pop()?.toLowerCase() || ""
    switch (ext) {
      case "js":
      case "jsx":
        return "javascript"
      case "ts":
      case "tsx":
        return "typescript"
      case "py":
        return "python"
      case "java":
        return "java"
      case "cs":
        return "csharp"
      case "cpp":
      case "cc":
      case "cxx":
      case "hpp":
      case "hh":
      case "hxx":
        return "cpp"
      case "rb":
        return "ruby"
      case "go":
        return "go"
      case "rs":
        return "rust"
      case "swift":
        return "swift"
      case "kt":
      case "kts":
        return "kotlin"
      case "json":
        return "json"
      case "yml":
      case "yaml":
        return "yaml"
      case "md":
        return "markdown"
      default:
        return "plaintext"
    }
  }

  async function fetchEnglishFiles() {
    setIsLoadingFiles(true)
    try {
      const res = await fetch("/api/english")
      if (!res.ok) throw new Error(await res.text())
      const json = await res.json()
      const files: string[] = json.files || []
      setEnglishFiles(files)
    } catch (e) {
      console.error(e)
      setEnglishFiles([])
    } finally {
      setIsLoadingFiles(false)
    }
  }

  async function loadEnglishFile(name: string) {
    try {
      const res = await fetch(`/api/english/${encodeURIComponent(name)}`)
      if (!res.ok) throw new Error(await res.text())
      const json = await res.json()
      const content: string = json.content || ""
      setSelectedFileName(name)
      setSpec(content)
      setOriginalSpec(content)
      const inferred = inferLangIdFromFile(name)
      if (inferred) {
        setSelectedLangId(inferred)
        await fetchLanguageFiles(inferred)
      }
    } catch (e) {
      console.error(e)
    }
  }

  useEffect(() => {
    fetchEnglishFiles()
  }, [])

  useEffect(() => {
    if (!selectedFileName && englishFiles.length > 0) {
      // Auto-select first file by default
      loadEnglishFile(englishFiles[0])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [englishFiles])

  // Ensure generated bundle is fetched on initial load
  useEffect(() => {
    fetchLanguageFiles(selectedLangId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLangId])

  // Prime original content for all languages once on page load
  useEffect(() => {
    let cancelled = false

    async function primeAllOriginals() {
      try {
        await Promise.all(
          languages.map(async (lang) => {
            try {
              const res = await fetch(`/api/generated/${lang.backend}`, { cache: "no-store" })
              if (!res.ok) return
              const json = await res.json()
              if (cancelled) return
              const files: Record<string, string> = json.files || {}
              setOriginalBundles((prev) => {
                const prevForLang = prev[lang.id] || {}
                const nextForLang: Record<string, string> = { ...prevForLang }
                for (const [file, content] of Object.entries(files)) {
                  if (!(file in nextForLang)) {
                    nextForLang[file] = content
                  }
                }
                if (prevForLang === nextForLang) return prev
                return { ...prev, [lang.id]: nextForLang }
              })
            } catch {
              // ignore individual language failures
            }
          })
        )
      } catch {
        // ignore aggregate failures
      }
    }

    primeAllOriginals()

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Poll for generated file changes every 2 seconds for the active language
  useEffect(() => {
    let cancelled = false
    const lang = getLangById(selectedLangId)

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/generated/${lang.backend}`, { cache: "no-store" })
        if (!res.ok) return
        const json = await res.json()
        if (cancelled) return
        const files: Record<string, string> = json.files || {}
        // Update originals for any newly appearing files, keep existing originals intact
        setOriginalBundles((prev) => {
          const prevForLang = prev[lang.id] || {}
          const nextForLang: Record<string, string> = { ...prevForLang }
          for (const [file, content] of Object.entries(files)) {
            if (!(file in nextForLang)) {
              nextForLang[file] = content
            }
          }
          if (prevForLang === nextForLang) return prev
          return { ...prev, [lang.id]: nextForLang }
        })
        // Update latest bundle snapshot
        setBundle({ [lang.id]: files })
      } catch {
        // ignore transient polling errors
      }
    }, 2000)

    return () => {
      cancelled = true
      clearInterval(interval)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLangId])

  async function fetchLanguageFiles(langId: string) {
    const lang = getLangById(langId)
    const res = await fetch(`/api/generated/${lang.backend}`, { cache: "no-store" })
    if (!res.ok) {
      setBundle(null)
      return
    }
    const json = await res.json()
    const files: Record<string, string> = json.files || {}
    // Initialize or extend originals for this language without overwriting existing baselines
    setOriginalBundles((prev) => {
      const prevForLang = prev[lang.id] || {}
      const nextForLang: Record<string, string> = { ...prevForLang }
      for (const [file, content] of Object.entries(files)) {
        if (!(file in nextForLang)) {
          nextForLang[file] = content
        }
      }
      if (prevForLang === nextForLang) return prev
      return { ...prev, [lang.id]: nextForLang }
    })
    // Always set the latest bundle contents
    setBundle({ [lang.id]: files })
  }

  async function handleSync() {
    setIsSyncing(true)
    try {
      if (selectedFileName) {
        const saveRes = await fetch(`/api/english/${encodeURIComponent(selectedFileName)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: spec }),
        })
        if (!saveRes.ok) {
          throw new Error("Failed to save: " + (await saveRes.text()))
        }
        setOriginalSpec(spec)
      }
      const updateRes = await fetch("/api/update", { method: "POST" })
      if (!updateRes.ok) {
        throw new Error("Failed to update: " + (await updateRes.text()))
      }
      await fetchLanguageFiles(selectedLangId)
    } catch (e) {
      console.error(e)
    } finally {
      setIsSyncing(false)
    }
  }

  return (
    <div className="h-screen bg-background text-foreground">
      <div className="flex flex-col h-full">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="flex flex-col h-full"
        >
          <header className="flex items-center justify-between h-14 px-6 border-b border-border/60 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-10">
            <h1 className="text-2xl font-semibold tracking-tight">Blacksmith</h1>
            <div className="flex items-center gap-3">
              <Button onClick={handleSync} disabled={isSyncing}>
                {isSyncing && <Loader2 className="animate-spin" />}
                Sync
              </Button>
            </div>
          </header>

          <main className="flex-1 overflow-hidden px-6 py-4">
          <section className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-full">
            
              <div className="rounded-xl border border-border/60 overflow-hidden h-full">
                <div className="flex items-center justify-between p-3 border-b border-border/60 bg-muted/30">
                  <div className="flex items-center gap-2">
                    <FileText className="opacity-70" />
                    <span className="text-sm font-medium">Spec</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Select
                      value={selectedFileName ?? ""}
                      onValueChange={async (val) => {
                        if (selectedFileName && spec !== originalSpec) {
                          const proceed = window.confirm("You have unsaved changes. Switch file and discard?")
                          if (!proceed) return
                        }
                        await loadEnglishFile(val)
                      }}
                      disabled={isLoadingFiles || isSyncing}
                    >
                      <SelectTrigger className="w-[240px]">
                        <SelectValue placeholder={isLoadingFiles ? "Loading files..." : "Select a file"} />
                      </SelectTrigger>
                      <SelectContent>
                        {englishFiles.length === 0 ? (
                          <div className="px-3 py-2 text-sm text-muted-foreground">No files found</div>
                        ) : (
                          englishFiles.map((f) => (
                            <SelectItem key={f} value={f}>{f}</SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="h-[calc(100%-49px)]">
                  <div className="h-full flex flex-col">
                    <Textarea
                      id="spec"
                      value={spec}
                      onChange={(e) => setSpec(e.target.value)}
                      placeholder="Write your Blacksmith spec here..."
                      className="flex-1 resize-none"
                      disabled={isSyncing}
                    />
                    <div className="px-3 py-2 text-xs text-muted-foreground">
                      
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-border/60 overflow-hidden h-full">
                <div className="flex items-center justify-between p-3 border-b border-border/60 bg-muted/30">
                  <div className="flex items-center gap-2">
                    <FileCode2 className="opacity-70" />
                    <span className="text-sm font-medium">Language</span>
                  </div>
                  <Select
                    value={selectedLangId}
                    onValueChange={async (val) => {
                      setSelectedLangId(val)
                      await fetchLanguageFiles(val)
                    }}
                    disabled={isSyncing}
                  >
                    <SelectTrigger className="w-[160px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                    {languages.map((lang) => (
                      <SelectItem key={lang.id} value={lang.id}>
                        <div className="flex items-center gap-2">
                          <LanguageIcon id={lang.id} className="w-4 h-4" />
                          <span>{lang.label}</span>
                        </div>
                      </SelectItem>
                    ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="h-[calc(100%-49px)] overflow-auto">
                  {bundle && bundle[selectedLangId] ? (
                    <div className="divide-y divide-border/60">
                      {Object.entries(bundle[selectedLangId]).map(([filename, content]) => {
                        const collapsed = collapsedFiles[filename]
                        const monacoLang = getMonacoLanguageForFilename(filename)
                        const original = originalBundles[selectedLangId]?.[filename]
                        const hasChanged = typeof original === "string" && original !== content
                        return (
                          <div key={filename} className="">
                            <button
                              className="w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-muted/40"
                              onClick={() => setCollapsedFiles((prev) => ({ ...prev, [filename]: !prev[filename] }))}
                            >
                              <div className="flex items-center gap-2">
                                {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                <span className="font-medium">{filename}</span>
                              </div>
                            </button>
                            {!collapsed && (
                              <div className="h-[400px] border-t border-border/60">
                                {hasChanged ? (
                                  <DiffEditor
                                    height="400px"
                                    original={original as string}
                                    modified={content}
                                    language={monacoLang}
                                    theme="vs-dark"
                                    options={{
                                      readOnly: true,
                                      renderSideBySide: true,
                                      minimap: { enabled: false },
                                      fontSize: 13,
                                      scrollBeyondLastLine: false,
                                      wordWrap: "on",
                                    }}
                                  />
                                ) : (
                                  <Editor
                                    height="400px"
                                    defaultLanguage={monacoLang}
                                    language={monacoLang}
                                    theme="vs-dark"
                                    value={content}
                                    options={{
                                      readOnly: true,
                                      minimap: { enabled: false },
                                      fontSize: 13,
                                      scrollBeyondLastLine: false,
                                      wordWrap: "on",
                                      padding: { top: 12, bottom: 12 },
                                    }}
                                  />
                                )}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <div className="h-full grid place-items-center text-muted-foreground text-sm">
                      Select a file and click Sync to view generated SDK files.
                    </div>
                  )}
                </div>
              </div>
            </section>
          </main>
        </motion.div>
      </div>
    </div>
  )
}

const defaultSpec = `# Blacksmith Sample

Generate SDKs for a simple service with a ping method.

The SDK should expose a client that can call ping().
`
