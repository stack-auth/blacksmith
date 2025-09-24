import { NextResponse } from "next/server"

export async function POST() {
  try {
    const res = await fetch("http://localhost:3003/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    })

    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || "Failed to reach backend" },
      { status: 502 }
    )
  }
}


