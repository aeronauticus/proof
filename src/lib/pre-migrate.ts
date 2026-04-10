/**
 * Schema migration script for production (Railway).
 * drizzle-kit push is interactive and hangs in non-TTY environments,
 * so we handle all schema changes here with raw SQL.
 */
import postgres from "postgres";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.log("  - No DATABASE_URL, skipping pre-migrate");
  process.exit(0);
}

const sql = postgres(DATABASE_URL);

/** Check if a table exists */
async function tableExists(name: string): Promise<boolean> {
  const rows = await sql`
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = ${name}
  `;
  return rows.length > 0;
}

/** Check if a column exists on a table */
async function columnExists(table: string, column: string): Promise<boolean> {
  const rows = await sql`
    SELECT 1 FROM information_schema.columns
    WHERE table_name = ${table} AND column_name = ${column}
  `;
  return rows.length > 0;
}

/** Check if a constraint exists */
async function constraintExists(name: string): Promise<boolean> {
  const rows = await sql`
    SELECT 1 FROM pg_constraint WHERE conname = ${name}
  `;
  return rows.length > 0;
}

/** Check if an index exists */
async function indexExists(name: string): Promise<boolean> {
  const rows = await sql`
    SELECT 1 FROM pg_indexes WHERE indexname = ${name}
  `;
  return rows.length > 0;
}

async function preMigrate() {
  console.log("Running schema migrations...");

  // ── Legacy migration: drop old photo_path column from daily_checklist ──
  if (await columnExists("daily_checklist", "photo_path")) {
    console.log("  ✓ Dropping old photo_path column from daily_checklist");
    await sql`ALTER TABLE daily_checklist DROP COLUMN photo_path`;
  }

  // ── Create study_materials table if missing ──
  if (!(await tableExists("study_materials"))) {
    console.log("  ✓ Creating study_materials table");
    await sql`
      CREATE TABLE "study_materials" (
        "id" SERIAL PRIMARY KEY,
        "test_id" INTEGER NOT NULL REFERENCES "tests"("id"),
        "photo_path" TEXT NOT NULL,
        "uploaded_at" TIMESTAMP DEFAULT NOW() NOT NULL,
        "extracted_content" JSON
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS "idx_materials_test" ON "study_materials"("test_id")`;
  }

  // ── Create study_guides table if missing ──
  if (!(await tableExists("study_guides"))) {
    console.log("  ✓ Creating study_guides table");
    await sql`
      CREATE TABLE "study_guides" (
        "id" SERIAL PRIMARY KEY,
        "test_id" INTEGER NOT NULL REFERENCES "tests"("id"),
        "content" JSON NOT NULL,
        "practice_quiz" JSON,
        "quiz_attempts" JSON,
        "material_count" INTEGER NOT NULL,
        "generated_at" TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `;
  }

  // ── Add unique constraint on daily_notes (date, subject_id) ──
  if (!(await constraintExists("unique_note"))) {
    console.log("  ✓ Adding unique_note constraint to daily_notes");
    // Deduplicate first to be safe
    await sql`
      DELETE FROM daily_notes a USING daily_notes b
      WHERE a.id < b.id AND a.date = b.date AND a.subject_id = b.subject_id
    `;
    await sql`ALTER TABLE "daily_notes" ADD CONSTRAINT "unique_note" UNIQUE("date","subject_id")`;
  }

  // ── Add unique constraint on class_schedule (subject_id, day_of_week) ──
  if (!(await constraintExists("unique_slot"))) {
    console.log("  ✓ Adding unique_slot constraint to class_schedule");
    await sql`
      DELETE FROM class_schedule a USING class_schedule b
      WHERE a.id < b.id AND a.subject_id = b.subject_id AND a.day_of_week = b.day_of_week
    `;
    await sql`ALTER TABLE "class_schedule" ADD CONSTRAINT "unique_slot" UNIQUE("subject_id","day_of_week")`;
  }

  // ── Add index on daily_notes.date if missing ──
  if (!(await indexExists("idx_notes_date"))) {
    console.log("  ✓ Adding idx_notes_date index");
    await sql`CREATE INDEX "idx_notes_date" ON "daily_notes"("date")`;
  }

  // ── Ensure any new columns exist on existing tables ──
  // study_guides.practice_quiz (may have been added as NOT NULL initially)
  // If the column exists but we need to make it nullable, that's fine — it already is in the CREATE above

  // daily_notes: add manual_notes column and make photo_path nullable
  if (!(await columnExists("daily_notes", "manual_notes"))) {
    console.log("  ✓ Adding manual_notes column to daily_notes");
    await sql`ALTER TABLE "daily_notes" ADD COLUMN "manual_notes" TEXT`;
  }
  // Make photo_path nullable (was NOT NULL, now optional since user can type notes instead)
  try {
    await sql`ALTER TABLE "daily_notes" ALTER COLUMN "photo_path" DROP NOT NULL`;
  } catch { /* already nullable */ }

  // tests table: ensure all columns exist
  if (!(await columnExists("tests", "correction_status"))) {
    console.log("  ✓ Adding correction_status column to tests");
    await sql`ALTER TABLE "tests" ADD COLUMN "correction_status" TEXT DEFAULT 'none' NOT NULL`;
  }

  if (!(await columnExists("tests", "student_proposed_score_raw"))) {
    console.log("  ✓ Adding student score proposal columns to tests");
    await sql`ALTER TABLE "tests" ADD COLUMN "student_proposed_score_raw" INTEGER`;
    await sql`ALTER TABLE "tests" ADD COLUMN "student_proposed_score_total" INTEGER`;
    await sql`ALTER TABLE "tests" ADD COLUMN "student_proposed_letter_grade" TEXT`;
    await sql`ALTER TABLE "tests" ADD COLUMN "correction_reason" TEXT`;
  }

  if (!(await columnExists("tests", "reviewed_by"))) {
    console.log("  ✓ Adding review columns to tests");
    await sql`ALTER TABLE "tests" ADD COLUMN "reviewed_by" INTEGER`;
    await sql`ALTER TABLE "tests" ADD COLUMN "reviewed_at" TIMESTAMP`;
    await sql`ALTER TABLE "tests" ADD COLUMN "parent_notes" TEXT`;
  }

  if (!(await columnExists("tests", "returned_at"))) {
    console.log("  ✓ Adding returned_at column to tests");
    await sql`ALTER TABLE "tests" ADD COLUMN "returned_at" TIMESTAMP`;
  }

  // daily_checklist: ensure newer columns exist
  if (!(await columnExists("daily_checklist", "ai_homework_eval"))) {
    console.log("  ✓ Adding ai_homework_eval column to daily_checklist");
    await sql`ALTER TABLE "daily_checklist" ADD COLUMN "ai_homework_eval" JSON`;
  }

  if (!(await columnExists("daily_checklist", "student_confirmed_complete"))) {
    console.log("  ✓ Adding student_confirmed_complete column to daily_checklist");
    await sql`ALTER TABLE "daily_checklist" ADD COLUMN "student_confirmed_complete" BOOLEAN DEFAULT false`;
  }

  if (!(await columnExists("daily_checklist", "photo_paths"))) {
    console.log("  ✓ Adding photo_paths column to daily_checklist");
    await sql`ALTER TABLE "daily_checklist" ADD COLUMN "photo_paths" JSON`;
  }

  // daily_notes: add photo_paths (multiple photos) column
  if (!(await columnExists("daily_notes", "photo_paths"))) {
    console.log("  ✓ Adding photo_paths column to daily_notes");
    await sql`ALTER TABLE "daily_notes" ADD COLUMN "photo_paths" JSON`;
  }

  // daily_checklist: add waived_by and waived_at columns for parent waive/dismiss
  if (!(await columnExists("daily_checklist", "waived_by"))) {
    console.log("  ✓ Adding waived_by/waived_at columns to daily_checklist");
    await sql`ALTER TABLE "daily_checklist" ADD COLUMN "waived_by" INTEGER REFERENCES "users"("id")`;
    await sql`ALTER TABLE "daily_checklist" ADD COLUMN "waived_at" TIMESTAMP`;
  }

  // planner_photos: make photo_path nullable (allow manual entry without photo)
  try {
    await sql`ALTER TABLE "planner_photos" ALTER COLUMN "photo_path" DROP NOT NULL`;
  } catch { /* already nullable */ }

  // study_materials: make photo_path nullable (allow manual text entry)
  try {
    await sql`ALTER TABLE "study_materials" ALTER COLUMN "photo_path" DROP NOT NULL`;
  } catch { /* already nullable */ }

  // tests: add photo_paths JSON column for multiple graded test photos
  if (!(await columnExists("tests", "photo_paths"))) {
    console.log("  ✓ Adding photo_paths column to tests");
    await sql`ALTER TABLE "tests" ADD COLUMN "photo_paths" JSON`;
    // Migrate existing single photo to array
    await sql`UPDATE "tests" SET "photo_paths" = json_build_array("photo_path") WHERE "photo_path" IS NOT NULL`;
  }

  await sql.end();
  console.log("Schema migrations complete!");
}

preMigrate().catch((err) => {
  console.error("Schema migration failed:", err);
  process.exit(1);
});
