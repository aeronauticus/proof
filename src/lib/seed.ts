import { db } from "./db";
import {
  users,
  subjects,
  scheduleSlots,
  checklistTemplates,
} from "./schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";

async function seed() {
  console.log("Seeding database...");

  // ── Users ──────────────────────────────────────────────────────────────────

  const existingUsers = await db.select().from(users);
  if (existingUsers.length === 0) {
    const jackPin = await bcrypt.hash("1234", 10);
    const parentPin = await bcrypt.hash("0000", 10);

    await db.insert(users).values([
      { name: "Jack", role: "student", pinHash: jackPin },
      { name: "Parent", role: "parent", pinHash: parentPin },
    ]);
    console.log("  ✓ Users created (Jack PIN: 1234, Parent PIN: 0000)");
  } else {
    console.log("  - Users already exist, skipping");
  }

  // ── Subjects ───────────────────────────────────────────────────────────────

  const existingSubjects = await db.select().from(subjects);
  if (existingSubjects.length === 0) {
    await db.insert(subjects).values([
      { name: "History", color: "#3B82F6", teacher: "Smith" },       // blue
      { name: "Latin", color: "#EAB308", teacher: "Shlemon" },       // yellow
      { name: "Math", color: "#EF4444", teacher: "Lieurance" },      // red
      { name: "Grammar", color: "#22C55E", teacher: "Smith" },       // green
      { name: "Comp/Lit", color: "#A855F7", teacher: "Smith" },      // purple
      { name: "Bible", color: "#6B7280", teacher: "Smith" },         // gray
      { name: "Science", color: "#F97316", teacher: "Einstein" },    // orange
    ]);
    console.log("  ✓ Subjects created");
  } else {
    console.log("  - Subjects already exist, skipping");
  }

  // ── Schedule Slots ─────────────────────────────────────────────────────────

  const existingSlots = await db.select().from(scheduleSlots);
  if (existingSlots.length === 0) {
    // Look up subject IDs
    const allSubjects = await db.select().from(subjects);
    const byName = (name: string) => allSubjects.find((s) => s.name === name)!.id;

    const history = byName("History");
    const latin = byName("Latin");
    const math = byName("Math");
    const grammar = byName("Grammar");
    const compLit = byName("Comp/Lit");
    const bible = byName("Bible");
    const science = byName("Science");

    await db.insert(scheduleSlots).values([
      // Monday
      { subjectId: history, dayOfWeek: "mon", startTime: "08:15", endTime: "09:00" },
      { subjectId: latin,   dayOfWeek: "mon", startTime: "09:05", endTime: "09:55" },
      { subjectId: math,    dayOfWeek: "mon", startTime: "10:20", endTime: "11:10" },
      { subjectId: grammar, dayOfWeek: "mon", startTime: "11:15", endTime: "12:00" },
      { subjectId: compLit, dayOfWeek: "mon", startTime: "12:50", endTime: "13:45" },
      { subjectId: science, dayOfWeek: "mon", startTime: "13:55", endTime: "14:55" },

      // Tuesday
      { subjectId: history, dayOfWeek: "tue", startTime: "08:15", endTime: "09:00" },
      { subjectId: latin,   dayOfWeek: "tue", startTime: "09:05", endTime: "09:55" },
      { subjectId: math,    dayOfWeek: "tue", startTime: "10:20", endTime: "11:10" },
      { subjectId: bible,   dayOfWeek: "tue", startTime: "11:15", endTime: "12:00" },
      { subjectId: compLit, dayOfWeek: "tue", startTime: "12:50", endTime: "13:45" },

      // Wednesday
      { subjectId: history, dayOfWeek: "wed", startTime: "08:15", endTime: "09:00" },
      { subjectId: math,    dayOfWeek: "wed", startTime: "10:20", endTime: "11:10" },
      { subjectId: grammar, dayOfWeek: "wed", startTime: "11:15", endTime: "12:00" },
      { subjectId: compLit, dayOfWeek: "wed", startTime: "12:50", endTime: "13:45" },
      { subjectId: science, dayOfWeek: "wed", startTime: "13:55", endTime: "14:55" },

      // Thursday
      { subjectId: history, dayOfWeek: "thu", startTime: "08:15", endTime: "09:00" },
      { subjectId: latin,   dayOfWeek: "thu", startTime: "09:05", endTime: "09:55" },
      { subjectId: math,    dayOfWeek: "thu", startTime: "10:20", endTime: "11:10" },
      { subjectId: bible,   dayOfWeek: "thu", startTime: "11:15", endTime: "12:00" },
      { subjectId: science, dayOfWeek: "thu", startTime: "13:55", endTime: "14:55" },

      // Friday
      { subjectId: history, dayOfWeek: "fri", startTime: "08:15", endTime: "09:00" },
      { subjectId: compLit, dayOfWeek: "fri", startTime: "09:05", endTime: "10:00" },
      { subjectId: bible,   dayOfWeek: "fri", startTime: "10:20", endTime: "11:10" },
      { subjectId: grammar, dayOfWeek: "fri", startTime: "11:15", endTime: "12:00" },
      { subjectId: math,    dayOfWeek: "fri", startTime: "12:45", endTime: "13:35" },
    ]);
    console.log("  ✓ Schedule slots created");
  } else {
    console.log("  - Schedule slots already exist, skipping");
  }

  // ── Checklist Templates ────────────────────────────────────────────────────

  const existingTemplates = await db.select().from(checklistTemplates);
  if (existingTemplates.length === 0) {
    const allDays = ["mon", "tue", "wed", "thu", "fri"];

    await db.insert(checklistTemplates).values([
      {
        title: "Upload Planner Photo",
        description: "Photograph today's planner page and upload it.",
        orderIndex: 1,
        applicableDays: allDays,
        requiresParent: true,
        category: "organization",
        isDynamic: false,
      },
      {
        title: "Organization",
        description:
          "Bring home binders, organize papers (front = current, back = completed), write all assignments clearly in planner. Show planner and binders to parent.",
        orderIndex: 2,
        applicableDays: allDays,
        requiresParent: true,
        category: "organization",
        isDynamic: false,
      },
      {
        title: "Homework",
        description:
          "Complete all assigned homework. Write answers in complete sentences. Add explanation or detail where needed. Double-check work before stopping. Show completed homework to parent.",
        orderIndex: 3,
        applicableDays: allDays,
        requiresParent: true,
        category: "homework",
        isDynamic: false,
      },
      {
        title: "Review [Subject] Notes",
        description:
          "Upload notes photo. AI will evaluate your summary and quiz you on the material. Review notes carefully before answering quiz questions.",
        orderIndex: 4,
        applicableDays: allDays,
        requiresParent: false,
        category: "study",
        isDynamic: true,
      },
      {
        title: "Reading / Memory Work",
        description:
          "Work on assigned reading or memory work. Perform reading or memory work aloud to a parent.",
        orderIndex: 5,
        applicableDays: allDays,
        requiresParent: true,
        category: "study",
        isDynamic: false,
      },
      {
        title: "End-of-Day Check",
        description:
          "Know what you need to do tomorrow. Make sure binders are ready for school. Show final completed homework and planner to a parent.",
        orderIndex: 6,
        applicableDays: allDays,
        requiresParent: true,
        category: "end_of_day",
        isDynamic: false,
      },
    ]);
    console.log("  ✓ Checklist templates created");
  } else {
    console.log("  - Checklist templates already exist, skipping");
  }

  console.log("Seeding complete!");
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
