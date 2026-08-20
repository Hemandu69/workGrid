import { HealthResponse } from '../types/health';
import { Room } from '../types/room';
import { Task, TaskCampaign, TaskComment, TaskPriority } from '../types/task';
import { User, AuthSession } from '../types/auth';
import { Announcement } from '../types/announcement';
import { WeeklyAvailabilitySchedule } from '../types/availability';

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

async function request<T>(
  path: string,
  options: RequestInit = {},
  token?: string
): Promise<T> {
  const url = `${API_BASE_URL.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...((options.headers as Record<string, string>) || {}),
  };

  try {
    const res = await fetch(url, {
      ...options,
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

  // Auth
  login: async (email: string, password = 'password123'): Promise<AuthSession> => {
    return request<AuthSession>('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  },
  getMe: async (token: string): Promise<User> => {
    return request<User>('/api/v1/auth/me', {}, token);
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

  // Users Directory
  getUsers: async (filters: { role?: string; status?: string; search?: string } = {}): Promise<User[]> => {
    const params = new URLSearchParams(filters as Record<string, string>);
    return request<User[]>(`/api/v1/users?${params.toString()}`);
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
    } = {}
  ): Promise<Task[]> => {
    const params = new URLSearchParams(filters as Record<string, string>);
    return request<Task[]>(`/api/v1/tasks?${params.toString()}`);
  },
  getTask: async (id: string): Promise<Task> => {
    return request<Task>(`/api/v1/tasks/${id}`);
  },
  createTask: async (taskData: Partial<Task>, token?: string): Promise<Task> => {
    return request<Task>(
      '/api/v1/tasks',
      {
        method: 'POST',
        body: JSON.stringify(taskData),
      },
      token
    );
  },
  updateTaskStatus: async (
    taskId: string,
    status: string,
    allocatedHours?: number,
    token?: string
  ): Promise<Task> => {
    return request<Task>(
      `/api/v1/tasks/${taskId}/status`,
      {
        method: 'PATCH',
        body: JSON.stringify({ status, allocatedHours }),
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
  getAnnouncements: async (filters: { status?: string; scope?: string } = {}): Promise<Announcement[]> => {
    const params = new URLSearchParams(filters as Record<string, string>);
    return request<Announcement[]>(`/api/v1/announcements?${params.toString()}`);
  },
  createAnnouncement: async (
    announcementData: Partial<Announcement>,
    token?: string
  ): Promise<Announcement> => {
    return request<Announcement>(
      '/api/v1/announcements',
      {
        method: 'POST',
        body: JSON.stringify(announcementData),
      },
      token
    );
  },

  // Availability
  getUserAvailability: async (userId: string): Promise<WeeklyAvailabilitySchedule> => {
    return request<WeeklyAvailabilitySchedule>(`/api/v1/users/${userId}/availability`);
  },
  updateUserAvailability: async (
    userId: string,
    schedule: { slots: { day: string; hour: number; state: string; taskId?: string }[]; timezone?: string },
    token?: string
  ): Promise<WeeklyAvailabilitySchedule> => {
    return request<WeeklyAvailabilitySchedule>(
      `/api/v1/users/${userId}/availability`,
      {
        method: 'PUT',
        body: JSON.stringify(schedule),
      },
      token
    );
  },
  getPeopleAvailability: async (
    params: {
      date?: string;
      startHour?: number;
      endHour?: number;
      status?: string;
      role?: string;
      room?: string;
      search?: string;
    } = {},
    token?: string
  ): Promise<PeopleAvailabilityResponse> => {
    const searchParams = new URLSearchParams();
    if (params.date) searchParams.append('date', params.date);
    if (params.startHour !== undefined) searchParams.append('startHour', params.startHour.toString());
    if (params.endHour !== undefined) searchParams.append('endHour', params.endHour.toString());
    if (params.status && params.status !== 'ALL') searchParams.append('status', params.status);
    if (params.role && params.role !== 'ALL') searchParams.append('role', params.role);
    if (params.room && params.room !== 'ALL') searchParams.append('room', params.room);
    if (params.search) searchParams.append('search', params.search);

    return request<PeopleAvailabilityResponse>(`/api/v1/availability/people?${searchParams.toString()}`, {}, token);
  },
  getPersonAvailabilityDetail: async (
    userId: string,
    startDate?: string,
    token?: string
  ): Promise<PersonAvailabilityDetailResponse> => {
    const query = startDate ? `?startDate=${startDate}` : '';
    return request<PersonAvailabilityDetailResponse>(`/api/v1/availability/people/${userId}${query}`, {}, token);
  },
};

export interface PeopleAvailabilityResponse {
  timeSlot: {
    date: string;
    startHour: number;
    endHour: number;
    startFormatted: string;
    endFormatted: string;
    timezone: string;
  };
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
    status: 'FREE' | 'BUSY' | 'PARTIALLY_AVAILABLE' | 'UNAVAILABLE';
    statusLabel: string;
    reason: string;
    until?: string;
    freeWindow?: string;
    activeTask?: {
      id: string;
      title: string;
      priority: string;
      dueDate?: string;
    };
  }>;
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
    capacityLimitHours: number;
    currentAllocatedHours: number;
  };
  currentStatus: {
    state: 'FREE' | 'BUSY' | 'PARTIALLY_AVAILABLE' | 'UNAVAILABLE';
    reason: string;
    room?: string;
    subroom?: string;
    until?: string;
  };
  nextFree: {
    isCurrentlyFree: boolean;
    statusText: string;
    nextFreeDate?: string;
    nextFreeTime?: string;
    durationFormatted?: string;
  };
  weeklyTimeline: Array<{
    date: string;
    dayName: string;
    dayOfWeek: string;
    isToday: boolean;
    status: 'FREE' | 'BUSY' | 'PARTIALLY_AVAILABLE' | 'UNAVAILABLE';
    windows: Array<{
      startHour: number;
      endHour: number;
      startFormatted: string;
      endFormatted: string;
      state: 'FREE' | 'BUSY' | 'PARTIALLY_AVAILABLE' | 'UNAVAILABLE';
      label: string;
      reason?: string;
    }>;
  }>;
  upcomingCommitments: Array<{
    id: string;
    title: string;
    description?: string;
    status: string;
    priority: TaskPriority;
    estimatedHours: number;
    allocatedHours: number;
    dueDate?: string;
    dueDateFormatted: string;
    room: string;
    subroom: string;
  }>;
}
