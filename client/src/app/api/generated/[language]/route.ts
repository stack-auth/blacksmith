import { NextResponse } from "next/server"
import { promises as fs } from "fs"
import path from "path"

export async function GET(
  _req: Request,
  { params }: { params: { language: string } }
) {
  try {
    const lang = params.language
    const baseDir = path.resolve(process.cwd(), "..", "files", "languages", lang)
    let filesList: string[] = []
    try {
      filesList = await fs.readdir(baseDir)
    } catch (e) {
      return NextResponse.json(
        { success: false, error: "Language directory not found", files: {} },
        { status: 404 }
      )
    }

    const files: Record<string, string> = {}
    for (const filename of filesList) {
      const filePath = path.join(baseDir, filename)
      const stat = await fs.stat(filePath)
      if (stat.isFile()) {
        const content = await fs.readFile(filePath, "utf-8")
        files[filename] = content
      }
    }

    return NextResponse.json({ success: true, files })
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || "Failed to read generated files" },
      { status: 500 }
    )
  }
}


