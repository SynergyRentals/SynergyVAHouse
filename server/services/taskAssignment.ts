/**
 * Task Auto-Assignment Service
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

export async function getVAWorkloads(): Promise<VAWorkload[]> {
  const vaUsers = await db.select().from(users).where(and(
    eq(users.isActive, true),
    sql\`\${users.role} ILIKE '%VA%'\`
  ));

  const workloads: VAWorkload[] = [];
  for (const user of vaUsers) {
    const openTasks = await db.select({ count: sql<number>\`count(*)\` })
      .from(tasks).where(and(
        eq(tasks.assigneeId, user.id),
        inArray(tasks.status, ['OPEN', 'WAITING', 'BLOCKED'])
      ));

    const inProgressTasks = await db.select({ count: sql<number>\`count(*)\` })
      .from(tasks).where(and(
        eq(tasks.assigneeId, user.id),
        eq(tasks.status, 'IN_PROGRESS')
      ));

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayCompleted = await db.select({ count: sql<number>\`count(*)\` })
      .from(tasks).where(and(
        eq(tasks.assigneeId, user.id),
        eq(tasks.status, 'DONE'),
        sql\`\${tasks.updatedAt} >= \${todayStart}\`
      ));

    const openCount = Number(openTasks[0]?.count || 0);
    const inProgressCount = Number(inProgressTasks[0]?.count || 0);
    const todayCompletedCount = Number(todayCompleted[0]?.count || 0);
    const isAvailable = isVAAvailable(user.timezone);
    const totalActiveTasks = openCount + inProgressCount;
    const maxTasks = 10;
    const workloadScore = Math.max(0, 100 - (totalActiveTasks / maxTasks) * 100);
    const availabilityBonus = isAvailable ? 20 : 0;
    const capacityScore = Math.min(100, workloadScore + availabilityBonus);

    workloads.push({
      userId: user.id, name: user.name, timezone: user.timezone,
      isActive: user.isActive, openTaskCount: openCount,
      inProgressCount, todayCompletedCount,
      avgCompletionTimeMinutes: null, isAvailable, capacityScore,
    });
  }
  return workloads.sort((a, b) => b.capacityScore - a.capacityScore);
}

function isVAAvailable(timezone: string): boolean {
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
      hour: 'numeric', hour12: false, timeZone: timezone,
    });
    const hourStr = formatter.format(now);
    const hour = parseInt(hourStr, 10);
    return hour >= 8 && hour < 18;
  } catch (error) {
    console.error(\`Invalid timezone: \${timezone}\`, error);
    return true;
  }
}

export async function autoAssignTask(
  taskId: string, preferences: AssignmentPreferences = {}
): Promise<AssignmentResult> {
  const { maxOpenTasksPerVA = 5, respectShiftHours = true, 
          autoBalance = true, forceAssigneeId } = preferences;

  if (forceAssigneeId) {
    const user = await db.select().from(users).where(eq(users.id, forceAssigneeId)).limit(1);
    if (!user[0]) return { success: false, reason: \`User not found\` };
    await db.update(tasks).set({ 
      assigneeId: forceAssigneeId, updatedAt: new Date()
    }).where(eq(tasks.id, taskId));
    return { success: true, assignedTo: forceAssigneeId, 
             assigneeName: user[0].name, reason: 'Manual override' };
  }

  const task = await db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1);
  if (!task[0]) return { success: false, reason: 'Task not found' };

  const workloads = await getVAWorkloads();
  if (workloads.length === 0) {
    return { success: false, reason: 'No active VAs available' };
  }

  let availableVAs = workloads;
  if (respectShiftHours) availableVAs = availableVAs.filter(va => va.isAvailable);
  if (autoBalance) availableVAs = availableVAs.filter(va => va.openTaskCount < maxOpenTasksPerVA);
  if (availableVAs.length === 0) availableVAs = workloads.filter(va => va.openTaskCount < maxOpenTasksPerVA * 2);
  if (availableVAs.length === 0) availableVAs = [workloads[0]];

  const bestVA = availableVAs[0];
  await db.update(tasks).set({ 
    assigneeId: bestVA.userId, updatedAt: new Date()
  }).where(eq(tasks.id, taskId));

  const alternatives = availableVAs.slice(1, 4).map(va => ({
    userId: va.userId, name: va.name,
    reason: \`\${va.openTaskCount} open tasks, score: \${va.capacityScore}\`
  }));

  return {
    success: true, assignedTo: bestVA.userId, assigneeName: bestVA.name,
    reason: \`Best capacity: \${bestVA.capacityScore}/100 (\${bestVA.openTaskCount} tasks)\`,
    alternatives
  };
}

export async function batchAutoAssign(
  taskIds: string[], preferences: AssignmentPreferences = {}
): Promise<Record<string, AssignmentResult>> {
  const results: Record<string, AssignmentResult> = {};
  for (const taskId of taskIds) {
    results[taskId] = await autoAssignTask(taskId, preferences);
  }
  return results;
}

export async function rebalanceWorkload(maxTasksPerVA = 5): Promise<{
  success: boolean; rebalanced: number; details: string[];
}> {
  const workloads = await getVAWorkloads();
  const details: string[] = [];
  let rebalancedCount = 0;

  const overloaded = workloads.filter(va => va.openTaskCount > maxTasksPerVA);
  const underutilized = workloads.filter(va => va.openTaskCount < maxTasksPerVA / 2);

  if (overloaded.length === 0) {
    return { success: true, rebalanced: 0, details: ['Already balanced'] };
  }

  for (const overloadedVA of overloaded) {
    const excessTasks = overloadedVA.openTaskCount - maxTasksPerVA;
    const tasksToMove = await db.select().from(tasks).where(and(
      eq(tasks.assigneeId, overloadedVA.userId), eq(tasks.status, 'OPEN')
    )).orderBy(desc(tasks.priority), asc(tasks.createdAt)).limit(excessTasks);

    for (const task of tasksToMove) {
      if (underutilized.length === 0) break;
      const recipient = underutilized[0];
      await db.update(tasks).set({ 
        assigneeId: recipient.userId, updatedAt: new Date()
      }).where(eq(tasks.id, task.id));

      recipient.openTaskCount++;
      rebalancedCount++;
      details.push(\`Moved "\${task.title}" from \${overloadedVA.name} to \${recipient.name}\`);
      if (recipient.openTaskCount >= maxTasksPerVA / 2) underutilized.shift();
    }
  }
  return { success: true, rebalanced: rebalancedCount, details };
}

export async function getRecommendations(): Promise<Array<{
  taskId: string; taskTitle: string; recommendedVA: string;
  recommendedVAName: string; reason: string; confidence: number;
}>> {
  const unassignedTasks = await db.select().from(tasks).where(and(
    sql\`\${tasks.assigneeId} IS NULL OR \${tasks.assigneeId} = ''\`,
    eq(tasks.status, 'OPEN')
  )).orderBy(asc(tasks.priority), desc(tasks.createdAt));

  const workloads = await getVAWorkloads();
  const recommendations = [];

  for (const task of unassignedTasks) {
    if (workloads.length === 0) break;
    const bestVA = workloads[0];
    recommendations.push({
      taskId: task.id, taskTitle: task.title,
      recommendedVA: bestVA.userId, recommendedVAName: bestVA.name,
      reason: \`Best capacity (\${bestVA.openTaskCount} open tasks)\`,
      confidence: bestVA.capacityScore
    });
  }
  return recommendations;
}
