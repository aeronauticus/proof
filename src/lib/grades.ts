/**
 * Convert a numeric percentage (0-100) to a US letter grade.
 * Standard +/- scale.
 */
export function percentToLetter(pct: number | null | undefined): string | null {
  if (pct == null || isNaN(pct)) return null;
  if (pct >= 93) return "A";
  if (pct >= 90) return "A-";
  if (pct >= 87) return "B+";
  if (pct >= 83) return "B";
  if (pct >= 80) return "B-";
  if (pct >= 77) return "C+";
  if (pct >= 73) return "C";
  if (pct >= 70) return "C-";
  if (pct >= 67) return "D+";
  if (pct >= 63) return "D";
  if (pct >= 60) return "D-";
  return "F";
}

/**
 * Derive a percentage from raw/total, or return null if either is missing.
 */
export function scoreToPercent(
  raw: number | null | undefined,
  total: number | null | undefined
): number | null {
  if (raw == null || total == null || total === 0) return null;
  return Math.round((raw / total) * 100);
}
