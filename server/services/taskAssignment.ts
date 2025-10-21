/**
 * Task Auto-Assignment Service
 *
 * Intelligently assigns tasks to VAs based on:
 * - Current workload and capacity
 * - Shift hours and timezone availability
 * - Task priority and category
 * - Historical performance metrics
 */

import { db } from "../db";
import { tasks, users } from "../../shared/schema";
import { eq, and, sql, desc, asc, inArray } from "drizzle-orm";

export interface AssignmentPreferences {
  maxOpenTasksPerVA?: number;
  respectShiftHours?: boolean;
  autoBalance?: boolean;
  forceAssigneeId?: string;
}

export interface VAWorkload {
  userId: string;
  name: string;
  timezone: string;
  isActive: boolean;
  openTaskCount: number;
  inProgressCount: number;
  todayCompletedCount: number;
  avgCompletionTimeMinutes: number | null;
  isAvailable: boolean;
  capacityScore: number;
}

export interface AssignmentResult {
  success: boolean;
  assignedTo?: string;
  assigneeName?: string;
  reason: string;
  alternatives?: Array<{ userId: string; name: string; reason: string }>;
}

/**
 * Helper function to check if VA is available based on their timezone
 * Shift hours: 8 AM - 8 PM local time
 */
function isVAAvailable(timezone: string): boolean {
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "2-digit",
      hour12: false,
    });
    const localHour = parseInt(formatter.format(now));
    return localHour >= 8 && localHour < 20; // 8 AM to 8 PM
  } catch (error) {
    console.error(`Invalid timezone: ${timezone}`, error);
    return true; // Default to available if timezone is invalid
  }
}

/**
 * Get real-time workload metrics for all active VAs
 */
export async function getVAWorkloads(): Promise<VAWorkload[]> {
  const vaUsers = await db
    .select()
    .from(users)
    .where(and(eq(users.isActive, true), sql`${users.role} ILIKE '%VA%'`));

  const workloads: VAWorkload[] = [];

  for (const user of vaUsers) {
    // Count open tasks (OPEN, WAITING, BLOCKED statuses)
    const openTasks = await db
      .select({ count: sql<number>`count(*)` })
      .from(tasks)
      .where(
        and(
          eq(tasks.assigneeId, user.id),
          inArray(tasks.status, ["OPEN", "WAITING", "BLOCKED"]),
        ),
      );

    // Count in-progress tasks
    const inProgressTasks = await db
      .select({ count: sql<number>`count(*)` })
      .from(tasks)
      .where(
        and(eq(tasks.assigneeId, user.id), eq(tasks.status, "IN_PROGRESS")),
      );

    // Count tasks completed today
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const todayCompleted = await db
      .select({ count: sql<number>`count(*)` })
      .from(tasks)
      .where(
        and(
          eq(tasks.assigneeId, user.id),
          eq(tasks.status, "DONE"),
          sql`${tasks.updatedAt} >= ${todayStart}`,
        ),
      );

    // Calculate average completion time (simplified)
    // In production, you'd track createdAt → completedAt duration
    const avgCompletionTimeMinutes = null; // Placeholder for future implementation

    const openCount = Number(openTasks[0]?.count || 0);
    const inProgressCount = Number(inProgressTasks[0]?.count || 0);
    const todayCompletedCount = Number(todayCompleted[0]?.count || 0);
    const isAvailable = isVAAvailable(user.timezone);

    // Calculate capacity score (0-100)
    // Lower task count = higher capacity
    const totalActiveTasks = openCount + inProgressCount;
    const maxTasks = 10; // Configurable threshold
    const workloadScore = Math.max(
      0,
      100 - (totalActiveTasks / maxTasks) * 100,
    );

    // Boost score if VA is currently available (during shift hours)
    const availabilityBonus = isAvailable ? 20 : 0;
    const capacityScore = Math.min(100, workloadScore + availabilityBonus);

    workloads.push({
      userId: user.id,
      name: user.name,
      timezone: user.timezone,
      isActive: user.isActive,
      openTaskCount: openCount,
      inProgressCount,
      todayCompletedCount,
      avgCompletionTimeMinutes,
      isAvailable,
      capacityScore,
    });
  }

  // Sort by capacity score (highest first)
  return workloads.sort((a, b) => b.capacityScore - a.capacityScore);
}

/**
 * Auto-assign a single task to the most suitable VA
 */
export async function autoAssignTask(
  taskId: string,
  preferences: AssignmentPreferences = {},
): Promise<AssignmentResult> {
  const {
    maxOpenTasksPerVA = 5,
    respectShiftHours = true,
    autoBalance = true,
    forceAssigneeId,
  } = preferences;

  // If forced assignment, assign directly
  if (forceAssigneeId) {
    const user = await db
      .select()
      .from(users)
      .where(eq(users.id, forceAssigneeId))
      .limit(1);
    if (user.length === 0) {
      return { success: false, reason: "Forced assignee not found" };
    }

    await db
      .update(tasks)
      .set({ assigneeId: forceAssigneeId, updatedAt: new Date() })
      .where(eq(tasks.id, taskId));

    return {
      success: true,
      assignedTo: forceAssigneeId,
      assigneeName: user[0].name,
      reason: "Manually assigned by manager",
    };
  }

  // Get all VA workloads
  const workloads = await getVAWorkloads();

  if (workloads.length === 0) {
    return { success: false, reason: "No active VAs available" };
  }

  // Filter VAs based on preferences
  let availableVAs = workloads;

  if (respectShiftHours) {
    availableVAs = availableVAs.filter((va) => va.isAvailable);
  }

  if (autoBalance) {
    availableVAs = availableVAs.filter(
      (va) => va.openTaskCount < maxOpenTasksPerVA,
    );
  }

  // If no VAs meet criteria, relax filters
  if (availableVAs.length === 0) {
    availableVAs = workloads.filter(
      (va) => va.openTaskCount < maxOpenTasksPerVA * 2,
    );
  }

  if (availableVAs.length === 0) {
    availableVAs = [workloads[0]]; // Fallback to best available VA
  }

  // Assign to VA with highest capacity score
  const bestVA = availableVAs[0];

  await db
    .update(tasks)
    .set({ assigneeId: bestVA.userId, updatedAt: new Date() })
    .where(eq(tasks.id, taskId));

  // Generate alternatives for manager review
  const alternatives = availableVAs.slice(1, 4).map((va) => ({
    userId: va.userId,
    name: va.name,
    reason: `${va.openTaskCount} open tasks, score: ${va.capacityScore}`,
  }));

  return {
    success: true,
    assignedTo: bestVA.userId,
    assigneeName: bestVA.name,
    reason: `Best capacity: ${bestVA.capacityScore}/100 (${bestVA.openTaskCount} tasks)`,
    alternatives,
  };
}

/**
 * Auto-assign multiple tasks at once
 */
export async function batchAutoAssign(
  taskIds: string[],
  preferences: AssignmentPreferences = {},
): Promise<Record<string, AssignmentResult>> {
  const results: Record<string, AssignmentResult> = {};

  for (const taskId of taskIds) {
    results[taskId] = await autoAssignTask(taskId, preferences);
  }

  return results;
}

/**
 * Rebalance workload by redistributing tasks from overloaded VAs
 */
export async function rebalanceWorkload(maxTasksPerVA = 5): Promise<{
  success: boolean;
  rebalanced: number;
  details: string[];
}> {
  const workloads = await getVAWorkloads();
  const details: string[] = [];
  let rebalancedCount = 0;

  // Find overloaded VAs
  const overloaded = workloads.filter((va) => va.openTaskCount > maxTasksPerVA);
  const underutilized = workloads.filter(
    (va) => va.openTaskCount < maxTasksPerVA,
  );

  if (overloaded.length === 0) {
    return { success: true, rebalanced: 0, details: ["No rebalancing needed"] };
  }

  if (underutilized.length === 0) {
    return {
      success: false,
      rebalanced: 0,
      details: ["All VAs are at capacity"],
    };
  }

  // Redistribute tasks
  for (const va of overloaded) {
    const excessTasks = va.openTaskCount - maxTasksPerVA;

    // Get this VA's OPEN tasks (oldest first)
    const vaOpenTasks = await db
      .select()
      .from(tasks)
      .where(and(eq(tasks.assigneeId, va.userId), eq(tasks.status, "OPEN")))
      .orderBy(asc(tasks.createdAt))
      .limit(excessTasks);

    for (const task of vaOpenTasks) {
      // Find best underutilized VA
      const targetVA = underutilized.find(
        (v) => v.openTaskCount < maxTasksPerVA,
      );

      if (!targetVA) break;

      // Reassign task
      await db
        .update(tasks)
        .set({ assigneeId: targetVA.userId, updatedAt: new Date() })
        .where(eq(tasks.id, task.id));

      targetVA.openTaskCount++;
      rebalancedCount++;

      details.push(
        `Moved task "${task.title}" from ${va.name} to ${targetVA.name}`,
      );
    }
  }

  return {
    success: true,
    rebalanced: rebalancedCount,
    details: details.length > 0 ? details : ["No tasks could be rebalanced"],
  };
}

/**
 * Get assignment recommendations for unassigned tasks
 */
export async function getRecommendations(): Promise<
  Array<{
    taskId: string;
    taskTitle: string;
    recommendedVA: string;
    vaName: string;
    reason: string;
  }>
> {
  // Get all unassigned tasks
  const unassignedTasks = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.status, "OPEN"), sql`${tasks.assigneeId} IS NULL`))
    .limit(20);

  const recommendations = [];
  const workloads = await getVAWorkloads();

  for (const task of unassignedTasks) {
    const bestVA = workloads[0]; // VA with highest capacity

    recommendations.push({
      taskId: task.id,
      taskTitle: task.title,
      recommendedVA: bestVA.userId,
      vaName: bestVA.name,
      reason: `Available (${bestVA.openTaskCount} tasks, score: ${bestVA.capacityScore})`,
    });
  }

  return recommendations;
}

/**
 * Auto-assign all unassigned tasks
 */
export async function autoAssignAllUnassigned(
  preferences: AssignmentPreferences = {},
): Promise<{
  success: boolean;
  assigned: number;
  failed: number;
  details: string[];
}> {
  const unassignedTasks = await db
    .select({ id: tasks.id })
    .from(tasks)
    .where(and(eq(tasks.status, "OPEN"), sql`${tasks.assigneeId} IS NULL`));

  const taskIds = unassignedTasks.map((t) => t.id);
  const results = await batchAutoAssign(taskIds, preferences);

  const assigned = Object.values(results).filter((r) => r.success).length;
  const failed = taskIds.length - assigned;

  const details = Object.entries(results).map(([taskId, result]) =>
    result.success
      ? `✓ Task ${taskId}: ${result.assigneeName}`
      : `✗ Task ${taskId}: ${result.reason}`,
  );

  return {
    success: assigned > 0,
    assigned,
    failed,
    details,
  };
}

/**
 * Get summary statistics for workload dashboard
 */
export async function getWorkloadSummary(): Promise<{
  totalVAs: number;
  availableNow: number;
  averageCapacity: number;
  mostUtilized: VAWorkload | null;
  leastUtilized: VAWorkload | null;
  totalOpenTasks: number;
  totalInProgress: number;
  unassignedTasks: number;
}> {
  const workloads = await getVAWorkloads();

  const totalOpenTasks = workloads.reduce(
    (sum, va) => sum + va.openTaskCount,
    0,
  );
  const totalInProgress = workloads.reduce(
    (sum, va) => sum + va.inProgressCount,
    0,
  );
  const averageCapacity =
    workloads.length > 0
      ? Math.round(
          workloads.reduce((sum, va) => sum + va.capacityScore, 0) /
            workloads.length,
        )
      : 0;

  const unassignedTasksResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(tasks)
    .where(and(eq(tasks.status, "OPEN"), sql`${tasks.assigneeId} IS NULL`));

  return {
    totalVAs: workloads.length,
    availableNow: workloads.filter((va) => va.isAvailable).length,
    averageCapacity,
    mostUtilized: workloads[workloads.length - 1] || null,
    leastUtilized: workloads[0] || null,
    totalOpenTasks,
    totalInProgress,
    unassignedTasks: Number(unassignedTasksResult[0]?.count || 0),
  };
}
