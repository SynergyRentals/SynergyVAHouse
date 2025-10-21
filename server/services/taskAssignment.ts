/**
 * Task Auto-Assignment Service
 * Enhanced with Slack notifications
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
  try {
    const vaUsers = await db.select().from(users).where(and(
      eq(users.isActive, true),
      sql`${users.role} ILIKE '%VA%'`
    ));

    const workloads: VAWorkload[] = [];
    for (const user of vaUsers) {
      const openTasks = await db.select({ count: sql<number>`count(*)` })
        .from(tasks).where(and(
          eq(tasks.assigneeId, user.id),
          inArray(tasks.status, ['OPEN', 'WAITING', 'BLOCKED'])
        ));

      const inProgressTasks = await db.select({ count: sql<number>`count(*)` })
        .from(tasks).where(and(
          eq(tasks.assigneeId, user.id),
          eq(tasks.status, 'IN_PROGRESS')
        ));

      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayCompleted = await db.select({ count: sql<number>`count(*)` })
        .from(tasks).where(and(
          eq(tasks.assigneeId, user.id),
          eq(tasks.status, 'DONE'),
          sql`${tasks.updatedAt} >= ${todayStart}`
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
  } catch (error) {
    console.error('[Task Assignment] Error getting VA workloads:', error);
    throw error;
  }
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
    console.error(`Invalid timezone: ${timezone}`, error);
    return true;
  }
}

export async function autoAssignTask(
  taskId: string, preferences: AssignmentPreferences = {}
): Promise<AssignmentResult> {
  try {
    const { maxOpenTasksPerVA = 5, respectShiftHours = true,
            autoBalance = true, forceAssigneeId } = preferences;

    if (forceAssigneeId) {
      const user = await db.select().from(users).where(eq(users.id, forceAssigneeId)).limit(1);
      if (!user[0]) return { success: false, reason: `User not found` };

      await db.update(tasks).set({
        assigneeId: forceAssigneeId, updatedAt: new Date()
      }).where(eq(tasks.id, taskId));

      // Send Slack notification for manual assignment
      await sendAssignmentNotification(taskId, forceAssigneeId);

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

    // Send Slack notification to assigned VA
    await sendAssignmentNotification(taskId, bestVA.userId);

    const alternatives = availableVAs.slice(1, 4).map(va => ({
      userId: va.userId, name: va.name,
      reason: `${va.openTaskCount} open tasks, score: ${va.capacityScore}`
    }));

    console.log(`[Task Assignment] ✅ Successfully assigned task ${taskId} to ${bestVA.name} (${bestVA.userId})`);

    return {
      success: true, assignedTo: bestVA.userId, assigneeName: bestVA.name,
      reason: `Best capacity: ${bestVA.capacityScore}/100 (${bestVA.openTaskCount} tasks)`,
      alternatives
    };
  } catch (error) {
    console.error(`[Task Assignment] Error auto-assigning task ${taskId}:`, error);
    throw error;
  }
}

/**
 * Helper function to send Slack notification after task assignment
 */
async function sendAssignmentNotification(taskId: string, userId: string): Promise<void> {
  try {
    // Get task details
    const taskDetails = await db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1);
    if (!taskDetails[0]) return;

    // Get user details to get Slack ID
    const userDetails = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!userDetails[0] || !userDetails[0].slackUserId) {
      console.log(`[Task Assignment] User ${userId} does not have a Slack ID, skipping notification`);
      return;
    }

    // Import and call notification service
    const { sendTaskAssignmentNotification } = await import('../slack/notifications');
    await sendTaskAssignmentNotification(userDetails[0].slackUserId, taskDetails[0]);
  } catch (error) {
    console.error(`[Task Assignment] Error sending notification for task ${taskId}:`, error);
    // Don't throw - notification failures shouldn't break assignment
  }
}

export async function batchAutoAssign(
  taskIds: string[], preferences: AssignmentPreferences = {}
): Promise<Record<string, AssignmentResult>> {
  try {
    const results: Record<string, AssignmentResult> = {};
    for (const taskId of taskIds) {
      results[taskId] = await autoAssignTask(taskId, preferences);
    }
    return results;
  } catch (error) {
    console.error('[Task Assignment] Error in batch auto-assign:', error);
    throw error;
  }
}

export async function rebalanceWorkload(maxTasksPerVA = 5): Promise<{
  success: boolean; rebalanced: number; details: string[];
}> {
  try {
    const workloads = await getVAWorkloads();
    const details: string[] = [];
    let rebalancedCount = 0;

    const overloaded = workloads.filter(va => va.openTaskCount > maxTasksPerVA);
    const underutilized = workloads.filter(va => va.openTaskCount < maxTasksPerVA / 2);

    if (overloaded.length === 0) {
      return { success: true, rebalanced: 0, details: ['Already balanced'] };
    }

    // Track reassignments per user for batch notifications
    const reassignmentsByUser: Record<string, Array<{ title: string; id: string; priority?: string }>> = {};

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

        // Track for batch notification
        if (!reassignmentsByUser[recipient.userId]) {
          reassignmentsByUser[recipient.userId] = [];
        }
        reassignmentsByUser[recipient.userId].push({
          id: task.id,
          title: task.title,
          priority: task.priority
        });

        recipient.openTaskCount++;
        rebalancedCount++;
        details.push(`Moved "${task.title}" from ${overloadedVA.name} to ${recipient.name}`);
        if (recipient.openTaskCount >= maxTasksPerVA / 2) underutilized.shift();
      }
    }

    // Send batch notifications to all affected VAs
    await sendRebalanceNotifications(reassignmentsByUser);

    console.log(`[Task Assignment] ✅ Rebalanced ${rebalancedCount} tasks across ${Object.keys(reassignmentsByUser).length} VAs`);

    return { success: true, rebalanced: rebalancedCount, details };
  } catch (error) {
    console.error('[Task Assignment] Error rebalancing workload:', error);
    throw error;
  }
}

/**
 * Helper function to send batch rebalance notifications
 */
async function sendRebalanceNotifications(
  reassignmentsByUser: Record<string, Array<{ title: string; id: string; priority?: string }>>
): Promise<void> {
  try {
    const { sendWorkloadRebalanceNotification } = await import('../slack/notifications');

    for (const [userId, reassignedTasks] of Object.entries(reassignmentsByUser)) {
      // Get user's Slack ID
      const userDetails = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      if (userDetails[0]?.slackUserId) {
        await sendWorkloadRebalanceNotification(userDetails[0].slackUserId, reassignedTasks);
      }
    }
  } catch (error) {
    console.error('[Task Assignment] Error sending rebalance notifications:', error);
    // Don't throw - notification failures shouldn't break rebalancing
  }
}

export async function getRecommendations(): Promise<Array<{
  taskId: string; taskTitle: string; recommendedVA: string;
  recommendedVAName: string; reason: string; confidence: number;
}>> {
  try {
    const unassignedTasks = await db.select().from(tasks).where(and(
      sql`${tasks.assigneeId} IS NULL OR ${tasks.assigneeId} = ''`,
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
        reason: `Best capacity (${bestVA.openTaskCount} open tasks)`,
        confidence: bestVA.capacityScore
      });
    }
    return recommendations;
  } catch (error) {
    console.error('[Task Assignment] Error getting recommendations:', error);
    throw error;
  }
}
