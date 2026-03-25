import {
  pgTable,
  serial,
  text,
  timestamp,
  integer,
  real,
  boolean,
  json,
  unique,
  index,
} from "drizzle-orm/pg-core";

// ── Users ──────────────────────────────────────────────────────────────────────

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  role: text("role", { enum: ["student", "parent"] }).notNull(),
  pinHash: text("pin_hash").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ── Subjects ───────────────────────────────────────────────────────────────────

export const subjects = pgTable("subjects", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  color: text("color").notNull(), // hex color
  teacher: text("teacher"),
});

// ── Schedule Slots (times vary by day) ─────────────────────────────────────────

export const scheduleSlots = pgTable(
  "schedule_slots",
  {
    id: serial("id").primaryKey(),
    subjectId: integer("subject_id")
      .references(() => subjects.id)
      .notNull(),
    dayOfWeek: text("day_of_week", {
      enum: ["mon", "tue", "wed", "thu", "fri"],
    }).notNull(),
    startTime: text("start_time").notNull(), // "09:05"
    endTime: text("end_time").notNull(), // "09:55"
  },
  (table) => [
    unique("unique_slot").on(table.subjectId, table.dayOfWeek),
    index("idx_schedule_day").on(table.dayOfWeek),
  ]
);

// ── Assignments ────────────────────────────────────────────────────────────────

export const assignments = pgTable(
  "assignments",
  {
    id: serial("id").primaryKey(),
    subjectId: integer("subject_id")
      .references(() => subjects.id)
      .notNull(),
    title: text("title").notNull(),
    description: text("description"),
    assignedDate: text("assigned_date").notNull(), // ISO date
    dueDate: text("due_date").notNull(),
    status: text("status", {
      enum: ["pending", "completed", "verified"],
    })
      .default("pending")
      .notNull(),
    completedAt: timestamp("completed_at"),
    photoPaths: json("photo_paths").$type<string[]>(),
    aiHomeworkEval: json("ai_homework_eval").$type<{
      looksLikeHomework: boolean;
      appearsComplete: boolean;
      missingAnswers: boolean;
      estimatedCompletionPct: number;
      feedback: string;
      parentNote: string;
    }>(),
    studentConfirmedComplete: boolean("student_confirmed_complete").default(false),
    verifiedBy: integer("verified_by").references(() => users.id),
    verifiedAt: timestamp("verified_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("idx_assignments_due").on(table.dueDate),
    index("idx_assignments_status").on(table.status),
  ]
);

// ── Tests / Quizzes ────────────────────────────────────────────────────────────

export const tests = pgTable(
  "tests",
  {
    id: serial("id").primaryKey(),
    subjectId: integer("subject_id")
      .references(() => subjects.id)
      .notNull(),
    type: text("type", { enum: ["test", "quiz"] }).notNull(),
    title: text("title").notNull(),
    topics: text("topics"),
    testDate: text("test_date").notNull(), // ISO date

    // Lifecycle: upcoming → taken → returned → reviewed
    status: text("status", {
      enum: ["upcoming", "taken", "returned", "reviewed"],
    })
      .default("upcoming")
      .notNull(),

    takenAt: timestamp("taken_at"),
    expectedReturnDate: text("expected_return_date"), // calculated

    // AI-read score
    scoreRaw: real("score_raw"),
    scoreTotal: real("score_total"),
    letterGrade: text("letter_grade"),
    aiConfidence: real("ai_confidence"), // 0-1
    photoPath: text("photo_path"),
    returnedAt: timestamp("returned_at"),

    // Error correction (when student disputes AI-read score)
    studentProposedScoreRaw: real("student_proposed_score_raw"),
    studentProposedScoreTotal: real("student_proposed_score_total"),
    studentProposedLetterGrade: text("student_proposed_letter_grade"),
    correctionStatus: text("correction_status", {
      enum: ["none", "pending", "approved", "rejected"],
    }).default("none"),
    correctionReason: text("correction_reason"),

    // Parent review
    reviewedBy: integer("reviewed_by").references(() => users.id),
    reviewedAt: timestamp("reviewed_at"),
    parentNotes: text("parent_notes"),

    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("idx_tests_date").on(table.testDate),
    index("idx_tests_status").on(table.status),
  ]
);

// ── Study Plans ────────────────────────────────────────────────────────────────

export const studyPlans = pgTable("study_plans", {
  id: serial("id").primaryKey(),
  testId: integer("test_id")
    .references(() => tests.id)
    .notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const studySessions = pgTable(
  "study_sessions",
  {
    id: serial("id").primaryKey(),
    planId: integer("plan_id")
      .references(() => studyPlans.id)
      .notNull(),
    sessionDate: text("session_date").notNull(), // ISO date
    sessionOrder: integer("session_order").notNull(),
    title: text("title").notNull(),
    technique: text("technique", {
      enum: [
        "review",
        "active_recall",
        "practice_test",
        "spaced_review",
        "elaboration",
        "interleaving",
      ],
    }).notNull(),
    durationMin: integer("duration_min").notNull(),
    description: text("description"),
    completed: boolean("completed").default(false).notNull(),
    completedAt: timestamp("completed_at"),
  },
  (table) => [index("idx_sessions_date").on(table.sessionDate)]
);

// ── Study Materials (photos of textbooks, handouts, etc.) ─────────────────────

export const studyMaterials = pgTable(
  "study_materials",
  {
    id: serial("id").primaryKey(),
    testId: integer("test_id")
      .references(() => tests.id)
      .notNull(),
    photoPath: text("photo_path"),
    uploadedAt: timestamp("uploaded_at").defaultNow().notNull(),
    extractedContent: json("extracted_content").$type<{
      rawText: string;
      highlightedText: string[];
      handwrittenNotes: string[];
      sourceType: "textbook" | "handout" | "notes" | "study_guide" | "other";
    }>(),
  },
  (table) => [index("idx_materials_test").on(table.testId)]
);

// ── Study Guides (AI-generated from materials) ───────────────────────────────

export const studyGuides = pgTable("study_guides", {
  id: serial("id").primaryKey(),
  testId: integer("test_id")
    .references(() => tests.id)
    .notNull(),
  content: json("content")
    .$type<{
      keyConcepts: Array<{ concept: string; explanation: string }>;
      vocabulary: Array<{ term: string; definition: string }>;
      importantFacts: string[];
      highlightedPriorities: string[];
      summary: string;
    }>()
    .notNull(),
  practiceQuiz: json("practice_quiz")
    .$type<
      Array<{
        question: string;
        choices?: string[];
        expectedAnswer: string;
        difficulty: "easy" | "medium" | "hard";
        sourceHint: string;
      }>
    >()
    .notNull(),
  quizAttempts: json("quiz_attempts").$type<
    Array<{
      attemptDate: string;
      answers: Array<{
        questionIndex: number;
        studentAnswer: string;
        correct: boolean;
        feedback: string;
        score: number;
      }>;
      overallScore: number;
    }>
  >(),
  materialCount: integer("material_count").notNull(),
  generatedAt: timestamp("generated_at").defaultNow().notNull(),
});

// ── Daily Notes ────────────────────────────────────────────────────────────────

export const dailyNotes = pgTable(
  "daily_notes",
  {
    id: serial("id").primaryKey(),
    date: text("date").notNull(), // ISO date
    subjectId: integer("subject_id")
      .references(() => subjects.id)
      .notNull(),
    photoPath: text("photo_path"), // legacy single photo
    photoPaths: json("photo_paths").$type<string[]>(), // multiple photos
    manualNotes: text("manual_notes"), // typed notes when photo is unreadable
    uploadedAt: timestamp("uploaded_at").defaultNow().notNull(),

    // AI evaluation
    summaryEvaluation: text("summary_evaluation", {
      enum: ["adequate", "too_brief", "unreadable", "pending"],
    }).default("pending"),
    summaryFeedback: text("summary_feedback"), // AI's specific feedback
    summaryWordCount: integer("summary_word_count"),

    // AI quiz
    quizQuestions: json("quiz_questions").$type<
      Array<{ question: string; expectedAnswer: string }>
    >(),
    quizAnswers: json("quiz_answers").$type<
      Array<{ answer: string; correct: boolean; feedback: string }>
    >(),
    quizScore: real("quiz_score"), // percentage
    quizCompletedAt: timestamp("quiz_completed_at"),
  },
  (table) => [
    unique("unique_note").on(table.date, table.subjectId),
    index("idx_notes_date").on(table.date),
  ]
);

// ── Checklist Templates ────────────────────────────────────────────────────────

export const checklistTemplates = pgTable("checklist_templates", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  orderIndex: integer("order_index").notNull(),
  applicableDays: json("applicable_days")
    .$type<string[]>()
    .notNull(), // ["mon","tue",...]
  requiresParent: boolean("requires_parent").default(false).notNull(),
  category: text("category", {
    enum: ["organization", "homework", "study", "end_of_day"],
  }).notNull(),
  isDynamic: boolean("is_dynamic").default(false).notNull(), // true = "Review [Subject] Notes"
});

// ── Daily Checklist Instances ──────────────────────────────────────────────────

export const dailyChecklist = pgTable(
  "daily_checklist",
  {
    id: serial("id").primaryKey(),
    templateId: integer("template_id").references(() => checklistTemplates.id),
    date: text("date").notNull(), // ISO date
    title: text("title").notNull(), // resolved title (e.g., "Review History Notes")
    subjectId: integer("subject_id").references(() => subjects.id), // for dynamic items
    completed: boolean("completed").default(false).notNull(),
    completedAt: timestamp("completed_at"),
    verifiedBy: integer("verified_by").references(() => users.id),
    verifiedAt: timestamp("verified_at"),
    notes: text("notes"),
    photoPaths: json("photo_paths").$type<string[]>(),
    aiHomeworkEval: json("ai_homework_eval").$type<{
      looksLikeHomework: boolean;
      appearsComplete: boolean;
      missingAnswers: boolean;
      estimatedCompletionPct: number;
      feedback: string;
      parentNote: string;
    }>(),
    studentConfirmedComplete: boolean("student_confirmed_complete").default(false),
    studySessionId: integer("study_session_id").references(() => studySessions.id),
    orderIndex: integer("order_index").notNull(),
    requiresParent: boolean("requires_parent").default(false).notNull(),
    waivedBy: integer("waived_by").references(() => users.id),
    waivedAt: timestamp("waived_at"),
  },
  (table) => [index("idx_checklist_date").on(table.date)]
);

// ── Planner Photos ─────────────────────────────────────────────────────────────

export const plannerPhotos = pgTable(
  "planner_photos",
  {
    id: serial("id").primaryKey(),
    date: text("date").notNull().unique(), // ISO date
    photoPath: text("photo_path"), // null when planner entered manually
    uploadedAt: timestamp("uploaded_at").defaultNow().notNull(),
  },
  (table) => [index("idx_planner_date").on(table.date)]
);

// ── School Calendar (Breaks) ───────────────────────────────────────────────────

export const schoolCalendar = pgTable(
  "school_calendar",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(), // "Christmas Break"
    startDate: text("start_date").notNull(),
    endDate: text("end_date").notNull(),
    type: text("type", {
      enum: ["summer", "holiday", "teacher_workday", "half_day"],
    }).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("idx_calendar_dates").on(table.startDate, table.endDate)]
);

// ── Audit Log ──────────────────────────────────────────────────────────────────

export const auditLog = pgTable(
  "audit_log",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .references(() => users.id)
      .notNull(),
    action: text("action").notNull(), // "create", "complete", "verify", "upload"
    entityType: text("entity_type").notNull(), // "assignment", "test", "checklist", etc.
    entityId: integer("entity_id").notNull(),
    oldValue: json("old_value"),
    newValue: json("new_value"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("idx_audit_entity").on(table.entityType, table.entityId),
    index("idx_audit_created").on(table.createdAt),
  ]
);

// ── Daily Stats ────────────────────────────────────────────────────────────────

export const dailyStats = pgTable("daily_stats", {
  id: serial("id").primaryKey(),
  date: text("date").notNull().unique(),
  checklistTotal: integer("checklist_total").notNull(),
  checklistDone: integer("checklist_done").notNull(),
  assignmentsDue: integer("assignments_due").notNull(),
  assignmentsDone: integer("assignments_done").notNull(),
  studySessionsDue: integer("study_sessions_due").notNull(),
  studySessionsDone: integer("study_sessions_done").notNull(),
  completionPct: real("completion_pct").notNull(),
  notesUploaded: integer("notes_uploaded").default(0),
  notesExpected: integer("notes_expected").default(0),
  quizAvgScore: real("quiz_avg_score"),
});
