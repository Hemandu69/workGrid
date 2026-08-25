import { HealthResponse } from '../types/health';
import { Room } from '../types/room';
import { Task, TaskCampaign, TaskComment, TaskPriority, TaskHistoryEntry, TaskAnalytics } from '../types/task';
import { User } from '../types/auth';
import { Announcement } from '../types/announcement';
import { OrgEvent, OrgEventAnalytics, OrgEventResponseBreakdown, EventResponseChoice } from '../types/org-event';
import { NotificationReadState } from '../types/notification';
import { PaginatedResult, CursorResult } from '../types/pagination';
import { Team, TeamDetail, TeamPlacementPreview } from '../types/team';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export class ApiError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * `new URLSearchParams(obj)` stringifies every value with `String()`, so an
 * `undefined` filter becomes the literal query string "undefined" rather than
 * being omitted — which a strict backend (e.g. an enum column) then rejects.
 * This drops undefined/empty entries before serializing.
 */
function buildQueryParams(filters: Record<string, string | number | undefined>): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  return params;
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  token?: string
): Promise<T> {
  const url = `${API_BASE_URL.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;

  const headers: Record<string, string> = {
    ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...((options.headers as Record<string, string>) || {}),
  };

  try {
    const res = await fetch(url, {
      ...options,
      credentials: 'include', // Includes HttpOnly cookies
      headers,
    });

    const data = await res.json().catch(() => null);

    if (!res.ok) {
      throw new ApiError(
        res.status,
        data?.message || `Request failed with status ${res.status}`,
        data
      );
    }

    return data as T;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(0, error instanceof Error ? error.message : 'Network connection failed');
  }
}

export const apiClient = {
  // System Health
  getHealth: async (): Promise<HealthResponse> => {
    return request<HealthResponse>('/health');
  },
  getLiveness: async (): Promise<{ status: string }> => {
    return request<{ status: string }>('/health/live');
  },

  // Auth (Cookie-based session)
  login: async (email: string, password = 'password123'): Promise<{ message: string; user: User; token?: string }> => {
    return request<{ message: string; user: User; token?: string }>('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  },
  getMe: async (): Promise<User> => {
    return request<User>('/api/v1/auth/me');
  },
  logout: async (): Promise<{ message: string }> => {
    return request<{ message: string }>('/api/v1/auth/logout', {
      method: 'POST',
    });
  },
  register: async (data: { name: string; email: string; password: string; title?: string }): Promise<{ message: string; user: User }> => {
    return request<{ message: string; user: User }>('/api/v1/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
  checkEmailAvailability: async (email: string, signal?: AbortSignal): Promise<{ available: boolean }> => {
    return request<{ available: boolean }>(
      `/api/v1/auth/email-availability?email=${encodeURIComponent(email)}`,
      { signal }
    );
  },
  forgotPassword: async (email: string): Promise<{ message: string; resetToken?: string }> => {
    return request<{ message: string; resetToken?: string }>('/api/v1/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  },
  resetPassword: async (token: string, newPassword: string): Promise<{ message: string }> => {
    return request<{ message: string }>('/api/v1/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token, newPassword }),
    });
  },

  // Dashboard
  getDashboardSummary: async (): Promise<Record<string, unknown>> => {
    return request<Record<string, unknown>>('/api/v1/dashboard/summary');
  },

  // Rooms & Subrooms
  getRooms: async (): Promise<Room[]> => {
    return request<Room[]>('/api/v1/rooms');
  },
  getRoom: async (letter: string): Promise<Room> => {
    return request<Room>(`/api/v1/rooms/${letter}`);
  },
  updateSubroomCapacity: async (
    subroomId: string,
    memberCapacity: number,
    token?: string
  ): Promise<{ message: string; subroom: Record<string, unknown> }> => {
    return request(
      `/api/v1/rooms/subrooms/${subroomId}/capacity`,
      {
        method: 'PATCH',
        body: JSON.stringify({ memberCapacity }),
      },
      token
    );
  },

  // Dynamic Room/Subroom Assignment
  getRoomAssignment: async (personId: string, token?: string): Promise<RoomAssignment> => {
    return request<RoomAssignment>(`/api/v1/rooms/assignment/${personId}`, {}, token);
  },
  /** The current user's own section, subroom, and subroom partners — usable by any authenticated role, not just admins. */
  getMyRoomAssignment: async (token?: string): Promise<RoomAssignment> => {
    return request<RoomAssignment>('/api/v1/rooms/assignment/me', {}, token);
  },
  assignRoom: async (
    personId: string,
    data: { sectionLetter: string; subroomCode?: string },
    token?: string
  ): Promise<RoomAssignmentResult> => {
    return request<RoomAssignmentResult>(
      `/api/v1/rooms/assignment/${personId}`,
      { method: 'PATCH', body: JSON.stringify(data) },
      token
    );
  },
  clearRoomAssignment: async (personId: string, token?: string): Promise<RoomAssignmentResult> => {
    return request<RoomAssignmentResult>(`/api/v1/rooms/assignment/${personId}`, { method: 'DELETE' }, token);
  },

  // Teams & Event-Scoped Bulk Placement — a Team's roster is entirely
  // independent of Room/Subroom desk assignment above; placement here never
  // touches assignRoom/clearRoomAssignment.
  getTeams: async (params?: { eventId?: string } | string, token?: string): Promise<Team[]> => {
    let queryStr = '';
    let authToken = token;
    if (typeof params === 'string') {
      authToken = params;
    } else if (params?.eventId) {
      const query = buildQueryParams({ eventId: params.eventId });
      queryStr = `?${query.toString()}`;
    }
    return request<Team[]>(`/api/v1/teams${queryStr}`, {}, authToken);
  },
  createTeam: async (data: { name: string; leadId?: string }, token?: string): Promise<TeamDetail> =>
    request<TeamDetail>('/api/v1/teams', { method: 'POST', body: JSON.stringify(data) }, token),
  getTeam: async (teamId: string, token?: string): Promise<TeamDetail> =>
    request<TeamDetail>(`/api/v1/teams/${teamId}`, {}, token),
  updateTeam: async (
    teamId: string,
    data: { name?: string; leadId?: string | null },
    token?: string
  ): Promise<TeamDetail> =>
    request<TeamDetail>(`/api/v1/teams/${teamId}`, { method: 'PATCH', body: JSON.stringify(data) }, token),
  deleteTeam: async (teamId: string, token?: string): Promise<{ message: string }> =>
    request(`/api/v1/teams/${teamId}`, { method: 'DELETE' }, token),
  addTeamMember: async (teamId: string, userId: string, token?: string): Promise<TeamDetail> =>
    request<TeamDetail>(
      `/api/v1/teams/${teamId}/members`,
      { method: 'POST', body: JSON.stringify({ userId }) },
      token
    ),
  removeTeamMember: async (teamId: string, userId: string, token?: string): Promise<TeamDetail> =>
    request<TeamDetail>(`/api/v1/teams/${teamId}/members/${userId}`, { method: 'DELETE' }, token),

  getTeamPlacementPreview: async (
    teamId: string,
    params: { eventId: string; sectionLetter: string },
    token?: string
  ): Promise<TeamPlacementPreview> => {
    const query = buildQueryParams(params);
    return request<TeamPlacementPreview>(`/api/v1/teams/${teamId}/placement?${query.toString()}`, {}, token);
  },
  allocateTeam: async (
    teamId: string,
    data: { eventId: string; sectionLetter: string },
    token?: string
  ): Promise<TeamPlacementPreview> =>
    request<TeamPlacementPreview>(
      `/api/v1/teams/${teamId}/placement/allocate`,
      { method: 'POST', body: JSON.stringify(data) },
      token
    ),
  replaceTeamMember: async (
    teamId: string,
    data: { eventId: string; userId: string },
    token?: string
  ): Promise<{ removedUserId: string; replacedByUserId: string | null }> =>
    request(`/api/v1/teams/${teamId}/placement/replace`, { method: 'POST', body: JSON.stringify(data) }, token),
  overrideTeamPlacement: async (
    teamId: string,
    userId: string,
    data: { eventId: string; subroomCode: string },
    token?: string
  ): Promise<TeamPlacementPreview> =>
    request<TeamPlacementPreview>(
      `/api/v1/teams/${teamId}/placement/${userId}`,
      { method: 'PATCH', body: JSON.stringify(data) },
      token
    ),
  clearTeamPlacement: async (teamId: string, eventId: string, token?: string): Promise<{ message: string }> =>
    request(`/api/v1/teams/${teamId}/placement`, { method: 'DELETE', body: JSON.stringify({ eventId }) }, token),

  // Users Directory
  getUsers: async (
    filters: { role?: string; status?: string; search?: string; teamId?: string; limit?: number; offset?: number } = {}
  ): Promise<PaginatedResult<User>> => {
    const params = buildQueryParams(filters);
    return request<PaginatedResult<User>>(`/api/v1/users?${params.toString()}`);
  },
  getUser: async (id: string): Promise<User> => {
    return request<User>(`/api/v1/users/${id}`);
  },

  // Tasks
  getTasks: async (
    filters: {
      status?: string;
      priority?: string;
      assigneeId?: string;
      roomLetter?: string;
      campaignId?: string;
      search?: string;
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<PaginatedResult<Task>> => {
    const params = buildQueryParams(filters);
    return request<PaginatedResult<Task>>(`/api/v1/tasks?${params.toString()}`);
  },
  getTask: async (id: string): Promise<Task> => {
    return request<Task>(`/api/v1/tasks/${id}`);
  },
  createTask: async (taskData: Partial<Task>, token?: string, idempotencyKey?: string): Promise<Task> => {
    return request<Task>(
      '/api/v1/tasks',
      {
        method: 'POST',
        body: JSON.stringify(taskData),
        headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : undefined,
      },
      token
    );
  },
  updateTaskStatus: async (
    taskId: string,
    status: string,
    token?: string,
    reason?: string
  ): Promise<Task> => {
    return request<Task>(
      `/api/v1/tasks/${taskId}/status`,
      {
        method: 'PATCH',
        body: JSON.stringify({ status, reason }),
      },
      token
    );
  },
  addTaskComment: async (taskId: string, content: string, token?: string): Promise<TaskComment> => {
    return request<TaskComment>(
      `/api/v1/tasks/${taskId}/comments`,
      {
        method: 'POST',
        body: JSON.stringify({ content }),
      },
      token
    );
  },
  updateTaskProgress: async (taskId: string, progress: number, token?: string): Promise<Task> => {
    return request<Task>(
      `/api/v1/tasks/${taskId}/progress`,
      { method: 'PATCH', body: JSON.stringify({ progress }) },
      token
    );
  },
  reassignTask: async (
    taskId: string,
    assigneeId: string,
    reason?: string,
    token?: string
  ): Promise<Task> => {
    return request<Task>(
      `/api/v1/tasks/${taskId}/assignment`,
      { method: 'PATCH', body: JSON.stringify({ assigneeId, reason }) },
      token
    );
  },
  completeTask: async (taskId: string, token?: string): Promise<Task> => {
    return request<Task>(`/api/v1/tasks/${taskId}/complete`, { method: 'POST' }, token);
  },
  splitTeamTask: async (
    taskId: string,
    assignments: Array<{ assigneeId: string; title: string; description?: string; estimatedHours?: number }>,
    token?: string
  ): Promise<{ parent: Task; children: Task[] }> => {
    return request<{ parent: Task; children: Task[] }>(
      `/api/v1/tasks/${taskId}/split`,
      { method: 'POST', body: JSON.stringify({ assignments }) },
      token
    );
  },
  cancelTask: async (taskId: string, reason?: string, token?: string): Promise<Task> => {
    return request<Task>(
      `/api/v1/tasks/${taskId}/cancel`,
      { method: 'POST', body: JSON.stringify({ reason }) },
      token
    );
  },
  getTaskHistory: async (taskId: string, token?: string): Promise<TaskHistoryEntry[]> => {
    return request<TaskHistoryEntry[]>(`/api/v1/tasks/${taskId}/history`, {}, token);
  },
  getTaskAnalytics: async (token?: string): Promise<TaskAnalytics> => {
    return request<TaskAnalytics>('/api/v1/tasks/analytics', {}, token);
  },

  // Campaigns
  getCampaigns: async (): Promise<TaskCampaign[]> => {
    return request<TaskCampaign[]>('/api/v1/task-campaigns');
  },
  createCampaign: async (campaignData: Partial<TaskCampaign>, token?: string): Promise<TaskCampaign> => {
    return request<TaskCampaign>(
      '/api/v1/task-campaigns',
      {
        method: 'POST',
        body: JSON.stringify(campaignData),
      },
      token
    );
  },

  // Announcements
  getAnnouncements: async (
    filters: { status?: string; scope?: string; limit?: number; offset?: number } = {}
  ): Promise<PaginatedResult<Announcement>> => {
    const params = buildQueryParams(filters);
    return request<PaginatedResult<Announcement>>(`/api/v1/announcements?${params.toString()}`);
  },
  createAnnouncement: async (
    announcementData: Partial<Announcement>,
    token?: string,
    idempotencyKey?: string
  ): Promise<Announcement> => {
    return request<Announcement>(
      '/api/v1/announcements',
      {
        method: 'POST',
        body: JSON.stringify(announcementData),
        headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : undefined,
      },
      token
    );
  },
  updateAnnouncement: async (
    announcementId: string,
    data: Partial<{ title: string; content: string; scope: string; targetRoom: string }>,
    token?: string
  ): Promise<Announcement> => {
    return request<Announcement>(
      `/api/v1/announcements/${announcementId}`,
      { method: 'PATCH', body: JSON.stringify(data) },
      token
    );
  },
  deleteAnnouncement: async (announcementId: string, token?: string): Promise<void> => {
    await request<void>(`/api/v1/announcements/${announcementId}`, { method: 'DELETE' }, token);
  },
  setAnnouncementPinned: async (announcementId: string, pinned: boolean, token?: string): Promise<Announcement> => {
    return request<Announcement>(
      `/api/v1/announcements/${announcementId}/${pinned ? 'pin' : 'unpin'}`,
      { method: 'POST' },
      token
    );
  },

  // Availability — live operational status only (FREE/BUSY/PARTIALLY_AVAILABLE/
  // UNAVAILABLE). There is no recurring/hourly schedule any more; a person's
  // future plans are expressed as event attendance (see Organization Events
  // below), never as a generic time slot.
  getPeopleAvailability: async (
    params: {
      status?: string;
      role?: string;
      room?: string;
      search?: string;
    } = {},
    token?: string
  ): Promise<PeopleAvailabilityResponse> => {
    const searchParams = new URLSearchParams();
    if (params.status && params.status !== 'ALL') searchParams.append('status', params.status);
    if (params.role && params.role !== 'ALL') searchParams.append('role', params.role);
    if (params.room && params.room !== 'ALL') searchParams.append('room', params.room);
    if (params.search) searchParams.append('search', params.search);

    return request<PeopleAvailabilityResponse>(`/api/v1/availability/people?${searchParams.toString()}`, {}, token);
  },
  getPersonAvailabilityDetail: async (
    userId: string,
    token?: string
  ): Promise<PersonAvailabilityDetailResponse> => {
    return request<PersonAvailabilityDetailResponse>(`/api/v1/availability/people/${userId}`, {}, token);
  },

  // Operations Grid & Server Tracking
  getOperationalGrid: async (
    params: { room?: string; search?: string; eventId?: string } = {},
    token?: string
  ): Promise<OperationalGridResponse> => {
    const searchParams = new URLSearchParams();
    if (params.room && params.room !== 'ALL') searchParams.append('room', params.room);
    if (params.search) searchParams.append('search', params.search);
    if (params.eventId) searchParams.append('eventId', params.eventId);

    const query = searchParams.toString() ? `?${searchParams.toString()}` : '';
    return request<OperationalGridResponse>(`/api/v1/operations/grid${query}`, {}, token);
  },

  getEventDetail: async (eventId: string, token?: string): Promise<EventDetailResponse> => {
    return request<EventDetailResponse>(`/api/v1/operations/events/${eventId}`, {}, token);
  },

  updatePresence: async (
    data: {
      userId?: string;
      presenceState?: 'IN' | 'OUT' | 'UNKNOWN';
      currentLocationName?: string | null;
      currentLocationRoomId?: string | null;
      currentLocationSubroomId?: string | null;
    },
    token?: string
  ): Promise<{ userId: string; presenceState: string; currentLocation: string; arrivedAtIST?: string; lastSeenIST: string }> => {
    return request(
      '/api/v1/operations/presence',
      {
        method: 'POST',
        body: JSON.stringify(data),
      },
      token
    );
  },

  /**
   * Sets the authoritative operational availability for a person — omit
   * `personId` to change your own.
   */
  setAvailabilityStatus: async (
    state: AvailabilityState,
    personId?: string,
    token?: string
  ): Promise<{
    personId: string;
    name: string;
    availabilityState: AvailabilityState;
    availabilityLabel: string;
    presenceState: string;
    currentLocation: string;
  }> => {
    return request(
      '/api/v1/availability/status',
      {
        method: 'POST',
        body: JSON.stringify({ state, personId }),
      },
      token
    );
  },

  getPersonDetail: async (personId: string, token?: string): Promise<PersonAvailabilityDetailResponse> => {
    return request<PersonAvailabilityDetailResponse>(`/api/v1/operations/person/${personId}`, {}, token);
  },

  // ---------------------------------------------------------------------------
  // Global IN / OUT Attendance & Presence System
  // ---------------------------------------------------------------------------
  checkInAttendance: async (token?: string) => {
    return request<{
      state: 'IN';
      presenceState: string;
      arrivedAt: string;
      arrivedAtIST: string;
      durationSeconds: number;
      durationFormatted: string;
      isExistingSession: boolean;
      message: string;
    }>('/api/v1/attendance/in', {
      method: 'POST',
      body: JSON.stringify({}),
    }, token);
  },

  checkOutAttendance: async (token?: string) => {
    return request<{
      state: 'OUT';
      presenceState: string;
      arrivedAt?: string;
      arrivedAtIST?: string;
      leftAt: string;
      leftAtIST: string;
      durationSeconds: number;
      durationFormatted: string;
      isAlreadyOut?: boolean;
      message: string;
    }>('/api/v1/attendance/out', {
      method: 'POST',
      body: JSON.stringify({}),
    }, token);
  },

  getAttendanceMe: async (token?: string) => {
    return request<import('../types/attendance').AttendanceMeResponse>(
      '/api/v1/attendance/me',
      {},
      token
    );
  },

  getAttendanceHistory: async (days = 30, token?: string) => {
    return request<import('../types/attendance').AttendanceHistoryResponse>(
      `/api/v1/attendance/history?days=${days}`,
      {},
      token
    );
  },

  getAttendanceOverview: async (
    params: { role?: string; state?: string; search?: string } = {},
    token?: string
  ) => {
    const searchParams = new URLSearchParams();
    if (params.role && params.role !== 'ALL') searchParams.append('role', params.role);
    if (params.state && params.state !== 'ALL') searchParams.append('state', params.state);
    if (params.search) searchParams.append('search', params.search);

    const query = searchParams.toString() ? `?${searchParams.toString()}` : '';
    return request<import('../types/attendance').AttendanceOverviewResponse>(
      `/api/v1/attendance/overview${query}`,
      {},
      token
    );
  },

  // --- People Management Operations ---
  getHRDashboardStats: async (token?: string) => {
    return request<{
      totalEmployees: number;
      activeCount: number;
      pendingCount: number;
      suspendedCount: number;
      deactivatedCount: number;
      recentPending: Array<import('../types/auth').User>;
    }>('/api/v1/hr/dashboard', {}, token);
  },

  getPeopleDirectory: async (
    filters: { role?: string; accountStatus?: string; search?: string; limit?: number; offset?: number } = {},
    token?: string
  ) => {
    const searchParams = new URLSearchParams();
    if (filters.role && filters.role !== 'ALL') searchParams.append('role', filters.role);
    if (filters.accountStatus && filters.accountStatus !== 'ALL') searchParams.append('accountStatus', filters.accountStatus);
    if (filters.search) searchParams.append('search', filters.search);
    if (filters.limit !== undefined) searchParams.append('limit', String(filters.limit));
    if (filters.offset !== undefined) searchParams.append('offset', String(filters.offset));

    const query = searchParams.toString() ? `?${searchParams.toString()}` : '';
    return request<PaginatedResult<import('../types/auth').User>>(`/api/v1/hr/people${query}`, {}, token);
  },

  provisionUser: async (
    data: {
      name: string;
      email: string;
      title?: string;
      initialRole?: import('../types/auth').UserRole;
      capacityLimitHours?: number;
    },
    token?: string
  ) => {
    return request<import('../types/auth').User>('/api/v1/hr/users', {
      method: 'POST',
      body: JSON.stringify(data),
    }, token);
  },

  updateUserRole: async (
    userId: string,
    role: import('../types/auth').UserRole,
    reason?: string,
    token?: string
  ) => {
    return request<{
      user: import('../types/auth').User;
      audit: import('../types/auth').RoleAuditLog;
    }>(`/api/v1/hr/users/${userId}/role`, {
      method: 'PATCH',
      body: JSON.stringify({ role, reason }),
    }, token);
  },

  updateUserStatus: async (
    userId: string,
    accountStatus: import('../types/auth').AccountStatus,
    reason?: string,
    token?: string
  ) => {
    return request<import('../types/auth').User>(`/api/v1/hr/users/${userId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ accountStatus, reason }),
    }, token);
  },

  getRoleAuditLogs: async (targetUserId?: string, cursor?: string, token?: string) => {
    const searchParams = new URLSearchParams();
    if (targetUserId) searchParams.append('targetUserId', targetUserId);
    if (cursor) searchParams.append('cursor', cursor);
    const query = searchParams.toString() ? `?${searchParams.toString()}` : '';
    return request<CursorResult<import('../types/auth').RoleAuditLog>>(`/api/v1/hr/audit-logs${query}`, {}, token);
  },

  // ---------------------------------------------------------------------------
  // Notification Read State (persistent, per authenticated user)
  // ---------------------------------------------------------------------------
  getNotificationReadState: async (token?: string): Promise<NotificationReadState> => {
    return request<NotificationReadState>('/api/v1/notifications/read-state', {}, token);
  },
  markNotificationRead: async (
    notificationKey: string,
    token?: string
  ): Promise<{ notificationKey: string; readAt: string }> => {
    return request<{ notificationKey: string; readAt: string }>(
      `/api/v1/notifications/${encodeURIComponent(notificationKey)}/read`,
      { method: 'POST' },
      token
    );
  },
  markAllNotificationsRead: async (token?: string): Promise<{ readAllAt: string }> => {
    return request<{ readAllAt: string }>('/api/v1/notifications/read-all', { method: 'POST' }, token);
  },

  // ---------------------------------------------------------------------------
  // Organization Events & Attendance Polling
  // ---------------------------------------------------------------------------
  getEvents: async (status?: OrgEvent['status'], token?: string): Promise<OrgEvent[]> => {
    const query = status ? `?status=${status}` : '';
    return request<OrgEvent[]>(`/api/v1/events${query}`, {}, token);
  },
  getEvent: async (eventId: string, token?: string): Promise<OrgEvent> => {
    return request<OrgEvent>(`/api/v1/events/${eventId}`, {}, token);
  },
  createEvent: async (
    data: { title: string; description: string; date: string; time: string; endTime: string },
    token?: string,
    idempotencyKey?: string
  ): Promise<OrgEvent> => {
    return request<OrgEvent>(
      '/api/v1/events',
      { method: 'POST', body: JSON.stringify(data), headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : undefined },
      token
    );
  },
  updateEvent: async (
    eventId: string,
    data: Partial<{ title: string; description: string; date: string; time: string; endTime: string }>,
    token?: string
  ): Promise<OrgEvent> => {
    return request<OrgEvent>(`/api/v1/events/${eventId}`, { method: 'PATCH', body: JSON.stringify(data) }, token);
  },
  cancelEvent: async (eventId: string, token?: string): Promise<OrgEvent> => {
    return request<OrgEvent>(`/api/v1/events/${eventId}/cancel`, { method: 'POST' }, token);
  },
  completeEvent: async (eventId: string, token?: string): Promise<OrgEvent> => {
    return request<OrgEvent>(`/api/v1/events/${eventId}/complete`, { method: 'POST' }, token);
  },
  getEventAnalytics: async (eventId: string, token?: string): Promise<OrgEventAnalytics> => {
    return request<OrgEventAnalytics>(`/api/v1/events/${eventId}/analytics`, {}, token);
  },
  getEventResponses: async (eventId: string, token?: string): Promise<OrgEventResponseBreakdown> => {
    return request<OrgEventResponseBreakdown>(`/api/v1/events/${eventId}/responses`, {}, token);
  },
  updateEventResponse: async (
    eventId: string,
    response: EventResponseChoice,
    token?: string
  ): Promise<{ eventId: string; userId: string; response: EventResponseChoice; respondedAt: string }> => {
    return request(
      `/api/v1/events/${eventId}/response`,
      { method: 'PUT', body: JSON.stringify({ response }) },
      token
    );
  },
};

export interface PeopleAvailabilityResponse {
  summary: {
    totalPeople: number;
    freeCount: number;
    busyCount: number;
    partialCount: number;
    unavailableCount: number;
  };
  people: Array<{
    id: string;
    name: string;
    email: string;
    role: string;
    avatarUrl?: string;
    title?: string;
    room?: string;
    subroom?: string;
    currentLocation?: string;
    attendanceState: 'IN' | 'OUT' | 'UNKNOWN';
    presenceState: 'IN' | 'OUT' | 'UNKNOWN';
    arrivedAt?: string;
    arrivedAtIST?: string;
    leftAt?: string;
    leftAtIST?: string;
    currentDurationFormatted?: string;
    lastSeenAt?: string;
    lastSeenAtIST?: string;
    status: 'FREE' | 'BUSY' | 'PARTIALLY_AVAILABLE' | 'UNAVAILABLE';
    statusLabel: string;
    reason: string;
    activeTask?: {
      id: string;
      title: string;
      priority: string;
      dueDate?: string;
    };
  }>;
}

export interface RoomAssignment {
  personId: string;
  name: string;
  role: string;
  section: string | null; // e.g. "B"
  subroom: string | null; // e.g. "B3" — always null for SERVER role
  /** Other people currently assigned to the same subroom, derived live. */
  partners: Array<{ id: string; name: string }>;
}

export interface RoomAssignmentResult {
  current: RoomAssignment;
  previousSection: string | null;
  previousSubroom: string | null;
}

export interface PersonAvailabilityDetailResponse {
  person: {
    id: string;
    name: string;
    email: string;
    role: string;
    status: string;
    avatarUrl?: string;
    title?: string;
    room?: string;
    subroom?: string;
    currentLocation?: string;
    attendanceState: 'IN' | 'OUT' | 'UNKNOWN';
    presenceState: 'IN' | 'OUT' | 'UNKNOWN';
    arrivedAt?: string;
    arrivedAtIST?: string;
    leftAt?: string;
    leftAtIST?: string;
    currentDurationFormatted?: string;
    lastSeenAt?: string;
    lastSeenAtIST?: string;
    capacityLimitHours: number;
    currentAllocatedHours: number;
    availabilityState?: AvailabilityState;
  };
  currentStatus: {
    state: 'FREE' | 'BUSY' | 'PARTIALLY_AVAILABLE' | 'UNAVAILABLE';
    label?: string;
    reason: string;
    room?: string;
    subroom?: string;
  };
  upcomingCommitments: Array<{
    id: string;
    title: string;
    description?: string;
    status: string;
    priority: TaskPriority;
    estimatedHours?: number;
    allocatedHours?: number;
    dueDate?: string;
    dueDateFormatted: string;
    room: string;
    subroom: string;
  }>;
}

export type AvailabilityState = 'FREE' | 'BUSY' | 'PARTIALLY_AVAILABLE' | 'UNAVAILABLE';

export type SupervisionState =
  | 'PRESENT_IN_EVENT'
  | 'IN_ROOM_DIFFERENT_SUBROOM'
  | 'OUTSIDE_ROOM'
  | 'UNKNOWN'
  | 'NOT_REQUIRED';

export interface GridMemberItem {
  id: string;
  name: string;
  role: 'SUPER_ADMIN' | 'ADMIN' | 'SERVER' | 'MEMBER';
  title?: string;
  avatarUrl?: string;
  presenceState: 'IN' | 'OUT' | 'UNKNOWN';
  presenceLabel: string;
  availabilityState: AvailabilityState;
  availabilityLabel: string;
  currentLocation: string;
  arrivedAt?: string;
  arrivedAtIST?: string;
  leftAt?: string;
  leftAtIST?: string;
  durationInWorkGrid?: string;
  lastSeenIST: string;
  activeTaskId?: string;
  activeTaskTitle?: string;
  eventResponse?: 'ATTENDING' | 'MAYBE' | 'NOT_ATTENDING' | 'NO_RESPONSE';
}

export interface GridServerItem {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
  assignedRoomLetter: string;
  presenceState: 'IN' | 'OUT' | 'UNKNOWN';
  availabilityState: AvailabilityState;
  availabilityLabel: string;
  currentLocation: string;
  isCurrentlyInSubroom: boolean;
  supervisoryPosition?: 1 | 3 | 5;
  arrivedAtIST?: string;
  lastSeenIST: string;
  eventResponse?: 'ATTENDING' | 'MAYBE' | 'NOT_ATTENDING' | 'NO_RESPONSE';
}

export interface GridSubroomCell {
  id: string;
  code: string;
  number: number;
  roomLetter: string;
  memberCapacity: number;
  serverSeatCount: number;
  occupancyCount: number;
  members: GridMemberItem[];
  serversPresent: GridServerItem[];
  activeRoomEvent?: {
    id: string;
    title: string;
    startTimeIST: string;
    endTimeIST: string;
    serverCoverageSummary: string;
  };
  /** Team-based bulk allocation for the selected event — independent of `members`/`occupancyCount`. */
  eventPlacement?: {
    teamId: string;
    teamName: string;
    members: Array<{ id: string; name: string; avatarUrl?: string }>;
  };
}

export interface GridRoomColumn {
  id: string;
  letter: string;
  name: string;
  assignedServers: Array<{
    id: string;
    name: string;
    presenceState: 'IN' | 'OUT' | 'UNKNOWN';
    availabilityState: AvailabilityState;
    availabilityLabel: string;
    currentLocation: string;
    preferredPosition?: 1 | 3 | 5;
    assignedPosition?: 1 | 3 | 5;
    eventResponse?: 'ATTENDING' | 'MAYBE' | 'NOT_ATTENDING' | 'NO_RESPONSE';
  }>;
  serverPresenceCount: number;
  serverTotalCount: number;
  serverCoverageSummary: string;
  subrooms: GridSubroomCell[];
}

export interface SelectedEventContext {
  id: string;
  title: string;
  description?: string;
  dateIST: string;
  timeIST: string;
  endTimeIST: string;
  status: string;
  totalEligible: number;
  attendingCount: number;
  maybeCount: number;
  notAttendingCount: number;
  noResponseCount: number;
}

export interface AvailableEventSummary {
  id: string;
  title: string;
  dateIST: string;
  timeIST: string;
  endTimeIST: string;
  status: string;
}

export interface OperationalGridResponse {
  currentTimeIST: string;
  selectedEvent: SelectedEventContext | null;
  availableEvents: AvailableEventSummary[];
  activeCompanyEvent?: {
    id: string;
    title: string;
    description?: string;
    scope: 'COMPANY' | 'ROOM';
    locations: string[];
    startTimeIST: string;
    endTimeIST: string;
    requiredServersCount?: number;
    serversPresentCount: number;
    serverCoverageSummary: string;
  };
  totalRooms: number;
  totalSubrooms: number;
  totalPeoplePresent: number;
  totalServersPresent: number;
  availabilitySummary: {
    totalPeople: number;
    freeCount: number;
    busyCount: number;
    partialCount: number;
    unavailableCount: number;
  };
  rooms: GridRoomColumn[];
}

export interface EventDetailResponse {
  id: string;
  title: string;
  description?: string;
  scope: 'COMPANY' | 'ROOM';
  status: string;
  room?: string;
  subroom?: string;
  locations: string[];
  startTimeIST: string;
  endTimeIST: string;
  dateFormatted: string;
  participantCount: number;
  participants: Array<{
    id: string;
    name: string;
    role: string;
    avatarUrl?: string;
    room: string;
    subroom: string;
    currentLocation: string;
    presenceState: 'IN' | 'OUT' | 'UNKNOWN';
  }>;
  serverCoverage: {
    totalServers: number;
    present: number;
    inDifferentSubroom: number;
    outside: number;
    unknown: number;
    notRequired: number;
    coveragePercentage: number;
    servers: Array<{
      id: string;
      name: string;
      email: string;
      avatarUrl?: string;
      assignedRoom: string;
      currentLocation: string;
      presenceState: 'IN' | 'OUT' | 'UNKNOWN';
      supervisionState: SupervisionState;
      lastSeenIST: string;
    }>;
  };
}
