import { AccountStatus, TaskStatus, TaskType, UserRole } from '@prisma/client';

/**
 * Roles that may receive task assignments. Deliberately mirrors the
 * "operational" role set already used for provisioning/room-assignment
 * elsewhere in the codebase (ADMIN and SUPER_ADMIN are managers, not
 * task recipients).
 */
export const TASK_ELIGIBLE_ASSIGNEE_ROLES: UserRole[] = [
  UserRole.MEMBER,
  UserRole.TEAM_LEAD,
  UserRole.SERVER,
];

/**
 * The authoritative status graph. A transition not listed here is rejected
 * by the backend regardless of what the frontend sends.
 */
export const VALID_STATUS_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  [TaskStatus.DRAFT]: [TaskStatus.ASSIGNED, TaskStatus.CANCELLED],
  [TaskStatus.ASSIGNED]: [TaskStatus.IN_PROGRESS, TaskStatus.CANCELLED],
  [TaskStatus.IN_PROGRESS]: [
    TaskStatus.BLOCKED,
    TaskStatus.SUBMITTED,
    TaskStatus.COMPLETED,
    TaskStatus.CANCELLED,
  ],
  [TaskStatus.BLOCKED]: [TaskStatus.IN_PROGRESS, TaskStatus.CANCELLED],
  [TaskStatus.SUBMITTED]: [TaskStatus.IN_PROGRESS, TaskStatus.COMPLETED, TaskStatus.CANCELLED],
  // Terminal states only leave via an explicit reopen, never a forward transition.
  [TaskStatus.COMPLETED]: [TaskStatus.IN_PROGRESS, TaskStatus.ASSIGNED],
  [TaskStatus.CANCELLED]: [],
};

export function isValidStatusTransition(from: TaskStatus, to: TaskStatus): boolean {
  if (from === to) return true; // idempotent no-op, not an error
  return VALID_STATUS_TRANSITIONS[from]?.includes(to) ?? false;
}

export function isReopenTransition(from: TaskStatus, to: TaskStatus): boolean {
  return from === TaskStatus.COMPLETED && to !== TaskStatus.COMPLETED;
}

/** Progress reaching 100 always means the task is done. */
export function statusForProgress(progress: number, currentStatus: TaskStatus): TaskStatus {
  if (progress >= 100) return TaskStatus.COMPLETED;
  if (currentStatus === TaskStatus.COMPLETED && progress < 100) {
    // Progress was pulled back down on an already-completed task — treat as
    // an implicit reopen so status and progress never contradict each other.
    return TaskStatus.IN_PROGRESS;
  }
  return currentStatus;
}

export interface TaskActorContext {
  id: string;
  role: UserRole | null | undefined;
  accountStatus: AccountStatus;
  organizationId: string;
  roomId?: string | null;
  /** The actor's own section letter (e.g. "B") — required for team-task scope checks, since those can't be derived from an assignee's room when the task is unassigned. */
  roomLetter?: string | null;
}

export interface TaskScopeContext {
  organizationId: string;
  creatorId: string | null;
  assigneeId: string | null;
  assigneeRoomId?: string | null;
  taskType?: TaskType;
  teamSection?: string | null;
}

function isAdmin(actor: TaskActorContext): boolean {
  return actor.role === UserRole.SUPER_ADMIN || actor.role === UserRole.ADMIN;
}

function isSameOrg(actor: TaskActorContext, task: TaskScopeContext): boolean {
  return actor.organizationId === task.organizationId;
}

function isTeamLeadInScope(actor: TaskActorContext, task: TaskScopeContext): boolean {
  return (
    actor.role === UserRole.TEAM_LEAD &&
    Boolean(actor.roomId) &&
    task.assigneeRoomId != null &&
    actor.roomId === task.assigneeRoomId
  );
}

/** Can this actor even see the task exists (list it / open its detail)? */
export function canViewTask(actor: TaskActorContext, task: TaskScopeContext): boolean {
  if (!isSameOrg(actor, task)) return false;
  if (isAdmin(actor)) return true;
  if (actor.id === task.creatorId || actor.id === task.assigneeId) return true;
  // An unassigned TEAM task has no assigneeRoomId to compare against — only
  // that section's own Team Lead may see it before it's been assigned.
  if (task.taskType === TaskType.TEAM && task.assigneeId == null) {
    return canManageTeamTask(actor, task);
  }
  // SERVER gets the same room-wide *visibility* as TEAM_LEAD (section/room
  // context), even though their *mutation* rights stay narrower — see
  // canManageTask below.
  if ((actor.role === UserRole.TEAM_LEAD || actor.role === UserRole.SERVER) && actor.roomId) {
    return task.assigneeRoomId != null && actor.roomId === task.assigneeRoomId;
  }
  return false;
}

/**
 * Authorization for operations on a TEAM task that has no current assignee
 * (creating one, assigning it to its first member, or splitting it) — keyed
 * off the task's own teamSection rather than an assignee's room, since none
 * may exist yet. An ADMIN/SUPER_ADMIN may act on any section in their own
 * organization; a TEAM_LEAD only on their own section. Organization match is
 * checked first and unconditionally — isAdmin() alone must never be trusted
 * across organizations.
 */
export function canManageTeamTask(actor: TaskActorContext, task: TaskScopeContext): boolean {
  if (!isSameOrg(actor, task)) return false;
  if (isAdmin(actor)) return true;
  return actor.role === UserRole.TEAM_LEAD && Boolean(actor.roomLetter) && actor.roomLetter === (task.teamSection ?? null);
}

/** Can this actor change status/progress (excluding cancel)? */
export function canManageTask(actor: TaskActorContext, task: TaskScopeContext): boolean {
  if (!isSameOrg(actor, task)) return false;
  if (isAdmin(actor)) return true;
  if (actor.id === task.creatorId || actor.id === task.assigneeId) return true;
  return isTeamLeadInScope(actor, task);
}

/** Cancellation is narrower than general management — never the assignee alone. */
export function canCancelTask(actor: TaskActorContext, task: TaskScopeContext): boolean {
  if (!isSameOrg(actor, task)) return false;
  if (isAdmin(actor)) return true;
  if (actor.id === task.creatorId) return true;
  if (task.taskType === TaskType.TEAM && task.assigneeId == null) {
    return canManageTeamTask(actor, task);
  }
  return isTeamLeadInScope(actor, task);
}

/** Reassignment: org managers, or a Team Lead moving work within their own room. */
export function canReassignTask(
  actor: TaskActorContext,
  task: TaskScopeContext,
  newAssigneeRoomId?: string | null
): boolean {
  if (!isSameOrg(actor, task)) return false;
  if (isAdmin(actor)) return true;
  if (actor.role !== UserRole.TEAM_LEAD || !actor.roomId) return false;
  const oldInScope = task.assigneeRoomId != null && actor.roomId === task.assigneeRoomId;
  const newInScope = newAssigneeRoomId != null && actor.roomId === newAssigneeRoomId;
  return oldInScope && newInScope;
}

/**
 * Task creation eligibility (separate from route-level requireRole). SERVER
 * does not get general task-creation capability — only ADMIN/SUPER_ADMIN and
 * a TEAM_LEAD creating for their own section may create tasks.
 */
export function canCreateTaskFor(actor: TaskActorContext, assigneeRoomId?: string | null): boolean {
  if (isAdmin(actor)) return true;
  if (actor.role === UserRole.TEAM_LEAD) {
    return Boolean(actor.roomId) && assigneeRoomId != null && actor.roomId === assigneeRoomId;
  }
  return false;
}
