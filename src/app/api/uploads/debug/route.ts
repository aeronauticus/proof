import { NextResponse } from "next/server";
import { readdir } from "fs/promises";
import { UPLOAD_BASE } from "@/lib/uploads";
import { join } from "path";

/**
 * Debug endpoint: lists upload directory contents.
 * GET /api/uploads/debug
 */
export async function GET() {
  const results: Record<string, string[]> = {};

  try {
    const categories = await readdir(UPLOAD_BASE);
    for (const cat of categories) {
      try {
        const files = await readdir(join(UPLOAD_BASE, cat));
        results[cat] = files.slice(0, 10); // first 10 per category
      } catch {
        results[cat] = ["(cannot read directory)"];
      }
    }
  } catch (err) {
    return NextResponse.json({
      error: "Cannot read UPLOAD_BASE",
      UPLOAD_BASE,
      UPLOAD_DIR: process.env.UPLOAD_DIR || "(not set)",
      message: err instanceof Error ? err.message : String(err),
    });
  }

  return NextResponse.json({
    UPLOAD_BASE,
    UPLOAD_DIR: process.env.UPLOAD_DIR || "(not set)",
    contents: results,
  });
}
