import { NextResponse } from "next/server"
import { promises as fs } from "fs"
import path from "path"

export async function GET() {
  try {
    const baseDir = path.resolve(process.cwd(), "..", "files", "english")
    let filesList: string[] = []
    try {
      filesList = await fs.readdir(baseDir)
    } catch (e) {
      return NextResponse.json({ success: false, error: "English directory not found", files: [] }, { status: 404 })
    }

    return NextResponse.json({ success: true, files: filesList.sort() })
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || "Failed to read english directory" },
      { status: 500 }
    )
  }
}


