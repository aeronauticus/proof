import { db } from "./db";
import { studyPlans, studySessions } from "./schema";
import { toISODate, isSchoolDay, parseISODate } from "./school-days";

type Technique =
  | "review"
  | "active_recall"
  | "practice_test"
  | "spaced_review"
  | "elaboration"
  | "interleaving";

interface SessionTemplate {
  technique: Technique;
  titleTemplate: string;
  descriptionTemplate: string;
  durationMin: number;
}

const SESSION_TEMPLATES: Record<Technique, SessionTemplate> = {
  review: {
    technique: "review",
    titleTemplate: "Initial Review: {topics}",
    descriptionTemplate:
      "Read through your notes on {topics}. Create a summary of the key concepts in your own words. Write down any terms or ideas you don't fully understand.",
    durationMin: 15,
  },
  active_recall: {
    technique: "active_recall",
    titleTemplate: "Active Recall: {topics}",
    descriptionTemplate:
      "Close your notes completely. Write down EVERYTHING you remember about {topics} from memory. Then open your notes and check what you missed. Re-study the gaps.",
    durationMin: 15,
  },
  practice_test: {
    technique: "practice_test",
    titleTemplate: "Practice Test: {topics}",
    descriptionTemplate:
      "Do practice problems or have a parent quiz you on {topics}. If there are no practice problems, create your own questions and answer them without looking at notes. Score yourself.",
    durationMin: 20,
  },
  spaced_review: {
    technique: "spaced_review",
    titleTemplate: "Final Review: {topics}",
    descriptionTemplate:
      "Focus on the material you got wrong in previous study sessions. Review your weak areas on {topics}. Do a final round of active recall to make sure it sticks.",
    durationMin: 15,
  },
  elaboration: {
    technique: "elaboration",
    titleTemplate: "Deep Understanding: {topics}",
    descriptionTemplate:
      'For each key concept in {topics}, explain WHY it works and HOW it connects to other things you know. Ask yourself "why is this true?" for each fact.',
    durationMin: 15,
  },
  interleaving: {
    technique: "interleaving",
    titleTemplate: "Mixed Practice: {topics}",
    descriptionTemplate:
      "Mix different types of problems from {topics}. Don't do all of one type — switch between different concepts to strengthen your ability to identify which approach to use.",
    durationMin: 15,
  },
};

function fillTemplate(template: string, topics: string): string {
  return template.replace(/\{topics\}/g, topics || "the test material");
}

/**
 * Generate a study plan for an upcoming test.
 * Uses cognitive science principles: spaced repetition, active recall,
 * practice testing, elaboration.
 */
export async function generateStudyPlan(
  testId: number,
  testDate: string,
  testTitle: string,
  topics: string | null,
  subjectName: string
): Promise<void> {
  const today = toISODate(new Date());
  const topicStr = topics || testTitle;

  // Find available school days between now and test date
  const availableDays: string[] = [];
  const current = new Date();
  const testDay = parseISODate(testDate);

  // Don't include test day itself
  while (current < testDay) {
    current.setDate(current.getDate() + 1);
    const dateStr = toISODate(current);
    if (dateStr >= testDate) break;
    if (dateStr <= today) continue; // skip past days
    if (await isSchoolDay(dateStr)) {
      availableDays.push(dateStr);
    }
  }

  // Also include today if it's a school day and before the test
  if (today < testDate && (await isSchoolDay(today))) {
    availableDays.unshift(today);
  }

  // Build study session sequence based on available days
  const sessions: Array<{
    sessionDate: string;
    sessionOrder: number;
    title: string;
    technique: Technique;
    durationMin: number;
    description: string;
  }> = [];

  if (availableDays.length === 0) {
    // Test is today or past — single cramming session
    sessions.push({
      sessionDate: today,
      sessionOrder: 1,
      title: fillTemplate(SESSION_TEMPLATES.active_recall.titleTemplate, topicStr),
      technique: "active_recall",
      durationMin: 20,
      description: `Last-minute review for ${subjectName}: ${fillTemplate(
        SESSION_TEMPLATES.active_recall.descriptionTemplate,
        topicStr
      )}`,
    });
  } else if (availableDays.length === 1) {
    sessions.push({
      sessionDate: availableDays[0],
      sessionOrder: 1,
      title: fillTemplate(SESSION_TEMPLATES.practice_test.titleTemplate, topicStr),
      technique: "practice_test",
      durationMin: 20,
      description: fillTemplate(
        SESSION_TEMPLATES.practice_test.descriptionTemplate,
        topicStr
      ),
    });
  } else if (availableDays.length === 2) {
    sessions.push({
      sessionDate: availableDays[0],
      sessionOrder: 1,
      title: fillTemplate(SESSION_TEMPLATES.review.titleTemplate, topicStr),
      technique: "review",
      durationMin: 15,
      description: fillTemplate(
        SESSION_TEMPLATES.review.descriptionTemplate,
        topicStr
      ),
    });
    sessions.push({
      sessionDate: availableDays[1],
      sessionOrder: 1,
      title: fillTemplate(SESSION_TEMPLATES.practice_test.titleTemplate, topicStr),
      technique: "practice_test",
      durationMin: 20,
      description: fillTemplate(
        SESSION_TEMPLATES.practice_test.descriptionTemplate,
        topicStr
      ),
    });
  } else {
    // 3+ days: full spaced repetition plan
    const sequence: Technique[] = ["review", "active_recall", "practice_test"];

    // Add elaboration / interleaving for extra days in the middle
    if (availableDays.length > 4) {
      for (let i = 3; i < availableDays.length - 1; i++) {
        sequence.push(i % 2 === 0 ? "elaboration" : "interleaving");
      }
    } else if (availableDays.length === 4) {
      sequence.push("elaboration");
    }

    // Always end with spaced review (day before test)
    sequence.push("spaced_review");

    // Map sessions to available days
    for (let i = 0; i < Math.min(sequence.length, availableDays.length); i++) {
      const technique = sequence[i];
      const template = SESSION_TEMPLATES[technique];
      sessions.push({
        sessionDate: availableDays[i],
        sessionOrder: 1,
        title: fillTemplate(template.titleTemplate, topicStr),
        technique,
        durationMin: template.durationMin,
        description: fillTemplate(template.descriptionTemplate, topicStr),
      });
    }
  }

  // Create the plan and sessions in the database
  const [plan] = await db
    .insert(studyPlans)
    .values({ testId })
    .returning();

  if (sessions.length > 0) {
    await db.insert(studySessions).values(
      sessions.map((s) => ({
        ...s,
        planId: plan.id,
      }))
    );
  }
}
