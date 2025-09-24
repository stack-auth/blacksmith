"use client"

import { useMemo, useState } from "react"
import { motion } from "framer-motion"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import Editor from "@monaco-editor/react"
import { Loader2 } from "lucide-react"

export default function Home() {
  const [spec, setSpec] = useState<string>(defaultSpec)
  const [isSyncing, setIsSyncing] = useState<boolean>(false)
  const [bundle, setBundle] = useState<Record<string, { filename: string; code: string }> | null>(null)

  const languages = useMemo(() => [
    { id: "typescript", backend: "javascript", label: "TypeScript", monacoLang: "typescript" },
    { id: "python", backend: "python", label: "Python", monacoLang: "python" },
  ], [])

  async function handleSync() {
    setIsSyncing(true)
    try {
      // 1) Trigger backend generation
      const updateRes = await fetch("/api/update", { method: "POST" })
      if (!updateRes.ok) {
        throw new Error("Failed to update: " + (await updateRes.text()))
      }
      // 2) Fetch generated files for our supported languages
      const results: Record<string, { filename: string; code: string }> = {}
      for (const lang of languages) {
        const res = await fetch(`/api/generated/${lang.backend}`)
        if (!res.ok) continue
        const json = await res.json()
        const files: Record<string, string> = json.files || {}
        const merged = Object.entries(files)
          .map(([name, content]) => `=== ${name} ===\n${content}`)
          .join("\n\n")
        results[lang.id] = { filename: `${lang.label}.txt`, code: merged }
      }
      setBundle(results)
    } catch (e) {
      console.error(e)
    } finally {
      setIsSyncing(false)
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="space-y-6"
        >
          <header className="flex items-center justify-between">
            <h1 className="text-2xl font-semibold tracking-tight">Blacksmith</h1>
            <div className="flex items-center gap-3">
              <Button onClick={handleSync} disabled={isSyncing}>
                {isSyncing && <Loader2 className="animate-spin" />}
                Sync
              </Button>
            </div>
          </header>

          <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="spec">Spec</Label>
              <Textarea
                id="spec"
                value={spec}
                onChange={(e) => setSpec(e.target.value)}
                placeholder="Write your Blacksmith spec here..."
                className="min-h-[360px]"
                disabled={isSyncing}
              />
              <p className="text-xs text-muted-foreground">
                Define your SDK surface in English. Click Sync to generate SDKs.
              </p>
            </div>

            <div className="min-h-[420px] rounded-xl border border-border/60 overflow-hidden">
              {bundle ? (
                <Tabs defaultValue={languages[0].id} className="h-full">
                  <TabsList className="m-2">
                    {languages.map((lang) => (
                      <TabsTrigger key={lang.id} value={lang.id}>
                        {lang.label}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                  {languages.map((lang) => (
                    <TabsContent key={lang.id} value={lang.id} className="h-[calc(100%-3rem)]">
                      <Editor
                        height="100%"
                        defaultLanguage={lang.monacoLang}
                        language={lang.monacoLang}
                        theme="vs-dark"
                        value={bundle?.[lang.id]?.code ?? ""}
                        options={{
                          readOnly: true,
                          minimap: { enabled: false },
                          fontSize: 13,
                          scrollBeyondLastLine: false,
                          wordWrap: "on",
                          padding: { top: 12, bottom: 12 },
                        }}
                      />
                    </TabsContent>
                  ))}
                </Tabs>
              ) : (
                <div className="h-full grid place-items-center text-muted-foreground text-sm">
                  Generated SDKs will appear here after you sync.
                </div>
              )}
            </div>
          </section>
        </motion.div>
      </div>
    </div>
  )
}

const defaultSpec = `# Blacksmith Sample

Generate SDKs for a simple service with a ping method.

The SDK should expose a client that can call ping().
`
