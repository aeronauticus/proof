import { join } from "path";

/**
 * Base directory for file uploads.
 *
 * On Railway, set UPLOAD_DIR to the volume mount path (e.g., "/data/uploads").
 * Locally, defaults to public/uploads/ for easy access during development.
 */
export const UPLOAD_BASE =
  process.env.UPLOAD_DIR || join(process.cwd(), "public", "uploads");

export function uploadDir(category: string) {
  return join(UPLOAD_BASE, category);
}

export function uploadUrl(category: string, filename: string) {
  return `/api/uploads/${category}/${filename}`;
}
