/**
 * Pre-migration script that handles schema changes requiring interactive
 * drizzle-kit prompts (column renames, etc.) so `drizzle-kit push` can
 * run non-interactively in CI/Railway.
 */
import postgres from "postgres";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.log("  - No DATABASE_URL, skipping pre-migrate");
  process.exit(0);
}

const sql = postgres(DATABASE_URL);

async function preMigrate() {
  console.log("Running pre-migrations...");

  // Migration: rename photo_path (text) → photo_paths (json) in daily_checklist
  // If the old column exists, drop it so drizzle-kit push just creates the new one
  const hasOldColumn = await sql`
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'daily_checklist' AND column_name = 'photo_path'
  `;

  if (hasOldColumn.length > 0) {
    console.log("  ✓ Dropping old photo_path column from daily_checklist");
    await sql`ALTER TABLE daily_checklist DROP COLUMN photo_path`;
  } else {
    console.log("  - photo_path column already migrated, skipping");
  }

  // Migration: add unique constraint on daily_notes (date, subject_id)
  // drizzle-kit push prompts interactively for this, so we handle it here.
  // We check BOTH pg_constraint (for ALTER TABLE ADD CONSTRAINT) and pg_indexes
  // (for CREATE UNIQUE INDEX) since drizzle-kit may expect either form.
  const hasUniqueNote = await sql`
    SELECT 1 FROM pg_constraint
    WHERE conname = 'unique_note' AND conrelid = 'daily_notes'::regclass
  `;
  const hasUniqueIndex = await sql`
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'daily_notes' AND indexname = 'unique_note'
  `;

  if (hasUniqueNote.length === 0 && hasUniqueIndex.length === 0) {
    console.log("  ✓ Adding unique_note constraint to daily_notes");
    // Deduplicate first to be safe
    await sql`
      DELETE FROM daily_notes a USING daily_notes b
      WHERE a.id < b.id AND a.date = b.date AND a.subject_id = b.subject_id
    `;
    await sql`ALTER TABLE "daily_notes" ADD CONSTRAINT "unique_note" UNIQUE("date","subject_id")`;
  } else {
    console.log("  - unique_note constraint already exists, skipping");
  }

  await sql.end();
  console.log("Pre-migrations complete!");
}

preMigrate().catch((err) => {
  console.error("Pre-migrate failed:", err);
  process.exit(1);
});
