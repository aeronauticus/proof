import { Resend } from "resend";
import { db } from "./db";
import {
  assignments,
  dailyChecklist,
  dailyNotes,
  tests,
  plannerPhotos,
  subjects,
  studySessions,
  studyPlans,
  books,
  homeworkQuizzes,
} from "./schema";
import { eq, and, gte, lte, sql } from "drizzle-orm";
import { detectAnomalies, AnomalyFlag } from "./anomaly-detector";
import { toISODate } from "./school-days";

const resend = new Resend(process.env.RESEND_API_KEY);

/**
 * Get all parent email addresses from the PARENT_EMAILS env var.
 * Supports comma-separated list: "mom@example.com,dad@example.com"
 */
function getParentEmails(): string[] {
  const raw = process.env.PARENT_EMAILS || process.env.PARENT_EMAIL || "";
  return raw
    .split(",")
    .map((e) => e.trim())
    .filter((e) => e.length > 0);
}

interface HomeworkAiAlert {
  feedback: string;
  parentNote: string;
  estimatedCompletionPct: number;
  studentConfirmed: boolean;
}

interface DaySummaryData {
  date: string;
  plannerPhotoUploaded: boolean;
  checklist: { total: number; completed: number; verified: number };
  assignments: { total: number; completed: number; overdue: number };
  homeworkAiAlerts: HomeworkAiAlert[];
  notesReport: Array<{
    subject: string;
    evaluation: string;
    quizScore: number | null;
  }>;
  newScores: Array<{
    title: string;
    subject: string;
    scoreRaw: number | null;
    scoreTotal: number | null;
    letterGrade: string | null;
    aiConfidence: number | null;
  }>;
  corrections: Array<{
    title: string;
    subject: string;
    aiScore: string;
    proposedScore: string;
  }>;
  overdueTests: Array<{
    title: string;
    subject: string;
    takenAt: string;
    expectedReturnDate: string;
    daysOverdue: number;
  }>;
  upcomingTests: Array<{
    title: string;
    subject: string;
    testDate: string;
    daysUntil: number;
    hasStudyPlan: boolean;
  }>;
  anomalies: AnomalyFlag[];
  activeBook: {
    title: string;
    author: string | null;
    dueDate: string;
    daysUntilDue: number;
    testDueNow: boolean;
  } | null;
  homeworkGrading: {
    overdueReturns: Array<{
      subject: string;
      title: string;
      daysOverdue: number;
      isProject: boolean;
    }>;
    pendingQuizzes: Array<{
      subject: string;
      title: string;
      bestScorePct: number | null;
    }>;
  };
}

/**
 * Gather all data for the daily summary email.
 */
async function gatherDaySummary(dateStr: string): Promise<DaySummaryData> {
  const allSubjects = await db.select().from(subjects);
  const subjectMap = new Map(allSubjects.map((s) => [s.id, s.name]));

  // Planner photo
  const photos = await db
    .select()
    .from(plannerPhotos)
    .where(eq(plannerPhotos.date, dateStr));

  // Checklist
  const checklistItems = await db
    .select()
    .from(dailyChecklist)
    .where(eq(dailyChecklist.date, dateStr));
  const checklistCompleted = checklistItems.filter((c) => c.completed).length;
  const checklistVerified = checklistItems.filter((c) => c.verifiedBy).length;

  // Assignments due today
  const todayAssignments = await db
    .select()
    .from(assignments)
    .where(eq(assignments.dueDate, dateStr));
  const assignmentsCompleted = todayAssignments.filter(
    (a) => a.status === "completed" || a.status === "verified"
  ).length;
  const overdueAssignments = todayAssignments.filter(
    (a) => a.status === "pending"
  ).length;

  // Homework AI alerts
  const homeworkAiAlerts: HomeworkAiAlert[] = checklistItems
    .filter((c) => {
      const eval_ = c.aiHomeworkEval as HomeworkAiAlert | null;
      return eval_ && (eval_.estimatedCompletionPct < 100 || eval_.parentNote);
    })
    .map((c) => {
      const eval_ = c.aiHomeworkEval as { feedback: string; parentNote: string; estimatedCompletionPct: number; missingAnswers?: boolean; appearsComplete?: boolean };
      return {
        feedback: eval_.feedback,
        parentNote: eval_.parentNote,
        estimatedCompletionPct: eval_.estimatedCompletionPct,
        studentConfirmed: !!(c.studentConfirmedComplete),
      };
    });

  // Notes report
  const todayNotes = await db
    .select()
    .from(dailyNotes)
    .where(eq(dailyNotes.date, dateStr));
  const notesReport = todayNotes.map((n) => ({
    subject: subjectMap.get(n.subjectId) || "Unknown",
    evaluation: n.summaryEvaluation || "pending",
    quizScore: n.quizScore,
  }));

  // New scores read today (tests returned today)
  const returnedToday = await db
    .select()
    .from(tests)
    .where(
      and(
        eq(tests.status, "returned"),
        sql`DATE(${tests.returnedAt}) = ${dateStr}`
      )
    );
  // Also include tests that moved to "reviewed" today
  const reviewedToday = await db
    .select()
    .from(tests)
    .where(
      and(
        eq(tests.status, "reviewed"),
        sql`DATE(${tests.reviewedAt}) = ${dateStr}`
      )
    );
  const newScores = [...returnedToday, ...reviewedToday].map((t) => ({
    title: t.title,
    subject: subjectMap.get(t.subjectId) || "Unknown",
    scoreRaw: t.scoreRaw,
    scoreTotal: t.scoreTotal,
    letterGrade: t.letterGrade,
    aiConfidence: t.aiConfidence,
  }));

  // Pending error corrections
  const pendingCorrections = await db
    .select()
    .from(tests)
    .where(eq(tests.correctionStatus, "pending"));
  const corrections = pendingCorrections.map((t) => ({
    title: t.title,
    subject: subjectMap.get(t.subjectId) || "Unknown",
    aiScore: `${t.scoreRaw ?? "?"}/${t.scoreTotal ?? "?"}`,
    proposedScore: `${t.studentProposedScoreRaw ?? "?"}/${t.studentProposedScoreTotal ?? "?"}`,
  }));

  // Overdue tests (taken but not returned, past expected return date)
  const today = new Date(dateStr + "T00:00:00");
  const takenTests = await db
    .select()
    .from(tests)
    .where(eq(tests.status, "taken"));
  const overdueTests = takenTests
    .filter((t) => t.expectedReturnDate && t.expectedReturnDate < dateStr)
    .map((t) => {
      const expected = new Date(t.expectedReturnDate! + "T00:00:00");
      const daysOverdue = Math.floor(
        (today.getTime() - expected.getTime()) / (1000 * 60 * 60 * 24)
      );
      return {
        title: t.title,
        subject: subjectMap.get(t.subjectId) || "Unknown",
        takenAt: t.takenAt?.toISOString().split("T")[0] || "?",
        expectedReturnDate: t.expectedReturnDate!,
        daysOverdue,
      };
    });

  // Upcoming tests (next 7 days)
  const weekLater = new Date(today);
  weekLater.setDate(weekLater.getDate() + 7);
  const weekLaterStr = toISODate(weekLater);
  const upcomingTests = await db
    .select()
    .from(tests)
    .where(
      and(
        eq(tests.status, "upcoming"),
        gte(tests.testDate, dateStr),
        lte(tests.testDate, weekLaterStr)
      )
    );

  // Check which have study plans
  const upcomingTestData = [];
  for (const t of upcomingTests) {
    const plans = await db
      .select()
      .from(studyPlans)
      .where(eq(studyPlans.testId, t.id));
    const testDate = new Date(t.testDate + "T00:00:00");
    const daysUntil = Math.ceil(
      (testDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
    );
    upcomingTestData.push({
      title: t.title,
      subject: subjectMap.get(t.subjectId) || "Unknown",
      testDate: t.testDate,
      daysUntil,
      hasStudyPlan: plans.length > 0,
    });
  }

  // Anomalies
  const anomalies = await detectAnomalies(dateStr);

  // Active book
  const activeBooks = await db
    .select()
    .from(books)
    .where(eq(books.status, "active"));
  const activeBookRaw = activeBooks[0];
  let activeBook: DaySummaryData["activeBook"] = null;
  if (activeBookRaw) {
    const dueMs = new Date(activeBookRaw.dueDate + "T00:00:00").getTime();
    const todayMs = new Date(dateStr + "T00:00:00").getTime();
    const daysUntilDue = Math.ceil((dueMs - todayMs) / (1000 * 60 * 60 * 24));
    activeBook = {
      title: activeBookRaw.title,
      author: activeBookRaw.author,
      dueDate: activeBookRaw.dueDate,
      daysUntilDue,
      testDueNow: daysUntilDue <= 0,
    };
  }

  // Homework graded-return tracking
  const submittedHomework = await db
    .select({
      id: assignments.id,
      title: assignments.title,
      isProject: assignments.isProject,
      expectedReturnDate: assignments.expectedReturnDate,
      subjectName: subjects.name,
    })
    .from(assignments)
    .innerJoin(subjects, eq(assignments.subjectId, subjects.id))
    .where(eq(assignments.status, "submitted"));
  const overdueReturns = submittedHomework
    .filter((a) => a.expectedReturnDate && a.expectedReturnDate < dateStr)
    .map((a) => {
      const daysOverdue = Math.floor(
        (new Date(dateStr + "T00:00:00").getTime() -
          new Date(a.expectedReturnDate! + "T00:00:00").getTime()) /
          (1000 * 60 * 60 * 24)
      );
      return {
        subject: a.subjectName,
        title: a.title,
        daysOverdue,
        isProject: a.isProject,
      };
    });

  // Homework quizzes pending (not passed yet)
  const allQuizzes = await db
    .select({
      assignmentId: homeworkQuizzes.assignmentId,
      bestScorePct: homeworkQuizzes.bestScorePct,
      passedAt: homeworkQuizzes.passedAt,
      title: assignments.title,
      subjectName: subjects.name,
    })
    .from(homeworkQuizzes)
    .innerJoin(assignments, eq(homeworkQuizzes.assignmentId, assignments.id))
    .innerJoin(subjects, eq(assignments.subjectId, subjects.id));
  const pendingQuizzes = allQuizzes
    .filter((q) => !q.passedAt)
    .map((q) => ({
      subject: q.subjectName,
      title: q.title,
      bestScorePct: q.bestScorePct,
    }));

  return {
    date: dateStr,
    plannerPhotoUploaded: photos.length > 0,
    checklist: {
      total: checklistItems.length,
      completed: checklistCompleted,
      verified: checklistVerified,
    },
    assignments: {
      total: todayAssignments.length,
      completed: assignmentsCompleted,
      overdue: overdueAssignments,
    },
    homeworkAiAlerts,
    notesReport,
    newScores,
    corrections,
    overdueTests,
    upcomingTests: upcomingTestData,
    anomalies,
    activeBook,
    homeworkGrading: {
      overdueReturns,
      pendingQuizzes,
    },
  };
}

/**
 * Build HTML email body from the summary data.
 */
function buildEmailHtml(data: DaySummaryData): string {
  const dateDisplay = new Date(data.date + "T00:00:00").toLocaleDateString(
    "en-US",
    { weekday: "long", month: "long", day: "numeric", year: "numeric" }
  );

  const alertColor = "#DC2626";
  const warningColor = "#F59E0B";
  const greenColor = "#16A34A";
  const grayColor = "#6B7280";

  let html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #1F2937;">
  <h1 style="font-size: 24px; margin-bottom: 4px;">Proof — Daily Summary</h1>
  <p style="color: ${grayColor}; margin-top: 0;">${dateDisplay}</p>
  <hr style="border: none; border-top: 1px solid #E5E7EB;">`;

  // Anomalies / Flags
  if (data.anomalies.length > 0) {
    html += `<div style="background: #FEF2F2; border: 1px solid #FECACA; border-radius: 8px; padding: 12px; margin-bottom: 16px;">
      <h3 style="color: ${alertColor}; margin: 0 0 8px 0;">⚠ Flags</h3>
      <ul style="margin: 0; padding-left: 20px;">`;
    for (const a of data.anomalies) {
      const color = a.severity === "alert" ? alertColor : warningColor;
      html += `<li style="color: ${color}; margin-bottom: 4px;">${a.message}</li>`;
    }
    html += `</ul></div>`;
  }

  // Planner Photo
  html += `<div style="margin-bottom: 16px;">
    <h3 style="margin-bottom: 4px;">Planner Photo</h3>
    <p style="margin: 0; color: ${data.plannerPhotoUploaded ? greenColor : alertColor}; font-weight: 600;">
      ${data.plannerPhotoUploaded ? "✓ Uploaded" : "✗ NOT UPLOADED"}
    </p>
  </div>`;

  // Checklist Completion
  const checkPct =
    data.checklist.total > 0
      ? Math.round((data.checklist.completed / data.checklist.total) * 100)
      : 0;
  const checkColor = checkPct >= 90 ? greenColor : checkPct >= 50 ? warningColor : alertColor;
  html += `<div style="margin-bottom: 16px;">
    <h3 style="margin-bottom: 4px;">Checklist</h3>
    <p style="margin: 0;"><span style="color: ${checkColor}; font-weight: 600;">${data.checklist.completed}/${data.checklist.total}</span> completed (${checkPct}%) · ${data.checklist.verified} verified by parent</p>
  </div>`;

  // Homework AI Alerts
  if (data.homeworkAiAlerts.length > 0) {
    html += `<div style="background: #FFFBEB; border: 1px solid #FDE68A; border-radius: 8px; padding: 12px; margin-bottom: 16px;">
      <h3 style="color: ${warningColor}; margin: 0 0 8px 0;">Homework Review (AI)</h3>`;
    for (const alert of data.homeworkAiAlerts) {
      html += `<p style="margin: 4px 0; font-size: 14px;">${alert.parentNote}</p>`;
      html += `<p style="margin: 2px 0; font-size: 12px; color: ${grayColor};">Estimated completion: ${alert.estimatedCompletionPct}%`;
      if (alert.studentConfirmed) {
        html += ` — <span style="color: ${warningColor}; font-weight: 600;">Jack confirmed complete despite warning</span>`;
      }
      html += `</p>`;
    }
    html += `</div>`;
  }

  // Assignments
  if (data.assignments.total > 0) {
    html += `<div style="margin-bottom: 16px;">
      <h3 style="margin-bottom: 4px;">Assignments Due Today</h3>
      <p style="margin: 0;">${data.assignments.completed}/${data.assignments.total} completed`;
    if (data.assignments.overdue > 0) {
      html += ` · <span style="color: ${alertColor}; font-weight: 600;">${data.assignments.overdue} incomplete</span>`;
    }
    html += `</p></div>`;
  }

  // AI Grade Readings
  if (data.newScores.length > 0) {
    html += `<div style="margin-bottom: 16px;">
      <h3 style="margin-bottom: 4px;">New Grades (AI-Read)</h3>
      <table style="width: 100%; border-collapse: collapse;">`;
    for (const s of data.newScores) {
      html += `<tr style="border-bottom: 1px solid #E5E7EB;">
        <td style="padding: 6px 0;">${s.subject}: ${s.title}</td>
        <td style="padding: 6px 0; text-align: right; font-weight: 600;">${s.scoreRaw ?? "?"}/${s.scoreTotal ?? "?"} ${s.letterGrade ? `(${s.letterGrade})` : ""}</td>
      </tr>`;
    }
    html += `</table></div>`;
  }

  // Error Correction Requests
  if (data.corrections.length > 0) {
    html += `<div style="background: #FFFBEB; border: 1px solid #FDE68A; border-radius: 8px; padding: 12px; margin-bottom: 16px;">
      <h3 style="color: ${warningColor}; margin: 0 0 8px 0;">Score Corrections Pending Your Review</h3>`;
    for (const c of data.corrections) {
      html += `<p style="margin: 4px 0;"><strong>${c.subject}: ${c.title}</strong> — AI read: ${c.aiScore}, Jack says: ${c.proposedScore}</p>`;
    }
    html += `</div>`;
  }

  // Notes Quality Report
  if (data.notesReport.length > 0) {
    html += `<div style="margin-bottom: 16px;">
      <h3 style="margin-bottom: 4px;">Notes & Quiz Report</h3>
      <table style="width: 100%; border-collapse: collapse;">
        <tr style="border-bottom: 2px solid #E5E7EB;">
          <th style="text-align: left; padding: 4px 0;">Subject</th>
          <th style="text-align: center; padding: 4px 0;">Summary</th>
          <th style="text-align: right; padding: 4px 0;">Quiz</th>
        </tr>`;
    for (const n of data.notesReport) {
      const evalColor =
        n.evaluation === "adequate"
          ? greenColor
          : n.evaluation === "too_brief"
            ? warningColor
            : grayColor;
      const evalLabel =
        n.evaluation === "adequate"
          ? "✓ Good"
          : n.evaluation === "too_brief"
            ? "✗ Too Brief"
            : n.evaluation;
      html += `<tr style="border-bottom: 1px solid #E5E7EB;">
        <td style="padding: 4px 0;">${n.subject}</td>
        <td style="padding: 4px 0; text-align: center; color: ${evalColor};">${evalLabel}</td>
        <td style="padding: 4px 0; text-align: right;">${n.quizScore != null ? `${Math.round(n.quizScore)}%` : "—"}</td>
      </tr>`;
    }
    html += `</table></div>`;
  }

  // Overdue Test Returns
  if (data.overdueTests.length > 0) {
    html += `<div style="background: #FEF2F2; border: 1px solid #FECACA; border-radius: 8px; padding: 12px; margin-bottom: 16px;">
      <h3 style="color: ${alertColor}; margin: 0 0 8px 0;">⚠ Overdue Test Returns</h3>`;
    for (const t of data.overdueTests) {
      html += `<p style="margin: 4px 0;"><strong>${t.subject}: ${t.title}</strong> — taken ${t.takenAt}, expected back ${t.expectedReturnDate} <span style="color: ${alertColor}; font-weight: 600;">(${t.daysOverdue} day${t.daysOverdue !== 1 ? "s" : ""} overdue)</span></p>`;
    }
    html += `</div>`;
  }

  // Upcoming Tests
  if (data.upcomingTests.length > 0) {
    html += `<div style="margin-bottom: 16px;">
      <h3 style="margin-bottom: 4px;">Upcoming Tests (Next 7 Days)</h3>`;
    for (const t of data.upcomingTests) {
      const dateLabel = new Date(t.testDate + "T00:00:00").toLocaleDateString(
        "en-US",
        { weekday: "short", month: "short", day: "numeric" }
      );
      html += `<p style="margin: 4px 0;">${t.subject}: <strong>${t.title}</strong> — ${dateLabel} (${t.daysUntil} day${t.daysUntil !== 1 ? "s" : ""}) ${t.hasStudyPlan ? "✓ study plan" : '<span style="color: ' + warningColor + ';">no study plan</span>'}</p>`;
    }
    html += `</div>`;
  }

  // Homework graded-return overdue
  if (data.homeworkGrading.overdueReturns.length > 0) {
    html += `<div style="background: #FEF3C7; border: 1px solid #FCD34D; border-radius: 8px; padding: 12px; margin-bottom: 16px;">
      <h3 style="color: #92400E; margin: 0 0 8px 0;">📥 Graded Homework Late Coming Back</h3>`;
    for (const a of data.homeworkGrading.overdueReturns) {
      const tag = a.isProject ? " (project)" : "";
      html += `<p style="margin: 4px 0;"><strong>${a.subject}: ${a.title}</strong>${tag} — ${a.daysOverdue} day${a.daysOverdue !== 1 ? "s" : ""} past expected return</p>`;
    }
    html += `<p style="margin: 6px 0 0 0; font-size: 12px; color: #78350F;">Once it comes back, upload the graded version on the Homework page so AI can grade it and quiz Jack.</p>`;
    html += `</div>`;
  }

  // Pending homework quizzes
  if (data.homeworkGrading.pendingQuizzes.length > 0) {
    html += `<div style="margin-bottom: 16px;">
      <h3 style="margin-bottom: 4px;">Homework Quizzes Pending</h3>`;
    for (const q of data.homeworkGrading.pendingQuizzes) {
      const best = q.bestScorePct != null ? ` (best so far: ${q.bestScorePct}%)` : " (not attempted)";
      html += `<p style="margin: 4px 0;">${q.subject}: <strong>${q.title}</strong>${best}</p>`;
    }
    html += `<p style="margin: 6px 0 0 0; font-size: 12px; color: ${grayColor};">Jack must score 90%+ to clear his daily checklist.</p>`;
    html += `</div>`;
  }

  // Active book
  if (data.activeBook) {
    const b = data.activeBook;
    const dueDisplay = new Date(b.dueDate + "T00:00:00").toLocaleDateString("en-US", {
      weekday: "short", month: "short", day: "numeric",
    });
    if (b.testDueNow) {
      const overdueDays = -b.daysUntilDue;
      html += `<div style="background: #EEF2FF; border: 2px solid #C7D2FE; border-radius: 8px; padding: 12px; margin-bottom: 16px;">
        <h3 style="color: #4F46E5; margin: 0 0 8px 0;">📖 Book Test Due</h3>
        <p style="margin: 4px 0;"><strong>${b.title}</strong>${b.author ? ` by ${b.author}` : ""}</p>
        <p style="margin: 4px 0; color: ${alertColor}; font-weight: 600;">
          ${overdueDays === 0 ? "Due today" : `${overdueDays} day${overdueDays !== 1 ? "s" : ""} overdue`} — Jack needs to take his reading test. Give the test and enter his score in the app.
        </p>
      </div>`;
    } else if (b.daysUntilDue <= 7) {
      html += `<div style="margin-bottom: 16px;">
        <h3 style="margin-bottom: 4px;">Currently Reading</h3>
        <p style="margin: 0;"><strong>${b.title}</strong>${b.author ? ` by ${b.author}` : ""} — test by ${dueDisplay} <span style="color: ${warningColor};">(${b.daysUntilDue} day${b.daysUntilDue !== 1 ? "s" : ""})</span></p>
      </div>`;
    } else {
      html += `<div style="margin-bottom: 16px;">
        <h3 style="margin-bottom: 4px;">Currently Reading</h3>
        <p style="margin: 0;"><strong>${b.title}</strong>${b.author ? ` by ${b.author}` : ""} — test by ${dueDisplay} (${b.daysUntilDue} days)</p>
      </div>`;
    }
  } else {
    html += `<div style="margin-bottom: 16px;">
      <h3 style="margin-bottom: 4px;">Currently Reading</h3>
      <p style="margin: 0; color: ${grayColor};">No active book. Jack will be prompted to pick one.</p>
    </div>`;
  }

  // Footer
  html += `
  <hr style="border: none; border-top: 1px solid #E5E7EB; margin-top: 24px;">
  <p style="color: ${grayColor}; font-size: 12px;">Sent by Proof — Academic Accountability Tracker</p>
</body>
</html>`;

  return html;
}

/**
 * Send the daily summary email to all parent emails.
 */
export async function sendDailySummary(
  dateStr?: string
): Promise<{ success: boolean; sentTo: string[]; error?: string }> {
  const date = dateStr || toISODate(new Date());
  const emails = getParentEmails();

  if (emails.length === 0) {
    return {
      success: false,
      sentTo: [],
      error: "No parent emails configured. Set PARENT_EMAILS in environment.",
    };
  }

  const data = await gatherDaySummary(date);
  const html = buildEmailHtml(data);

  const dateDisplay = new Date(date + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });

  // Determine subject line based on severity of anomalies
  const hasAlerts = data.anomalies.some((a) => a.severity === "alert");
  const subjectPrefix = hasAlerts ? "⚠ " : "";
  const subject = `${subjectPrefix}Proof Daily Summary — ${dateDisplay}`;

  try {
    const response = await resend.emails.send({
      from: process.env.EMAIL_FROM || "Proof <noreply@resend.dev>",
      to: emails,
      subject,
      html,
    });

    console.log("Resend response:", JSON.stringify(response));

    if (response.error) {
      return { success: false, sentTo: [], error: response.error.message };
    }

    return { success: true, sentTo: emails };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Failed to send daily summary:", message);
    return { success: false, sentTo: [], error: message };
  }
}
