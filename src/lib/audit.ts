import { db } from "./db";
import { auditLog } from "./schema";

export async function logAction(
  userId: number,
  action: string,
  entityType: string,
  entityId: number,
  oldValue?: unknown,
  newValue?: unknown
) {
  await db.insert(auditLog).values({
    userId,
    action,
    entityType,
    entityId,
    oldValue: oldValue ?? null,
    newValue: newValue ?? null,
  });
}
