import { NextResponse } from "next/server"
import { promises as fs } from "fs"
import path from "path"

export async function GET(_req: Request, { params }: { params: { name: string } }) {
  try {
    const baseDir = path.resolve(process.cwd(), "..", "files", "english")
    const filePath = path.join(baseDir, params.name)
    const content = await fs.readFile(filePath, "utf-8")
    return NextResponse.json({ success: true, name: params.name, content })
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || "Failed to read file" },
      { status: 404 }
    )
  }
}

export async function POST(req: Request, { params }: { params: { name: string } }) {
  try {
    const body = await req.json()
    const content = typeof body?.content === "string" ? body.content : ""
    const baseDir = path.resolve(process.cwd(), "..", "files", "english")
    const filePath = path.join(baseDir, params.name)
    await fs.writeFile(filePath, content, "utf-8")
    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || "Failed to write file" },
      { status: 500 }
    )
  }
}


